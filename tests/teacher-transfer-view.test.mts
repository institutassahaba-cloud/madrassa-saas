import assert from "node:assert/strict"
import test from "node:test"
import {
  isFormerTeacher,
  lessonOwner,
  lessonsOwnedBy,
  transferAfterLesson,
  transfersBeforeFirstLesson,
  transferFrom,
  type SessionTransferView,
} from "../src/lib/teacher-transfer-view.ts"

const ANCIEN = "prof-ancien"
const NOUVEAU = "prof-nouveau"

// Session de 8 cours : 3 assurés par l'ancien professeur, la suite au nouveau.
function sessionApresTransfert() {
  const lessons = Array.from({ length: 8 }, (_, index) => ({
    id: `c${index + 1}`,
    number: index + 1,
    teacherId: index + 1 <= 3 ? ANCIEN : null,
  }))
  const transfer: SessionTransferView = {
    id: "t1",
    fromTeacherId: ANCIEN,
    fromTeacherName: "Ancien",
    toTeacherId: NOUVEAU,
    toTeacherName: "Nouveau",
    boundaryLessonNumber: 3,
    transferredAt: "2026-03-12T10:00:00.000Z",
    archived: false,
  }
  return { lessons, transfer, sessionTeacherId: NOUVEAU }
}

test("les cours d'avant le trait restent à l'ancien professeur", () => {
  const { lessons, sessionTeacherId } = sessionApresTransfert()
  assert.equal(lessonOwner(lessons[0], sessionTeacherId), ANCIEN)
  assert.equal(lessonOwner(lessons[2], sessionTeacherId), ANCIEN)
  assert.equal(lessonOwner(lessons[3], sessionTeacherId), NOUVEAU)
  assert.equal(lessonOwner(lessons[7], sessionTeacherId), NOUVEAU)
})

test("aucun cours n'est compté deux fois : les deux paies se partagent la session", () => {
  const { lessons, sessionTeacherId } = sessionApresTransfert()
  const ancien = lessonsOwnedBy(lessons, sessionTeacherId, ANCIEN)
  const nouveau = lessonsOwnedBy(lessons, sessionTeacherId, NOUVEAU)

  assert.deepEqual(ancien.map((lesson) => lesson.number), [1, 2, 3])
  assert.deepEqual(nouveau.map((lesson) => lesson.number), [4, 5, 6, 7, 8])
  // Partition exacte : réunion = tous les cours, intersection = vide.
  assert.equal(ancien.length + nouveau.length, lessons.length)
  const communs = ancien.filter((lesson) => nouveau.some((other) => other.id === lesson.id))
  assert.deepEqual(communs, [])
})

test("sans transfert, tous les cours reviennent au professeur de la session", () => {
  const lessons = [{ id: "c1", number: 1 }, { id: "c2", number: 2, teacherId: null }]
  assert.equal(lessonsOwnedBy(lessons, ANCIEN, ANCIEN).length, 2)
  assert.equal(lessonsOwnedBy(lessons, ANCIEN, NOUVEAU).length, 0)
})

test("un second transfert découpe la session en trois sans recouvrement", () => {
  const troisieme = "prof-troisieme"
  const lessons = Array.from({ length: 8 }, (_, index) => ({
    id: `c${index + 1}`,
    number: index + 1,
    teacherId: index + 1 <= 3 ? ANCIEN : index + 1 <= 5 ? NOUVEAU : null,
  }))
  assert.deepEqual(lessonsOwnedBy(lessons, troisieme, ANCIEN).map((l) => l.number), [1, 2, 3])
  assert.deepEqual(lessonsOwnedBy(lessons, troisieme, NOUVEAU).map((l) => l.number), [4, 5])
  assert.deepEqual(lessonsOwnedBy(lessons, troisieme, troisieme).map((l) => l.number), [6, 7, 8])
})

// Un changement de professeur emporte toute la classe : chaque élève garde son
// propre tableau, mais le trait tombe au même endroit pour tout le monde.
test("dans un binôme, chaque élève est réparti sur la même borne", () => {
  const { transfer, sessionTeacherId } = sessionApresTransfert()
  // Ali a fait les cours 1-2-3 ; Sara n'a pas eu le cours 2 (jamais marqué),
  // il reste donc au nouveau professeur qui le rattrapera.
  const ali = [1, 2, 3, 4].map((number) => ({ id: `ali-${number}`, number, teacherId: number <= 3 ? ANCIEN : null }))
  const sara = [1, 2, 3, 4].map((number) => ({ id: `sara-${number}`, number, teacherId: number <= 3 && number !== 2 ? ANCIEN : null }))

  assert.deepEqual(lessonsOwnedBy(ali, sessionTeacherId, ANCIEN).map((l) => l.number), [1, 2, 3])
  assert.deepEqual(lessonsOwnedBy(sara, sessionTeacherId, ANCIEN).map((l) => l.number), [1, 3])
  assert.deepEqual(lessonsOwnedBy(sara, sessionTeacherId, NOUVEAU).map((l) => l.number), [2, 4])
  // Le trait reste au cours 3 pour les deux cahiers de la classe.
  assert.equal(transferAfterLesson([transfer], transfer.boundaryLessonNumber)?.id, "t1")
})

test("le trait se tire sous le dernier cours de l'ancien professeur", () => {
  const { transfer } = sessionApresTransfert()
  assert.equal(transferAfterLesson([transfer], 3)?.id, "t1")
  assert.equal(transferAfterLesson([transfer], 2), undefined)
  assert.equal(transferAfterLesson([transfer], 4), undefined)
  assert.deepEqual(transfersBeforeFirstLesson([transfer]), [])
  assert.deepEqual(transfersBeforeFirstLesson([{ ...transfer, boundaryLessonNumber: 0 }]).length, 1)
})

test("l'ancien professeur est reconnu comme tel, le nouveau non", () => {
  const { transfer } = sessionApresTransfert()
  const session = { teacher: { id: NOUVEAU }, transfers: [transfer] }
  assert.equal(isFormerTeacher(session, ANCIEN), true)
  assert.equal(isFormerTeacher(session, NOUVEAU), false)
  assert.equal(transferFrom([transfer], ANCIEN)?.toTeacherName, "Nouveau")
  assert.equal(transferFrom([transfer], NOUVEAU), undefined)
})
