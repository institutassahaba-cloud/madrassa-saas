function clean(value: string | null | undefined) {
  return (value || "").trim()
}

export function extractTeacherEmoji(name: string | null | undefined) {
  const value = clean(name)
  const match = value.match(/[\p{Extended_Pictographic}\u2600-\u27BF]/u)
  return match?.[0] ?? null
}

export function studentLabelWithTeacherEmoji(
  studentName: string,
  teacherNames: Array<string | null | undefined> | string | null | undefined
) {
  const names = Array.isArray(teacherNames) ? teacherNames : [teacherNames]
  const emojis = [...new Set(names.map(extractTeacherEmoji).filter(Boolean))]
  return [emojis.join(" "), clean(studentName)].filter(Boolean).join(" ").trim()
}
