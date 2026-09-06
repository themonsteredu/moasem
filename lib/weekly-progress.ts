export const weeklyPageSize = 25
export const weeksPerView = 4
const dayMs = 86400000
export type WeeklyProgram = { id: string; name: string; starts_on: string; ends_on: string; week_count: number; institution: { name: string } | null }
export type WeeklyStudent = { id: string; name: string; grade: number; student_number: string | null }
export type ProgramWeek = { number: number; starts_on: string; ends_on: string; phase: 'past' | 'current' | 'upcoming' }
export type ProgressRecord = { id: string; student_id: string; lesson_date: string; created_at: string; book: string; unit: string; pages: string; learned?: string; difficulties?: string; next_assignment?: string; teacher_note?: string }
export type HomeworkRecord = { id: string; student_id: string; due_on: string; status: 'assigned' | 'submitted' | 'checked'; title?: string; details?: string; assigned_on?: string }
export type AttendanceRecord = { id: string; student_id: string; session_date: string; session_type: 'in_person' | 'zoom'; status: 'present' | 'late' | 'absent' | 'excused'; note?: string }
export type AttendanceCount = { total: number; present: number; late: number; absent: number; excused: number }
export type WeeklyCell = {
  week: number; progress_count: number; latest: Pick<ProgressRecord, 'lesson_date' | 'book' | 'unit' | 'pages'> | null
  homework: { total: number; submitted: number; checked: number; assigned: number; overdue: number }
  attendance: { in_person: AttendanceCount; zoom: AttendanceCount }
}
export type WeeklyOverview = {
  program: WeeklyProgram; today: string; total_weeks: number; week_start: number; weeks: ProgramWeek[]
  rows: { student: WeeklyStudent; cells: WeeklyCell[] }[]; total_students: number; page: number; page_size: number
}
export type WeeklyDetail = { student: WeeklyStudent; week: ProgramWeek; progress: ProgressRecord[]; homework: HomeworkRecord[]; attendance: AttendanceRecord[] }
export const attendanceLabels = { present: '출석', late: '지각', absent: '결석', excused: '인정결석' } as const
export const homeworkLabels = { assigned: '미제출', submitted: '확인 대기', checked: '확인 완료' } as const

function dateValue(date: string) {
  const value = Date.parse(date)
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || !Number.isFinite(value) || new Date(value).toISOString().slice(0, 10) !== date) throw Error('INVALID_PROGRAM_DATES')
  return value
}
export function programWeekCount(program: Pick<WeeklyProgram, 'starts_on' | 'ends_on'>) {
  const days = (dateValue(program.ends_on) - dateValue(program.starts_on)) / dayMs + 1
  if (days < 1) throw Error('INVALID_PROGRAM_DATES')
  return Math.ceil(days / 7)
}
export function programWeek(program: WeeklyProgram, number: number, today: string): ProgramWeek {
  if (!Number.isInteger(number) || number < 1 || number > programWeekCount(program)) throw Error('INVALID_WEEK')
  const start = dateValue(program.starts_on) + (number - 1) * 7 * dayMs
  const starts_on = new Date(start).toISOString().slice(0, 10)
  const ends_on = new Date(Math.min(start + 6 * dayMs, dateValue(program.ends_on))).toISOString().slice(0, 10)
  return { number, starts_on, ends_on, phase: today < starts_on ? 'upcoming' : today > ends_on ? 'past' : 'current' }
}
export function weekWindow(program: WeeklyProgram, today: string, requestedStart?: number) {
  const total = programWeekCount(program)
  const current = Math.max(1, Math.min(total, Math.floor((dateValue(today) - dateValue(program.starts_on)) / (7 * dayMs)) + 1))
  const start = requestedStart ?? Math.floor((current - 1) / weeksPerView) * weeksPerView + 1
  if (!Number.isInteger(start) || start < 1 || start > total) throw Error('INVALID_WEEK')
  return { total_weeks: total, week_start: start, weeks: Array.from({ length: Math.min(weeksPerView, total - start + 1) }, (_, i) => programWeek(program, start + i, today)) }
}
const attendanceCount = (): AttendanceCount => ({ total: 0, present: 0, late: 0, absent: 0, excused: 0 })
const inWeek = (date: string, week: ProgramWeek) => date >= week.starts_on && date <= week.ends_on
export function summarizeWeeks(students: WeeklyStudent[], weeks: ProgramWeek[], progress: ProgressRecord[], homework: HomeworkRecord[], attendance: AttendanceRecord[], today: string) {
  const rows = students.map(student => ({ student, cells: weeks.map(week => ({ week: week.number, progress_count: 0, latest: null, homework: { total: 0, submitted: 0, checked: 0, assigned: 0, overdue: 0 }, attendance: { in_person: attendanceCount(), zoom: attendanceCount() } } as WeeklyCell)) }))
  const byStudent = new Map(rows.map(row => [row.student.id, row]))
  const cellFor = (studentId: string, date: string) => byStudent.get(studentId)?.cells[weeks.findIndex(w => inWeek(date, w))]
  // Latest lesson date, then latest saved entry, then ID; no arbitrary page order.
  const sorted = [...progress].sort((a, b) => b.lesson_date.localeCompare(a.lesson_date) || b.created_at.localeCompare(a.created_at) || b.id.localeCompare(a.id))
  for (const record of sorted) {
    const cell = cellFor(record.student_id, record.lesson_date)
    if (!cell) continue
    cell.progress_count++
    cell.latest ??= { lesson_date: record.lesson_date, book: record.book, unit: record.unit, pages: record.pages }
  }
  for (const record of homework) {
    const cell = cellFor(record.student_id, record.due_on)
    if (!cell) continue
    cell.homework.total++; cell.homework[record.status]++
    if (record.status === 'assigned' && record.due_on < today) cell.homework.overdue++
  }
  for (const record of attendance) {
    const cell = cellFor(record.student_id, record.session_date)
    if (!cell) continue
    const count = cell.attendance[record.session_type]
    count.total++; count[record.status]++
  }
  return rows
}
export function attendanceSummary(count: AttendanceCount) { return count.total ? `${count.present + count.late}/${count.total}` : '—' }
export function hasWeeklyRecords(cell: WeeklyCell) { return cell.progress_count + cell.homework.total + cell.attendance.in_person.total + cell.attendance.zoom.total > 0 }
