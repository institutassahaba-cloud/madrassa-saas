"use client"
import { useState, useEffect } from "react"
import { Loader2, ChevronUp, ChevronDown, Plus, Trash2 } from "lucide-react"
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription,
} from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { whatsappLink } from "@/lib/phone"

interface StudentDialogProps {
  open: boolean
  onClose: () => void
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  student: any | null
  groups: { id: string; name: string; teacherId: string | null }[]
  teachers: { id: string; name: string; phone?: string | null; meetingLink?: string | null }[]
  // Paiements détectés non traités : permet de lier le paiement de chaque nouvel
  // élève à un virement/PayPal reçu (validé + retiré des non traités d'un coup).
  paymentMatches?: {
    id: string
    source: string
    receivedAmount: number
    detectedPayerName: string | null
    paymentDate: string | Date | null
  }[]
  // Paiement pré-sélectionné pour le 1er élève (celui d'où l'on a cliqué « nouvel élève »).
  preselectedPaymentMatchId?: string
}

const EMPTY_IDENTITY = {
  firstName: "", lastName: "", gender: "MALE", phone: "", email: "",
  level: "", parentName: "", parentPhone: "", parentEmail: "",
}

const EMPTY_SHARED = {
  subject: "", monthlyFee: "",
  paymentGraceAllowed: false,
  hourlyRate: "", lessonsPerWeek: "", duration: "", startSession: "",
  groupId: "", notes: "", status: "ACTIVE", recontactDate: "",
}

const EMPTY_EXTRA = {
  subject: "", groupId: "", hourlyRate: "", lessonsPerWeek: "", duration: "", startSession: "",
  newClassName: "",
}

// Objet + message d'accueil par défaut de l'e-mail de bienvenue (modifiables avant envoi).
const DEFAULT_WELCOME_SUBJECT = "Bienvenue à l'Institut As-Sahaba"
const DEFAULT_WELCOME_INTRO =
  "Nous sommes très heureux de vous accueillir à l'Institut As-Sahaba. Qu'Allah vous facilite un apprentissage béni et sincère."

// Tarif mensuel = tarif horaire × durée d'un cours (h) × cours par semaine × 4 semaines.
// Ex : 7 €/h, cours d'1h, 2 cours/sem → 7 × 1 × 2 × 4 = 56 €.
function computeMonthlyFee(hourlyRate: string, duration: string, lessonsPerWeek: string): number {
  const rate = Number(hourlyRate)
  const hours = parseFloat((duration || "").replace(",", "."))
  const perWeek = Number(lessonsPerWeek)
  if (!Number.isFinite(rate) || !Number.isFinite(hours) || !Number.isFinite(perWeek)) return 0
  if (rate <= 0 || hours <= 0 || perWeek <= 0) return 0
  return Math.round(rate * hours * perWeek * 4 * 100) / 100
}

const todayIso = () => new Date().toISOString().slice(0, 10)

const EMPTY_INITIAL_PAYMENT = {
  received: false,
  method: "Virement",
  paidDate: todayIso(),
  reference: "",
}

type PaymentAliasFormRow = {
  id: string
  type: "PAYPAL" | "WISE"
  alias: string
  // Ligne « principale » synchronisée automatiquement (Prénom Nom de l'élève ou payeur
  // du paiement associé). Passe à false dès que le directeur la modifie à la main.
  auto?: boolean
}

const makeId = () => Math.random().toString(36).slice(2)
// Ligne d'alias principale d'un élève : suit son nom (ou le paiement associé) par défaut.
function createAutoAliasRow(): PaymentAliasFormRow {
  return { id: makeId(), type: "WISE", alias: "", auto: true }
}

type CourseSlotDraft = {
  id: string
  dayOfWeek: string
  startTime: string
}

type ExtraCourseDraft = typeof EMPTY_EXTRA & {
  id: string
  teacherId: string
  joinExisting: boolean
  slots: CourseSlotDraft[]
}

const SUBJECTS = ["Coran", "Nouraniya", "Arabe", "Langue arabe", "Tajwid", "Fiqh", "Autre"]
const ALL_TEACHERS_VALUE = "__all_teachers__"
const NO_SUBJECT_VALUE = "__no_subject__"
const DAYS = [
  { value: "1", label: "Lundi" }, { value: "2", label: "Mardi" }, { value: "3", label: "Mercredi" },
  { value: "4", label: "Jeudi" }, { value: "5", label: "Vendredi" }, { value: "6", label: "Samedi" },
  { value: "0", label: "Dimanche" },
]

function createSlotDraft(): CourseSlotDraft {
  return { id: Math.random().toString(36).slice(2), dayOfWeek: "", startTime: "" }
}

function createExtraCourseDraft(): ExtraCourseDraft {
  return {
    id: Math.random().toString(36).slice(2),
    teacherId: "",
    joinExisting: false,
    slots: [createSlotDraft()],
    ...EMPTY_EXTRA,
  }
}

function normalizedLessonCount(value: string) {
  const count = Number(value)
  if (!Number.isFinite(count) || count < 1) return 1
  return Math.min(Math.floor(count), 6)
}

function syncSlotsToCount(slots: CourseSlotDraft[], countValue: string) {
  const count = normalizedLessonCount(countValue)
  if (slots.length === count) return slots
  if (slots.length > count) return slots.slice(0, count)
  return [...slots, ...Array.from({ length: count - slots.length }, () => createSlotDraft())]
}

function toSchedulePayload(slots: CourseSlotDraft[]) {
  return slots
    .filter((slot) => slot.dayOfWeek !== "" && slot.startTime)
    .map((slot) => ({ dayOfWeek: Number(slot.dayOfWeek), startTime: slot.startTime }))
}

