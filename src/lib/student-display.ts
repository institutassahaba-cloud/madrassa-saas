function clean(value: string | null | undefined) {
  return (value || "").trim()
}

export function extractTeacherEmoji(name: string | null | undefined) {
  const firstToken = clean(name).split(/\s+/)[0] || ""
  if (!firstToken) return null
  return /[\p{Extended_Pictographic}\u2600-\u27BF]/u.test(firstToken) ? firstToken : null
}

export function studentLabelWithTeacherEmoji(
  studentName: string,
  teacherNames: Array<string | null | undefined> | string | null | undefined
) {
  const names = Array.isArray(teacherNames) ? teacherNames : [teacherNames]
  const emojis = [...new Set(names.map(extractTeacherEmoji).filter(Boolean))]
  return [emojis.join(" "), clean(studentName)].filter(Boolean).join(" ").trim()
}
