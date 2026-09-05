import { AccessError } from './admin-auth'
export function koreaToday() { return new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Seoul', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date()) }
export function progressInput(body: Record<string, unknown>) {
  const limits = { book: 200, unit: 200, pages: 100, next_assignment: 2000, learned: 2000, difficulties: 2000, teacher_note: 2000 }
  const result: Record<string, string> = {}
  for (const [key, max] of Object.entries(limits)) {
    if (typeof body[key] !== 'string' || (body[key] as string).trim().length > max) throw new AccessError(400, '입력한 내용의 길이를 확인해 주세요.')
    result[key] = (body[key] as string).trim()
  }
  if (!result.book) throw new AccessError(400, '교재명을 입력해 주세요.')
  const day = body.lesson_date
  if (typeof day !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(day) || !Number.isFinite(Date.parse(day)) || new Date(day).toISOString().slice(0, 10) !== day || day > koreaToday() || day < '2000-01-01') throw new AccessError(400, '오늘까지의 올바른 수업 날짜를 입력해 주세요.')
  return { ...result, lesson_date: day }
}