export function StudentDialog({ open, onClose, student, groups, teachers, paymentMatches, preselectedPaymentMatchId }: StudentDialogProps) {
  const [studentCount, setStudentCount] = useState(1)
  const [identities, setIdentities] = useState([{ ...EMPTY_IDENTITY }])
  const [shared, setShared] = useState({ ...EMPTY_SHARED })
  const [teacherId, setTeacherId] = useState("")
  const [joinExisting, setJoinExisting] = useState(false)
  const [newClassName, setNewClassName] = useState("")
  // Noms de paiement PAR élève : chaque élève a sa propre liste, dont une ligne
  // principale auto (Prénom Nom ou payeur du paiement associé).
  const [aliasesByStudent, setAliasesByStudent] = useState<PaymentAliasFormRow[][]>([[createAutoAliasRow()]])
  const [initialPayment, setInitialPayment] = useState({ ...EMPTY_INITIAL_PAYMENT })
  // Envoi de l'e-mail de bienvenue à la création (coordonnées WhatsApp + Zoom des profs).
  const [sendWelcomeEmail, setSendWelcomeEmail] = useState(true)
  // Objet + message d'accueil de l'e-mail de bienvenue, modifiables avant l'envoi.
  const [welcomeSubject, setWelcomeSubject] = useState(DEFAULT_WELCOME_SUBJECT)
  const [welcomeIntro, setWelcomeIntro] = useState(DEFAULT_WELCOME_INTRO)
  // Un paiement détecté à associer par élève (index aligné sur `identities`).
  // L'élève 1 est pré-rempli avec le paiement cliqué ; les suivants sont optionnels.
  const [matchIds, setMatchIds] = useState<string[]>([""])
  const [primarySlots, setPrimarySlots] = useState<CourseSlotDraft[]>([createSlotDraft()])
  const [extraCourses, setExtraCourses] = useState<ExtraCourseDraft[]>([])
  const [groupInfo, setGroupInfo] = useState<{ count: number; subject?: string; lessonsPerWeek?: number; duration?: string; newRate?: number } | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState("")

  /* eslint-disable react-hooks/set-state-in-effect */
  useEffect(() => {
    if (student) {
      setStudentCount(1)
      setIdentities([{
        firstName: student.firstName ?? "",
        lastName: student.lastName ?? "",
        gender: student.gender ?? "MALE",
        phone: student.phone ?? "",
        email: student.email ?? "",
        level: student.level ?? "",
        parentName: student.parentName ?? "",
        parentPhone: student.parentPhone ?? "",
        parentEmail: student.parentEmail ?? "",
      }])
      setShared({
        subject: student.subject ?? "",
        monthlyFee: String(student.monthlyFee ?? ""),
        paymentGraceAllowed: Boolean(student.paymentGraceAllowed),
        hourlyRate: student.hourlyRate != null ? String(student.hourlyRate) : "",
        lessonsPerWeek: student.lessonsPerWeek != null ? String(student.lessonsPerWeek) : "",
        duration: student.duration ?? "",
        startSession: "",
        groupId: student.group?.id ?? "",
        notes: student.notes ?? "",
        status: student.status ?? "ACTIVE",
        recontactDate: student.recontactDate ? student.recontactDate.toString().slice(0, 10) : "",
      })
      const existingAliases: PaymentAliasFormRow[] = Array.isArray(student.paymentAliases)
        ? student.paymentAliases.map((alias: { id?: string; type?: string; alias?: string }) => ({
          id: alias.id || makeId(),
          type: alias.type === "PAYPAL" ? "PAYPAL" : "WISE",
          alias: alias.alias || "",
        }))
        : []
      if (existingAliases.length > 0) {
        setAliasesByStudent([existingAliases])
      } else if (student.payerName) {
        setAliasesByStudent([[{
          id: makeId(),
          type: student.paymentType === "PAYPAL" ? "PAYPAL" : "WISE",
          alias: student.payerName,
        }]])
      } else {
        setAliasesByStudent([[createAutoAliasRow()]])
      }
      const currentGroup = groups.find(g => g.id === student.group?.id)
      setTeacherId(currentGroup?.teacherId ?? "")
      setJoinExisting(Boolean(student.group?.id))
      setNewClassName("")
      setPrimarySlots([createSlotDraft()])
      setInitialPayment({ ...EMPTY_INITIAL_PAYMENT, paidDate: todayIso() })
      setMatchIds([""])
    } else {
      setStudentCount(1)
      setIdentities([{ ...EMPTY_IDENTITY }])
      setShared({ ...EMPTY_SHARED })
      setTeacherId("")
      setAliasesByStudent([[createAutoAliasRow()]])
      setInitialPayment({ ...EMPTY_INITIAL_PAYMENT, paidDate: todayIso() })
      // Élève 1 pré-rempli avec le paiement d'où l'on a cliqué « nouvel élève ».
      setMatchIds([preselectedPaymentMatchId || ""])
      setJoinExisting(false)
      setNewClassName("")
      setPrimarySlots([createSlotDraft()])
      setWelcomeSubject(DEFAULT_WELCOME_SUBJECT)
      setWelcomeIntro(DEFAULT_WELCOME_INTRO)
    }
    setExtraCourses([])
    setError("")
  }, [student, open, groups, preselectedPaymentMatchId])
  /* eslint-enable react-hooks/set-state-in-effect */

  // Réinitialise le formulaire à la demande (bouton « Effacer le formulaire »), sans
  // le fermer. Ne s'utilise qu'en création : remet tous les champs à vide.
  function resetCreateForm() {
    setStudentCount(1)
    setIdentities([{ ...EMPTY_IDENTITY }])
    setShared({ ...EMPTY_SHARED })
    setTeacherId("")
    setAliasesByStudent([[createAutoAliasRow()]])
    setInitialPayment({ ...EMPTY_INITIAL_PAYMENT, paidDate: todayIso() })
    setMatchIds([preselectedPaymentMatchId || ""])
    setJoinExisting(false)
    setNewClassName("")
    setPrimarySlots([createSlotDraft()])
    setExtraCourses([])
    setWelcomeSubject(DEFAULT_WELCOME_SUBJECT)
    setWelcomeIntro(DEFAULT_WELCOME_INTRO)
    setError("")
  }

  function updateCount(newCount: number) {
    if (newCount < 1) return
    setStudentCount(newCount)
    setIdentities((prev) => {
      if (newCount > prev.length) {
        return [...prev, ...Array.from({ length: newCount - prev.length }, () => ({ ...EMPTY_IDENTITY }))]
      }
      return prev.slice(0, newCount)
    })
    setMatchIds((prev) => {
      if (newCount > prev.length) {
        return [...prev, ...Array.from({ length: newCount - prev.length }, () => "")]
      }
      return prev.slice(0, newCount)
    })
    setAliasesByStudent((prev) => {
      if (newCount > prev.length) {
        return [...prev, ...Array.from({ length: newCount - prev.length }, () => [createAutoAliasRow()])]
      }
      return prev.slice(0, newCount)
    })
  }

  function setIdentity(idx: number, key: string, value: string) {
    setIdentities((prev) => prev.map((item, i) => i === idx ? { ...item, [key]: value } : item))
  }

  function setMatchId(idx: number, value: string) {
    setMatchIds((prev) => {
      const next = [...prev]
      while (next.length <= idx) next.push("")
      next[idx] = value
      return next
    })
  }

  // Paiements encore sélectionnables pour l'élève `idx` : on retire ceux déjà
  // choisis par les autres élèves du binôme pour éviter d'associer deux fois le même.
  function availableMatches(idx: number) {
    const taken = new Set(matchIds.filter((_, j) => j !== idx).filter(Boolean))
    return (paymentMatches ?? []).filter((match) => !taken.has(match.id))
  }

  function setSharedField(key: string, value: string | boolean) {
    setShared((f) => ({ ...f, [key]: value }))
    if (key === "lessonsPerWeek" && typeof value === "string") {
      setPrimarySlots((slots) => syncSlotsToCount(slots, value))
    }
  }

  function addPaymentAlias(studentIdx: number, type: "PAYPAL" | "WISE") {
    setAliasesByStudent((prev) => prev.map((list, i) =>
      i === studentIdx ? [...list, { id: makeId(), type, alias: "" }] : list
    ))
  }

  // Édition d'une ligne d'alias : dès qu'on y touche, elle cesse d'être « auto ».
  function updatePaymentAlias(studentIdx: number, id: string, key: "type" | "alias", value: string) {
    setAliasesByStudent((prev) => prev.map((list, i) => {
      if (i !== studentIdx) return list
      return list.map((row) => {
        if (row.id !== id) return row
        if (key === "type") return { ...row, type: value === "PAYPAL" ? "PAYPAL" : "WISE", auto: false }
        return { ...row, alias: value, auto: false }
      })
    }))
  }

  function removePaymentAlias(studentIdx: number, id: string) {
    setAliasesByStudent((prev) => prev.map((list, i) =>
      i === studentIdx ? list.filter((row) => row.id !== id) : list
    ))
  }

  // Paiement détecté sélectionné pour l'élève `idx` (pilote la ligne principale).
  function matchForStudent(idx: number) {
    const id = matchIds[idx]
    if (!id) return null
    return (paymentMatches ?? []).find((m) => m.id === id) ?? null
  }

  function studentFullName(idx: number) {
    const it = identities[idx]
    return `${it?.firstName ?? ""} ${it?.lastName ?? ""}`.trim()
  }

  // Valeur affichée/envoyée d'une ligne d'alias. La ligne principale (isPrincipal) suit,
  // dans l'ordre : le paiement associé (verrouillée), sinon le nom de l'élève tant qu'elle
  // reste « auto », sinon la saisie manuelle.
  function effectiveAlias(idx: number, row: PaymentAliasFormRow, isPrincipal: boolean) {
    if (isPrincipal) {
      const match = matchForStudent(idx)
      if (match) {
        return {
          type: match.source === "PAYPAL" ? "PAYPAL" as const : "WISE" as const,
          alias: match.detectedPayerName || studentFullName(idx),
          locked: true,
        }
      }
      if (row.auto) return { type: row.type, alias: studentFullName(idx), locked: false }
    }
    return { type: row.type, alias: row.alias, locked: false }
  }

  // Alias à envoyer pour l'élève `idx` : valeurs effectives, lignes vides ignorées.
  function aliasesForSubmit(idx: number) {
    return (aliasesByStudent[idx] ?? [])
      .map((row, j) => {
        const eff = effectiveAlias(idx, row, j === 0)
        return { type: eff.type, alias: eff.alias.trim() }
      })
      .filter((a) => a.alias.length > 0)
  }

  function setInitialPaymentField(key: keyof typeof EMPTY_INITIAL_PAYMENT, value: string | boolean) {
    setInitialPayment((current) => ({ ...current, [key]: value }))
  }

  function updatePrimarySlot(id: string, key: "dayOfWeek" | "startTime", value: string) {
    setPrimarySlots((slots) => slots.map((slot) => slot.id === id ? { ...slot, [key]: value } : slot))
  }

  function addExtraCourse() {
    setExtraCourses((courses) => [...courses, createExtraCourseDraft()])
  }

  function removeExtraCourse(id: string) {
    setExtraCourses((courses) => courses.filter((course) => course.id !== id))
  }

  function updateExtraCourse(id: string, key: keyof ExtraCourseDraft, value: string) {
    setExtraCourses((courses) => courses.map((course) => {
      if (course.id !== id) return course
      const updated = { ...course, [key]: value }
      if (key === "lessonsPerWeek") {
        updated.slots = syncSlotsToCount(course.slots, value)
      }
      if (key === "teacherId") {
        updated.groupId = ""
      }
      return updated
    }))
  }

  // Bascule « Nouvelle classe / Intégrer une classe » pour une matière supplémentaire,
  // en repartant proprement (on vide le champ inverse) — même logique que le prof principal.
  function setExtraCourseJoin(id: string, joinExisting: boolean) {
    setExtraCourses((courses) => courses.map((course) => {
      if (course.id !== id) return course
      return { ...course, joinExisting, groupId: "", newClassName: "" }
    }))
  }

  function updateExtraSlot(courseId: string, slotId: string, key: "dayOfWeek" | "startTime", value: string) {
    setExtraCourses((courses) => courses.map((course) => {
      if (course.id !== courseId) return course
      return {
        ...course,
        slots: course.slots.map((slot) => slot.id === slotId ? { ...slot, [key]: value } : slot),
      }
    }))
  }

  const filteredGroups = teacherId ? groups.filter(g => g.teacherId === teacherId) : groups
  const lockedByGroup = joinExisting && !!shared.groupId && !!groupInfo && groupInfo.count > 0
  // Tarif mensuel calculé (affiché en lecture seule) : tarif h × durée × cours/sem × 4.
  const computedMonthlyFee = computeMonthlyFee(shared.hourlyRate, shared.duration, shared.lessonsPerWeek)

  // Résout le groupId à utiliser : la classe existante sélectionnée, ou une classe fraîchement
  // créée si le directeur a choisi "Nouvelle classe". Évite qu'un élève se retrouve détaché de
  // tout professeur/classe (silencieusement) faute d'avoir resélectionné une classe.
  async function resolveGroupId(): Promise<string> {
    if (joinExisting) {
      if (!shared.groupId) throw new Error("Merci de sélectionner une classe pour ce professeur (ou de créer une nouvelle classe).")
      return shared.groupId
    }
    if (!newClassName.trim()) {
      throw new Error("Merci de donner un nom à la nouvelle classe.")
    }
    const res = await fetch("/api/groups", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: newClassName.trim(), teacherId: teacherId || undefined }),
    })
    if (!res.ok) throw new Error("La création de la nouvelle classe a échoué.")
    const newGroup = await res.json()
    return newGroup.id
  }

  // Résout le groupId d'une matière supplémentaire : classe existante choisie, ou création
  // d'une nouvelle classe (même schéma que le prof principal). Renvoie null si la matière
  // n'est pas exploitable (aucune classe / aucun nom), auquel cas elle est ignorée.
  async function resolveExtraGroupId(course: ExtraCourseDraft): Promise<string | null> {
    if (course.joinExisting) return course.groupId || null
    if (!course.newClassName.trim()) return null
    const res = await fetch("/api/groups", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: course.newClassName.trim(), teacherId: course.teacherId || undefined }),
    })
    if (!res.ok) throw new Error(`Matière supplémentaire « ${course.subject || "?"} » : création de la classe échouée.`)
    const newGroup = await res.json()
    return newGroup.id
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setLoading(true)
    setError("")
    // Tarif mensuel calculé automatiquement (tarif h × durée × cours/sem × 4).
    const primaryMonthlyFee = computeMonthlyFee(shared.hourlyRate, shared.duration, shared.lessonsPerWeek)
    try {
      if (student) {
        // Edit mode: single student
        const groupId = await resolveGroupId()
        const form = { ...identities[0], ...shared, monthlyFee: primaryMonthlyFee, groupId, paymentAliases: aliasesForSubmit(0), scheduleSlots: toSchedulePayload(primarySlots) }
        const res = await fetch(`/api/students/${student.id}`, {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(form),
        })
        if (!res.ok) throw new Error(await res.text())

        for (const course of extraCourses) {
          const courseGroupId = await resolveExtraGroupId(course)
          if (!courseGroupId) continue
          const resExtra = await fetch("/api/students", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              ...identities[0],
              subject: course.subject,
              groupId: courseGroupId,
              joinExisting: course.joinExisting,
              monthlyFee: computeMonthlyFee(course.hourlyRate, course.duration, course.lessonsPerWeek),
              paymentGraceAllowed: shared.paymentGraceAllowed,
              hourlyRate: course.hourlyRate,
              lessonsPerWeek: course.lessonsPerWeek,
              duration: course.duration,
              startSession: course.startSession || "1",
              notes: shared.notes,
              status: shared.status,
              paymentAliases: aliasesForSubmit(0),
              scheduleSlots: toSchedulePayload(course.slots),
              initialPaymentReceived: false,
            }),
          })
          if (!resExtra.ok) {
            const data = await resExtra.json().catch(() => null)
            throw new Error(`Matière supplémentaire : ${data?.error || "erreur"}`)
          }
        }
      } else {
        // Create mode: one or multiple students
        const groupId = await resolveGroupId()
        // Classes des matières supplémentaires résolues une seule fois (création de
        // nouvelles classes comprise) pour ne pas les dupliquer à chaque élève du binôme.
        const extraGroupIds = await Promise.all(extraCourses.map((course) => resolveExtraGroupId(course)))
        for (let i = 0; i < studentCount; i++) {
          // Chaque élève reçoit son propre paiement détecté (élève 1 = paiement cliqué,
          // élèves suivants = choisis dans le menu, optionnels). À défaut de paiement
          // associé, on retombe sur la saisie manuelle partagée (« paiement reçu »).
          const matchId = matchIds[i] || undefined
          const form = {
            ...identities[i],
            ...shared,
            monthlyFee: primaryMonthlyFee,
            groupId,
            joinExisting: true,
            paymentAliases: aliasesForSubmit(i),
            initialPaymentReceived: Boolean(matchId) || initialPayment.received,
            initialPaymentMethod: initialPayment.method,
            initialPaymentPaidDate: initialPayment.paidDate,
            initialPaymentReference: matchId ? "" : initialPayment.reference,
            initialPaymentMatchId: matchId,
            scheduleSlots: toSchedulePayload(primarySlots),
          }
          if (!form.startSession) form.startSession = "1"
          const res = await fetch("/api/students", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(form),
          })
          if (!res.ok) {
            const data = await res.json()
            throw new Error(`Élève ${i + 1} (${identities[i].firstName || "?"}) : ${data.error || "erreur"}`)
          }

          for (let ci = 0; ci < extraCourses.length; ci++) {
            const course = extraCourses[ci]
            const courseGroupId = extraGroupIds[ci]
            if (!courseGroupId) continue
            const res2 = await fetch("/api/students", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({
                ...form,
                subject: course.subject,
                groupId: courseGroupId,
                joinExisting: course.joinExisting,
                monthlyFee: computeMonthlyFee(course.hourlyRate, course.duration, course.lessonsPerWeek),
                hourlyRate: course.hourlyRate,
                lessonsPerWeek: course.lessonsPerWeek,
                duration: course.duration,
                startSession: course.startSession || "1",
                initialPaymentReceived: false,
                initialPaymentMatchId: undefined,
                scheduleSlots: toSchedulePayload(course.slots),
              }),
            })
            if (!res2.ok) {
              const data = await res2.json()
              setError(`Élève ${i + 1} - inscription supplémentaire : ${data.error || "erreur"}`)
              setLoading(false)
              return
            }
          }
        }

        // E-mail de bienvenue (best-effort : les élèves sont déjà créés, un échec d'envoi
        // ne doit pas bloquer). Un e-mail par élève renseigné, avec les mêmes professeurs.
        if (sendWelcomeEmail && canSendWelcome) {
          const coursesPayload = welcomeCourses.map((c) => ({ subject: c.subject, teacherId: c.teacher.id }))
          await Promise.all(
            identities
              .filter((idn) => idn.email.trim())
              .map((idn) =>
                fetch("/api/students/welcome-email", {
                  method: "POST",
                  headers: { "Content-Type": "application/json" },
                  body: JSON.stringify({
                    to: idn.email.trim(),
                    studentName: `${idn.firstName} ${idn.lastName}`.trim() || idn.firstName,
                    subject: welcomeSubject.trim() || DEFAULT_WELCOME_SUBJECT,
                    intro: welcomeIntro.trim() || DEFAULT_WELCOME_INTRO,
                    courses: coursesPayload,
                  }),
                }).catch(() => null)
              )
          )
        }
      }
      onClose()
      window.location.reload()
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    } catch (e: any) {
      setError(e.message || "Une erreur est survenue")
    } finally {
      setLoading(false)
    }
  }

  // ── Aperçu de l'e-mail de bienvenue (création uniquement) ──
  // Cours = matière principale + matières supplémentaires, en gardant ceux dont le prof est choisi.
  const welcomeCourses = [
    { subject: shared.subject, teacherId },
    ...extraCourses.map((c) => ({ subject: c.subject, teacherId: c.teacherId })),
  ]
    .filter((c) => c.teacherId)
    .map((c) => ({ subject: c.subject, teacher: teachers.find((t) => t.id === c.teacherId) }))
    .filter((c): c is { subject: string; teacher: NonNullable<typeof c.teacher> } => Boolean(c.teacher))
  const welcomeRecipients = identities
    .map((i) => i.email.trim())
    .filter((email) => email.length > 0)
  const canSendWelcome = welcomeRecipients.length > 0 && welcomeCourses.length > 0

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent
        className="max-w-2xl max-h-[90vh] overflow-y-auto"
        // Empêche la fermeture accidentelle (clic à l'extérieur / touche Échap) qui
        // effacerait les informations saisies. Seuls « Annuler » et la croix ferment.
        onInteractOutside={(e) => e.preventDefault()}
        onEscapeKeyDown={(e) => e.preventDefault()}
      >
        <DialogHeader>
          <DialogTitle>{student ? "Modifier l'élève" : "Ajouter des élèves"}</DialogTitle>
          <DialogDescription>Remplissez les informations {studentCount > 1 ? `des ${studentCount} élèves` : "de l'élève"}</DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4">
          {/* Effacer le formulaire (création uniquement). La fenêtre ne se ferme plus au
              clic extérieur : ce bouton est le seul moyen de tout réinitialiser volontairement. */}
          {!student && (
            <div className="flex items-center justify-between gap-3 rounded-lg border border-gray-200 bg-gray-50 px-3 py-2">
              <span className="text-xs text-gray-500">Vos informations sont conservées tant que vous ne fermez pas la fenêtre.</span>
              <Button type="button" variant="outline" size="sm" onClick={resetCreateForm}>
                <Trash2 className="h-4 w-4" />
                Effacer le formulaire
              </Button>
            </div>
          )}

          {/* Compteur d'élèves (création uniquement) */}
          {!student && (
            <div className="flex items-center gap-3 rounded-lg border border-blue-200 bg-blue-50 p-3">
              <Label className="text-sm font-medium text-blue-900">Nombre d&apos;élèves</Label>
              <div className="flex items-center rounded-lg border border-blue-300 bg-white">
                <span className="px-3 py-1.5 text-sm font-semibold text-gray-900 min-w-[2rem] text-center">{studentCount}</span>
                <div className="flex flex-col border-l border-blue-200">
                  <button type="button" onClick={() => updateCount(studentCount + 1)} className="px-2 py-0.5 hover:bg-blue-100 rounded-tr-lg">
                    <ChevronUp className="h-3 w-3 text-blue-600" />
                  </button>
                  <button type="button" onClick={() => updateCount(studentCount - 1)} disabled={studentCount <= 1} className="px-2 py-0.5 hover:bg-blue-100 rounded-br-lg disabled:opacity-30">
                    <ChevronDown className="h-3 w-3 text-blue-600" />
                  </button>
                </div>
              </div>
              <span className="text-xs text-blue-600">
                {studentCount === 1 ? "Individuel" : studentCount === 2 ? "Binôme" : `Groupe de ${studentCount}`}
              </span>
            </div>
          )}

          {/* Identité de chaque élève */}
          {identities.map((identity, idx) => (
            <div key={idx} className={`space-y-3 ${studentCount > 1 ? "rounded-xl border border-gray-200 p-4" : ""}`}>
              {studentCount > 1 && (
                <p className="text-sm font-semibold text-gray-700">Élève {idx + 1}</p>
              )}
              <div className="grid gap-4 sm:grid-cols-2">
                <div className="space-y-1.5">
                  <Label>Prénom *</Label>
                  <Input value={identity.firstName} onChange={(e) => setIdentity(idx, "firstName", e.target.value)} required />
                </div>
                <div className="space-y-1.5">
                  <Label>Nom *</Label>
                  <Input value={identity.lastName} onChange={(e) => setIdentity(idx, "lastName", e.target.value)} required />
                </div>
                <div className="space-y-1.5">
                  <Label>Sexe *</Label>
                  <Select value={identity.gender} onValueChange={(v) => setIdentity(idx, "gender", v)}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="MALE">Garçon</SelectItem>
                      <SelectItem value="FEMALE">Fille</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1.5">
                  <Label>Téléphone</Label>
                  <Input value={identity.phone} onChange={(e) => setIdentity(idx, "phone", e.target.value)} />
                </div>
                <div className="space-y-1.5">
                  <Label>Email</Label>
                  <Input type="email" value={identity.email} onChange={(e) => setIdentity(idx, "email", e.target.value)} />
                </div>
                <div className="space-y-1.5">
                  <Label>Niveau</Label>
                  <Input value={identity.level} onChange={(e) => setIdentity(idx, "level", e.target.value)} placeholder="ex: Débutant, A1..." />
                </div>
              </div>

              {/* Infos parentales par élève */}
              <div className="grid gap-4 pt-2 sm:grid-cols-2">
                <div className="space-y-1.5">
                  <Label className="text-xs text-gray-500">Nom du parent/tuteur</Label>
                  <Input value={identity.parentName} onChange={(e) => setIdentity(idx, "parentName", e.target.value)} />
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs text-gray-500">Téléphone parent</Label>
                  <Input value={identity.parentPhone} onChange={(e) => setIdentity(idx, "parentPhone", e.target.value)} />
                </div>
                {studentCount === 1 && (
                  <div className="space-y-1.5 sm:col-span-2">
                    <Label className="text-xs text-gray-500">Email parent</Label>
                    <Input type="email" value={identity.parentEmail} onChange={(e) => setIdentity(idx, "parentEmail", e.target.value)} />
                  </div>
                )}
              </div>

              {/* Paiement détecté à associer à CET élève (scan PayPal/Wise). Élève 1
                  pré-rempli avec le paiement cliqué (modifiable) ; élèves suivants optionnels. */}
              {!student && (paymentMatches?.length ?? 0) > 0 && (
                <div className="space-y-1.5 rounded-lg border border-emerald-200 bg-emerald-50 p-3">
                  <Label>Paiement à associer {studentCount > 1 ? `(élève ${idx + 1})` : ""}</Label>
                  <Select value={matchIds[idx] || "NONE"} onValueChange={(value) => setMatchId(idx, value === "NONE" ? "" : value)}>
                    <SelectTrigger className="bg-white"><SelectValue placeholder="Choisir un paiement reçu…" /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="NONE">— Aucun —</SelectItem>
                      {availableMatches(idx).map((match) => (
                        <SelectItem key={match.id} value={match.id}>
                          {match.source === "PAYPAL" ? "PayPal" : "Wise"} · {match.receivedAmount.toFixed(2)} € · {match.detectedPayerName || "payeur non détecté"}
                          {match.paymentDate ? ` · ${new Date(match.paymentDate).toLocaleDateString("fr-FR")}` : ""}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  {matchIds[idx] && (
                    <p className="text-xs text-emerald-700">
                      Validé pour la 1ʳᵉ session de cet élève, retiré des « non traités », payeur mémorisé pour les prochains mois.
                    </p>
                  )}
                </div>
              )}

              {/* Nom(s) sur le paiement de CET élève. Ligne principale remplie
                  automatiquement : payeur du paiement associé, sinon Prénom Nom saisis. */}
              <div className="space-y-2 rounded-lg border border-gray-200 bg-gray-50 p-3">
                <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                  <div>
                    <p className="text-sm font-medium text-gray-800">Nom sur le paiement{studentCount > 1 ? ` (élève ${idx + 1})` : ""}</p>
                    <p className="text-xs text-gray-500">Rempli automatiquement, modifiable. Ajoutez d&apos;autres noms si besoin.</p>
                  </div>
                  <div className="grid gap-2 sm:flex">
                    <Button type="button" variant="outline" size="sm" onClick={() => addPaymentAlias(idx, "PAYPAL")}>
                      <Plus className="h-4 w-4" />
                      PayPal
                    </Button>
                    <Button type="button" variant="outline" size="sm" onClick={() => addPaymentAlias(idx, "WISE")}>
                      <Plus className="h-4 w-4" />
                      Virement
                    </Button>
                  </div>
                </div>
                <div className="space-y-2">
                  {(aliasesByStudent[idx] ?? []).map((row, j) => {
                    const eff = effectiveAlias(idx, row, j === 0)
                    return (
                      <div key={row.id} className="grid gap-2 rounded-lg border border-gray-200 bg-white p-2 sm:grid-cols-[9rem_1fr_2.5rem]">
                        <Select value={eff.type} onValueChange={(value) => updatePaymentAlias(idx, row.id, "type", value)} disabled={eff.locked}>
                          <SelectTrigger><SelectValue /></SelectTrigger>
                          <SelectContent>
                            <SelectItem value="PAYPAL">PayPal</SelectItem>
                            <SelectItem value="WISE">Virement</SelectItem>
                          </SelectContent>
                        </Select>
                        <Input
                          value={eff.alias}
                          onChange={(e) => updatePaymentAlias(idx, row.id, "alias", e.target.value)}
                          placeholder="Nom affiché dans le paiement"
                          disabled={eff.locked}
                        />
                        {j === 0 ? (
                          <span className="flex items-center justify-center text-[10px] font-medium uppercase tracking-wide text-gray-400" title="Ligne principale (non supprimable)">
                            {eff.locked || row.auto ? "auto" : "•"}
                          </span>
                        ) : (
                          <Button type="button" variant="ghost" size="icon" onClick={() => removePaymentAlias(idx, row.id)} title="Supprimer ce nom">
                            <Trash2 className="h-4 w-4 text-red-500" />
                          </Button>
                        )}
                      </div>
                    )
                  })}
                </div>
                {matchForStudent(idx) && (
                  <p className="text-xs text-emerald-700">Nom repris automatiquement du paiement associé (PayPal / Virement).</p>
                )}
              </div>
            </div>
          ))}

          {/* Infos communes (adresse, forfait, prof) */}
          <div className="border-t pt-4">
            <p className="mb-3 text-sm font-medium text-gray-700">{studentCount > 1 ? "Informations communes" : "Informations complémentaires"}</p>
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label>Tarif mensuel (€)</Label>
                <div className="flex h-10 items-center justify-between rounded-md border border-gray-200 bg-gray-50 px-3">
                  <span className="text-sm font-semibold text-gray-900">
                    {computedMonthlyFee > 0 ? `${computedMonthlyFee.toFixed(2).replace(/\.00$/, "")} €` : "—"}
                  </span>
                  <span className="text-xs text-gray-400">calculé auto</span>
                </div>
                <p className="text-xs text-gray-400">
                  Tarif horaire × durée × cours/semaine × 4. Renseignez le forfait du professeur ci-dessous.
                </p>
              </div>
              <label className="flex items-start gap-2 rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900 sm:col-span-2">
                <input
                  type="checkbox"
                  className="mt-1 h-4 w-4 rounded border-amber-300"
                  checked={shared.paymentGraceAllowed}
                  onChange={(e) => setSharedField("paymentGraceAllowed", e.target.checked)}
                />
                <span>
                  Cours autorisé malgré absence ou retard de paiement
                </span>
              </label>
            </div>
            {!student && (
              <div className="mt-4 rounded-xl border border-emerald-200 bg-emerald-50 p-3">
                <label className="flex items-start gap-2 text-sm text-emerald-950">
                  <input
                    type="checkbox"
                    className="mt-1 h-4 w-4 rounded border-emerald-300"
                    checked={initialPayment.received}
                    onChange={(e) => setInitialPaymentField("received", e.target.checked)}
                  />
                  <span>
                    Paiement reçu à l&apos;inscription (saisie manuelle)
                    <span className="block text-xs text-emerald-700">
                      Pour un élève <strong>sans</strong> paiement détecté associé ci-dessus : enregistre la première session comme payée (forfait mensuel + 10 € de frais d&apos;inscription par élève).
                    </span>
                  </span>
                </label>
                {initialPayment.received && (
                  <div className="mt-3 grid gap-3 sm:grid-cols-3">
                    <div className="space-y-1.5">
                      <Label>Moyen</Label>
                      <Select value={initialPayment.method} onValueChange={(value) => setInitialPaymentField("method", value)}>
                        <SelectTrigger className="bg-white"><SelectValue /></SelectTrigger>
                        <SelectContent>
                          <SelectItem value="Virement">Virement</SelectItem>
                          <SelectItem value="PayPal">PayPal</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="space-y-1.5">
                      <Label>Date</Label>
                      <Input
                        type="date"
                        value={initialPayment.paidDate}
                        onChange={(e) => setInitialPaymentField("paidDate", e.target.value)}
                        className="bg-white"
                      />
                    </div>
                    <div className="space-y-1.5">
                      <Label>Référence</Label>
                      <Input
                        value={initialPayment.reference}
                        onChange={(e) => setInitialPaymentField("reference", e.target.value)}
                        placeholder="Optionnel"
                        className="bg-white"
                      />
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>

          {/* Professeur & forfait */}
          <div className="border-t pt-4">
            <p className="mb-3 text-sm font-medium text-gray-700">Professeur & forfait</p>

            {/* Nouvelle classe vs intégrer classe existante */}
            <div className="mb-4 grid gap-2 sm:grid-cols-2">
              <button
                type="button"
                onClick={() => { setJoinExisting(false); setSharedField("groupId", ""); setSharedField("startSession", "1") }}
                className={`flex-1 rounded-lg border px-3 py-2 text-sm font-medium transition ${!joinExisting ? "border-blue-500 bg-blue-50 text-blue-700" : "border-gray-200 bg-white text-gray-500 hover:bg-gray-50"}`}
              >
                Nouvelle classe
              </button>
              <button
                type="button"
                onClick={() => { setJoinExisting(true); setSharedField("startSession", ""); setNewClassName("") }}
                className={`flex-1 rounded-lg border px-3 py-2 text-sm font-medium transition ${joinExisting ? "border-blue-500 bg-blue-50 text-blue-700" : "border-gray-200 bg-white text-gray-500 hover:bg-gray-50"}`}
              >
                Intégrer à une classe existante
              </button>
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label>Professeur</Label>
                <Select value={teacherId || ALL_TEACHERS_VALUE} onValueChange={(v) => { setTeacherId(v === ALL_TEACHERS_VALUE ? "" : v); setSharedField("groupId", "") }}>
                  <SelectTrigger><SelectValue placeholder="Choisir un prof..." /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value={ALL_TEACHERS_VALUE}>Tous</SelectItem>
                    {teachers.map((t) => <SelectItem key={t.id} value={t.id}>{t.name}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>

              {joinExisting ? (
                <div className="space-y-1.5">
                  <Label>Classe *</Label>
                  <Select value={shared.groupId} onValueChange={async (v) => {
                    setSharedField("groupId", v)
                    if (v) {
                      const res = await fetch(`/api/groups/${v}/info`)
                      if (res.ok) {
                        const info = await res.json()
                        setGroupInfo(info)
                        if (info.count > 0) {
                          if (info.subject) setSharedField("subject", info.subject)
                          if (info.lessonsPerWeek) setSharedField("lessonsPerWeek", String(info.lessonsPerWeek))
                          if (info.duration) setSharedField("duration", info.duration)
                          if (info.newRate) setSharedField("hourlyRate", String(info.newRate))
                        }
                      }
                    } else {
                      setGroupInfo(null)
                    }
                  }}>
                    <SelectTrigger><SelectValue placeholder="Sélectionner..." /></SelectTrigger>
                    <SelectContent className="max-h-60 overflow-y-auto">
                      {filteredGroups.map((g) => <SelectItem key={g.id} value={g.id}>{g.name}</SelectItem>)}
                    </SelectContent>
                  </Select>
                  {shared.groupId && groupInfo && groupInfo.count > 0 && (
                    <p className="text-xs text-blue-600">
                      Classe de {groupInfo.count} élève{groupInfo.count > 1 ? "s" : ""} → tarif adapté à {groupInfo.newRate}€/h
                    </p>
                  )}
                </div>
              ) : (
                <div className="space-y-1.5">
                  <Label>Nom de la classe *</Label>
                  <Input
                    value={newClassName}
                    onChange={(e) => setNewClassName(e.target.value)}
                    placeholder={studentCount > 1 ? "ex: Binôme Salima & Sandini" : `ex: ${identities[0]?.firstName || "Prénom"} — Individuel`}
                  />
                </div>
              )}

              <div className="space-y-1.5">
                <Label>Matière {lockedByGroup && <span className="text-xs text-blue-500 ml-1">(classe)</span>}</Label>
                <Select value={shared.subject || NO_SUBJECT_VALUE} onValueChange={(v) => setSharedField("subject", v === NO_SUBJECT_VALUE ? "" : v)} disabled={lockedByGroup}>
                  <SelectTrigger><SelectValue placeholder="Sélectionner..." /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value={NO_SUBJECT_VALUE}>Aucune</SelectItem>
                    {SUBJECTS.map((s) => <SelectItem key={s} value={s}>{s}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label>Cours par semaine {lockedByGroup && <span className="text-xs text-blue-500 ml-1">(classe)</span>}</Label>
                <Input type="number" min="0" step="1" value={shared.lessonsPerWeek} onChange={(e) => setSharedField("lessonsPerWeek", e.target.value)} placeholder="ex: 1, 2..." disabled={lockedByGroup} />
              </div>
              {teacherId && (
                <div className="space-y-2 sm:col-span-2">
                  <Label>Créneaux français</Label>
                  <div className="space-y-2 rounded-xl border border-emerald-100 bg-emerald-50/50 p-3">
                    {primarySlots.map((slot, index) => (
                      <div key={slot.id} className="grid gap-2 sm:grid-cols-[9rem_1fr_1fr] sm:items-end">
                        <p className="text-sm font-medium text-emerald-900">Créneau français {index + 1}</p>
                        <div className="space-y-1">
                          <span className="text-xs text-gray-500">Jour</span>
                          <Select value={slot.dayOfWeek} onValueChange={(value) => updatePrimarySlot(slot.id, "dayOfWeek", value)}>
                            <SelectTrigger className="bg-white"><SelectValue placeholder="Choisir le jour" /></SelectTrigger>
                            <SelectContent>
                              {DAYS.map((d) => <SelectItem key={d.value} value={d.value}>{d.label}</SelectItem>)}
                            </SelectContent>
                          </Select>
                        </div>
                        <div className="space-y-1">
                          <span className="text-xs text-gray-500">Horaire</span>
                          <Input type="time" value={slot.startTime} onChange={(e) => updatePrimarySlot(slot.id, "startTime", e.target.value)} className="bg-white" />
                        </div>
                      </div>
                    ))}
                    <p className="text-xs text-emerald-700">
                      Chaque créneau est ajouté au planning de la professeure dès la prochaine date correspondante, puis chaque semaine.
                    </p>
                  </div>
                </div>
              )}
              <div className="space-y-1.5">
                <Label>Durée d&apos;un cours {lockedByGroup && <span className="text-xs text-blue-500 ml-1">(classe)</span>}</Label>
                <Select value={shared.duration} onValueChange={(v) => setSharedField("duration", v)} disabled={lockedByGroup}>
                  <SelectTrigger><SelectValue placeholder="Sélectionner..." /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="0,5">30 min</SelectItem>
                    <SelectItem value="1">1h</SelectItem>
                    <SelectItem value="1,5">1h30</SelectItem>
                    <SelectItem value="2">2h</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label>Tarif horaire (€) {lockedByGroup && <span className="text-xs text-blue-500 ml-1">(auto)</span>}</Label>
                <Input type="number" min="0" step="0.01" value={shared.hourlyRate} onChange={(e) => setSharedField("hourlyRate", e.target.value)} disabled={lockedByGroup} />
              </div>
              {!student && (
                <div className="space-y-1.5">
                  <Label>N° de session de départ</Label>
                  {joinExisting && shared.groupId ? (
                    <p className="mt-1 text-sm text-gray-500 italic">Automatique (session de la classe)</p>
                  ) : (
                    <Input type="number" min="1" step="1" value={shared.startSession || "1"} onChange={(e) => setSharedField("startSession", e.target.value)} placeholder="1" />
                  )}
                </div>
              )}
            </div>
          </div>

          {/* Matières supplémentaires */}
          <div className="border-t pt-4">
            <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <p className="text-sm font-medium text-gray-700">Autres matières</p>
                <p className="text-xs text-gray-400">Ajoutez une inscription séparée si l&apos;élève suit aussi français, arabe, tajwid, etc.</p>
              </div>
              <Button type="button" variant="outline" size="sm" onClick={addExtraCourse}>
                <Plus className="h-4 w-4" />
                Ajouter une matière
              </Button>
            </div>

            {extraCourses.length > 0 && (
              <div className="mt-3 space-y-3">
                {extraCourses.map((course, courseIndex) => {
                  const courseGroups = course.teacherId ? groups.filter((g) => g.teacherId === course.teacherId) : groups
                  return (
                    <div key={course.id} className="rounded-xl border border-blue-200 bg-blue-50 p-4">
                      <div className="mb-3 flex items-start justify-between gap-3">
                        <p className="text-sm font-medium text-blue-800">Matière supplémentaire {courseIndex + 1}</p>
                        <Button type="button" variant="ghost" size="icon" className="h-8 w-8 text-red-500" onClick={() => removeExtraCourse(course.id)} title="Retirer cette matière">
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </div>
                      {/* Nouvelle classe vs intégrer classe existante — même schéma que le prof principal */}
                      <div className="mb-4 grid gap-2 sm:grid-cols-2">
                        <button
                          type="button"
                          onClick={() => setExtraCourseJoin(course.id, false)}
                          className={`flex-1 rounded-lg border px-3 py-2 text-sm font-medium transition ${!course.joinExisting ? "border-blue-500 bg-white text-blue-700" : "border-gray-200 bg-white/60 text-gray-500 hover:bg-white"}`}
                        >
                          Nouvelle classe
                        </button>
                        <button
                          type="button"
                          onClick={() => setExtraCourseJoin(course.id, true)}
                          className={`flex-1 rounded-lg border px-3 py-2 text-sm font-medium transition ${course.joinExisting ? "border-blue-500 bg-white text-blue-700" : "border-gray-200 bg-white/60 text-gray-500 hover:bg-white"}`}
                        >
                          Intégrer à une classe existante
                        </button>
                      </div>
                      <div className="grid gap-4 sm:grid-cols-2">
                        <div className="space-y-1.5">
                          <Label>Professeur</Label>
                          <Select value={course.teacherId} onValueChange={(value) => updateExtraCourse(course.id, "teacherId", value)}>
                            <SelectTrigger className="bg-white"><SelectValue placeholder="Choisir un prof..." /></SelectTrigger>
                            <SelectContent>
                              {teachers.map((t) => <SelectItem key={t.id} value={t.id}>{t.name}</SelectItem>)}
                            </SelectContent>
                          </Select>
                        </div>
                        {course.joinExisting ? (
                          <div className="space-y-1.5">
                            <Label>Classe</Label>
                            <Select value={course.groupId} onValueChange={(value) => updateExtraCourse(course.id, "groupId", value)}>
                              <SelectTrigger className="bg-white"><SelectValue placeholder="Sélectionner..." /></SelectTrigger>
                              <SelectContent className="max-h-60 overflow-y-auto">
                                {courseGroups.map((g) => <SelectItem key={g.id} value={g.id}>{g.name}</SelectItem>)}
                              </SelectContent>
                            </Select>
                          </div>
                        ) : (
                          <div className="space-y-1.5">
                            <Label>Nom de la classe</Label>
                            <Input
                              value={course.newClassName}
                              onChange={(e) => updateExtraCourse(course.id, "newClassName", e.target.value)}
                              className="bg-white"
                              placeholder={`ex: ${identities[0]?.firstName || "Prénom"} — ${course.subject || "matière"}`}
                            />
                          </div>
                        )}
                        <div className="space-y-1.5">
                          <Label>Matière</Label>
                          <Select value={course.subject} onValueChange={(value) => updateExtraCourse(course.id, "subject", value)}>
                            <SelectTrigger className="bg-white"><SelectValue placeholder="Sélectionner..." /></SelectTrigger>
                            <SelectContent>
                              {SUBJECTS.map((s) => <SelectItem key={s} value={s}>{s}</SelectItem>)}
                            </SelectContent>
                          </Select>
                        </div>
                        <div className="space-y-1.5">
                          <Label>Cours par semaine</Label>
                          <Input type="number" min="1" step="1" value={course.lessonsPerWeek} onChange={(e) => updateExtraCourse(course.id, "lessonsPerWeek", e.target.value)} className="bg-white" placeholder="ex: 1, 2..." />
                        </div>
                        <div className="space-y-1.5">
                          <Label>Durée</Label>
                          <Select value={course.duration} onValueChange={(value) => updateExtraCourse(course.id, "duration", value)}>
                            <SelectTrigger className="bg-white"><SelectValue placeholder="Sélectionner..." /></SelectTrigger>
                            <SelectContent>
                              <SelectItem value="0,5">30 min</SelectItem>
                              <SelectItem value="1">1h</SelectItem>
                              <SelectItem value="1,5">1h30</SelectItem>
                              <SelectItem value="2">2h</SelectItem>
                            </SelectContent>
                          </Select>
                        </div>
                        <div className="space-y-1.5">
                          <Label>Tarif horaire (€)</Label>
                          <Input type="number" min="0" step="0.01" value={course.hourlyRate} onChange={(e) => updateExtraCourse(course.id, "hourlyRate", e.target.value)} className="bg-white" />
                        </div>
                        {!student && (
                          <div className="space-y-1.5">
                            <Label>N° de session de départ</Label>
                            <Input type="number" min="1" step="1" value={course.startSession} onChange={(e) => updateExtraCourse(course.id, "startSession", e.target.value)} className="bg-white" placeholder="ex: 1" />
                          </div>
                        )}
                        <div className="space-y-2 sm:col-span-2">
                          <Label>Créneaux français</Label>
                          <div className="space-y-2 rounded-xl border border-blue-100 bg-white/70 p-3">
                            {course.slots.map((slot, slotIndex) => (
                              <div key={slot.id} className="grid gap-2 sm:grid-cols-[9rem_1fr_1fr] sm:items-end">
                                <p className="text-sm font-medium text-blue-900">Créneau français {slotIndex + 1}</p>
                                <div className="space-y-1">
                                  <span className="text-xs text-gray-500">Jour</span>
                                  <Select value={slot.dayOfWeek} onValueChange={(value) => updateExtraSlot(course.id, slot.id, "dayOfWeek", value)}>
                                    <SelectTrigger className="bg-white"><SelectValue placeholder="Choisir le jour" /></SelectTrigger>
                                    <SelectContent>
                                      {DAYS.map((d) => <SelectItem key={d.value} value={d.value}>{d.label}</SelectItem>)}
                                    </SelectContent>
                                  </Select>
                                </div>
                                <div className="space-y-1">
                                  <span className="text-xs text-gray-500">Horaire</span>
                                  <Input type="time" value={slot.startTime} onChange={(e) => updateExtraSlot(course.id, slot.id, "startTime", e.target.value)} className="bg-white" />
                                </div>
                              </div>
                            ))}
                          </div>
                        </div>
                      </div>
                    </div>
                  )
                })}
              </div>
            )}
          </div>

          {/* Statut (édition uniquement) */}
          {student && (
            <div className="border-t pt-4">
              <p className="mb-3 text-sm font-medium text-gray-700">Statut de l&apos;élève</p>
              <div className="grid gap-4 sm:grid-cols-2">
                <div className="space-y-1.5">
                  <Label>Statut</Label>
                  <Select value={shared.status} onValueChange={(v) => setSharedField("status", v)}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="ACTIVE">Actif</SelectItem>
                      <SelectItem value="PAUSED">En pause</SelectItem>
                      <SelectItem value="STOPPED">Arrêt définitif</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                {shared.status === "PAUSED" && (
                  <div className="space-y-1.5">
                    <Label>Date de recontact</Label>
                    <Input type="date" value={shared.recontactDate} onChange={(e) => setSharedField("recontactDate", e.target.value)} />
                    <p className="text-xs text-gray-400">Une tâche sera créée pour recontacter l&apos;élève à cette date.</p>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* Aperçu de l'e-mail de bienvenue (création uniquement) */}
          {!student && (
            <div className="rounded-xl border border-blue-200 bg-blue-50/60 p-4">
              <label className="flex items-start gap-2 text-sm text-blue-950">
                <input
                  type="checkbox"
                  className="mt-1 h-4 w-4 rounded border-blue-300"
                  checked={sendWelcomeEmail && canSendWelcome}
                  disabled={!canSendWelcome}
                  onChange={(e) => setSendWelcomeEmail(e.target.checked)}
                />
                <span>
                  Envoyer l&apos;e-mail de bienvenue
                  <span className="block text-xs text-blue-700">
                    {welcomeRecipients.length === 0
                      ? "Renseignez l'e-mail de l'élève ci-dessus pour activer l'envoi."
                      : welcomeCourses.length === 0
                        ? "Choisissez au moins un professeur pour activer l'envoi."
                        : welcomeRecipients.length > 1
                          ? `Un e-mail personnalisé sera envoyé à chacun des ${welcomeRecipients.length} élèves : ${welcomeRecipients.join(", ")}.`
                          : `Envoyé à ${welcomeRecipients.join(", ")} à la validation.`}
                  </span>
                </span>
              </label>

              {canSendWelcome && (
                <>
                <div className="mt-3 grid gap-3">
                  <div className="space-y-1.5">
                    <Label className="text-xs text-blue-900">Objet de l&apos;e-mail</Label>
                    <Input value={welcomeSubject} onChange={(e) => setWelcomeSubject(e.target.value)} className="bg-white" />
                  </div>
                  <div className="space-y-1.5">
                    <Label className="text-xs text-blue-900">Message d&apos;accueil</Label>
                    <textarea
                      value={welcomeIntro}
                      onChange={(e) => setWelcomeIntro(e.target.value)}
                      rows={3}
                      className="w-full rounded-md border border-gray-200 bg-white px-3 py-2 text-sm text-gray-900 focus:border-blue-400 focus:outline-none focus:ring-1 focus:ring-blue-400"
                    />
                    <p className="text-xs text-blue-700">Les coordonnées des professeurs sont ajoutées automatiquement sous ce message.</p>
                  </div>
                </div>
                {/* Aperçu fidèle à l'e-mail réel : bandeau navy + logo + pied de page,
                    identique aux autres e-mails (studentWelcomeEmailHtml). */}
                <p className="mt-3 text-xs uppercase tracking-wide text-gray-400">Aperçu de l&apos;e-mail — Objet : {welcomeSubject || DEFAULT_WELCOME_SUBJECT}</p>
                <div className="mt-2 overflow-hidden rounded-xl border border-gray-200" style={{ backgroundColor: "#F4EFE3" }}>
                  <div className="mx-auto max-w-md p-4">
                    <div className="overflow-hidden rounded-xl bg-white shadow-sm">
                      {/* Bandeau / logo */}
                      <div className="px-5 py-6 text-center" style={{ backgroundColor: "#0C243C" }}>
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img src="/logo-assahaba.png" alt="Institut As-Sahaba" width={72} className="mx-auto mb-3 h-auto w-[72px] rounded-lg bg-white" />
                        <div className="text-sm font-bold uppercase tracking-[0.2em] text-white">Institut As-Sahaba</div>
                        <div className="mt-1 text-[10px] tracking-[0.12em]" style={{ color: "#9CC0DD" }}>Sur les traces des compagnons</div>
                      </div>
                      {/* Corps */}
                      <div className="px-5 py-5">
                        <p className="text-center text-lg font-bold" style={{ color: "#17456C" }}>Bienvenue à l&apos;Institut As-Sahaba</p>
                        <p className="mt-1 text-center text-sm font-semibold" dir="rtl" style={{ color: "#235A86" }}>السلام عليكم ورحمة الله وبركاته</p>
                        <p className="mt-3 whitespace-pre-line text-sm" style={{ color: "#1A2440" }}>{welcomeIntro || DEFAULT_WELCOME_INTRO}</p>
                        <p className="mt-3 text-sm" style={{ color: "#1A2440" }}>
                          Voici les coordonnées {welcomeCourses.length > 1 ? "de vos professeurs" : "de votre professeur"} :
                        </p>
                        <div className="mt-3 space-y-2">
                          {welcomeCourses.map((course, i) => {
                            const wa = whatsappLink(course.teacher.phone)
                            return (
                              <div key={i} className="rounded-lg border p-3" style={{ backgroundColor: "#F7F9FC", borderColor: "#E9F1F8" }}>
                                <p className="text-xs font-bold" style={{ color: "#17456C" }}>
                                  Professeur de {course.subject || "—"}
                                </p>
                                <p className="font-semibold text-gray-900">{course.teacher.name}</p>
                                <p className="text-xs text-gray-600">
                                  📱 WhatsApp : {course.teacher.phone
                                    ? (wa ? <a href={wa} target="_blank" rel="noopener noreferrer" className="text-green-700 hover:underline">{course.teacher.phone}</a> : course.teacher.phone)
                                    : <span className="text-amber-600">non renseigné</span>}
                                </p>
                                <p className="truncate text-xs text-gray-600">
                                  🎥 Zoom : {course.teacher.meetingLink
                                    ? <a href={course.teacher.meetingLink} target="_blank" rel="noopener noreferrer" className="text-blue-700 hover:underline">{course.teacher.meetingLink}</a>
                                    : <span className="text-amber-600">non renseigné</span>}
                                </p>
                              </div>
                            )
                          })}
                        </div>
                      </div>
                      {/* Pied de page */}
                      <div className="px-5 py-4 text-center text-[11px] leading-5" style={{ backgroundColor: "#F4EFE3", color: "#5C6577" }}>
                        <strong style={{ color: "#17456C" }}>Institut As-Sahaba</strong> — Sur les traces des compagnons<br />
                        <span style={{ color: "#235A86" }}>www.institut-assahaba.com</span>
                      </div>
                    </div>
                  </div>
                </div>
                </>
              )}
            </div>
          )}

          {error && <div className="rounded-lg bg-red-50 px-4 py-3 text-sm text-red-700">{error}</div>}

          <div className="grid grid-cols-2 gap-3 pt-2 sm:flex sm:justify-end">
            <Button type="button" variant="outline" onClick={onClose}>Annuler</Button>
            <Button type="submit" disabled={loading}>
              {loading && <Loader2 className="h-4 w-4 animate-spin" />}
              {student ? "Enregistrer" : studentCount > 1 ? `Ajouter ${studentCount} élèves` : "Ajouter"}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  )
}
