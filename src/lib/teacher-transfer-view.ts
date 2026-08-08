// Règles d'affichage d'un changement de professeur, partagées par le cahier du
// professeur et l'onglet Professeurs. Aucune dépendance serveur : ce module est
// importable depuis un composant client.

export type SessionTransferView = {
  id: string
  fromTeacherId: string
  fromTeacherName: string
  toTeacherId: string
  toTeacherName: string
  /** Dernier cours assuré par l'ancien professeur : le trait se tire dessous. */
  boundaryLessonNumber: number
  transferredAt: string
  /** Cours de l'ancien professeur tous payés : sa copie est archivée. */
  archived: boolean
}

/**
 * Professeur créditeur d'un cours. Même règle que côté serveur
 * (`lessonOwnerId` de `@/lib/teacher-transfer`) : le professeur épinglé sur le
 * cours, sinon le professeur courant de la session.
 */
export function lessonOwner(lesson: { teacherId?: string | null }, sessionTeacherId: string): string {
  return lesson.teacherId ?? sessionTeacherId
}

/**
 * Cours d'une session revenant à `teacherId`. Deux professeurs d'une même
 * session obtiennent des ensembles disjoints qui couvrent tous les cours : c'est
 * ce qui interdit tout double comptage en paie.
 */
export function lessonsOwnedBy<T extends { teacherId?: string | null }>(
  lessons: T[],
  sessionTeacherId: string,
  teacherId: string,
): T[] {
  return lessons.filter((lesson) => lessonOwner(lesson, sessionTeacherId) === teacherId)
}

/** Trait à tirer sous le cours `lessonNumber`, s'il y a eu un transfert à cet endroit. */
export function transferAfterLesson(
  transfers: SessionTransferView[] | undefined,
  lessonNumber: number,
): SessionTransferView | undefined {
  return transfers?.find((transfer) => transfer.boundaryLessonNumber === lessonNumber)
}

/** Transferts intervenus avant tout cours donné (trait au-dessus du tableau). */
export function transfersBeforeFirstLesson(transfers: SessionTransferView[] | undefined): SessionTransferView[] {
  return (transfers ?? []).filter((transfer) => transfer.boundaryLessonNumber === 0)
}

/** Le transfert par lequel ce professeur a passé la main sur cette session. */
export function transferFrom(
  transfers: SessionTransferView[] | undefined,
  teacherId: string,
): SessionTransferView | undefined {
  return transfers?.find((transfer) => transfer.fromTeacherId === teacherId)
}

/** Ce professeur n'a plus la session en cours : il n'en garde que ses anciens cours. */
export function isFormerTeacher(
  session: { teacher: { id: string }; transfers?: SessionTransferView[] },
  teacherId: string,
): boolean {
  return session.teacher.id !== teacherId && Boolean(transferFrom(session.transfers, teacherId))
}

export function formatTransferDate(iso: string): string {
  return new Date(iso).toLocaleDateString("fr-FR", { day: "2-digit", month: "2-digit", year: "numeric" })
}
