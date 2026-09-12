import { AccessError } from './admin-auth'
import { getSupabaseAdmin } from './supabase-admin'
import type { Staff } from './staff-types'
import { weekWindow, programWeek, type WeeklyProgram, type WeeklyStudent } from './weekly-progress'

export function positiveNumber(value: string | null, fallback?: number) {
  if (value === null) return fallback
  if (!/^[1-9]\d{0,5}$/.test(value)) throw new AccessError(400, '주차와 학생 페이지를 확인해 주세요.')
  return Number(value)
}
export async function weeklyProgram(staff: Staff, programId: string): Promise<WeeklyProgram> {
  let query = getSupabaseAdmin().from('programs').select('id,name,starts_on,ends_on,week_count,institution:institutions(name)').eq('id', programId)
  if (staff.role === 'instructor') query = query.eq('instructor_id', staff.instructor_id!)
  const { data, error } = await query.returns<WeeklyProgram[]>().maybeSingle()
  if (error) throw error
  if (!data) throw new AccessError(403, '담당 프로그램만 확인할 수 있습니다.')
  return { id: data.id, name: data.name, starts_on: data.starts_on, ends_on: data.ends_on, week_count: data.week_count, institution: data.institution ? { name: data.institution.name } : null }
}
export function weeklyWindow(program: WeeklyProgram, today: string, start?: number) {
  try { return weekWindow(program, today, start) } catch (error) { throw dateError(error) }
}
export function weeklyPeriod(program: WeeklyProgram, today: string, week: number) {
  try { return programWeek(program, week, today) } catch (error) { throw dateError(error) }
}
function dateError(error: unknown) {
  return new AccessError(400, error instanceof Error && error.message === 'INVALID_WEEK' ? '프로그램 기간 안의 주차를 선택해 주세요.' : '프로그램 시작일과 종료일을 확인해 주세요.')
}
export function weeklyStudents(staff: Staff, programId: string) {
  let query = getSupabaseAdmin().from('students').select('id,name,grade,student_number,program:programs!inner(instructor_id)', { count: 'exact' }).eq('program_id', programId).eq('active', true)
  if (staff.role === 'instructor') query = query.eq('program.instructor_id', staff.instructor_id!)
  return query
}
export function publicWeeklyStudent(student: WeeklyStudent): WeeklyStudent {
  return { id: student.id, name: student.name, grade: student.grade, student_number: student.student_number }
}

type Table = 'student_progress_entries' | 'homework' | 'attendance'
const dateColumn: Record<Table, string> = { student_progress_entries: 'lesson_date', homework: 'due_on', attendance: 'session_date' }
// Bound every read to the displayed students and dates, and recheck current scope in each query.
export async function weeklyRecords<T>(staff: Staff, programId: string, students: string[], table: Table, columns: string, starts: string, ends: string): Promise<T[]> {
  if (!students.length) return []
  const rows: T[] = []
  for (;;) {
    let query = getSupabaseAdmin().from(table).select(`${columns},student:students!inner(program_id,active),program:programs!inner(instructor_id)`, { count: 'exact' })
      .eq('program_id', programId).eq('student.program_id', programId).eq('student.active', true).in('student_id', students)
      .gte(dateColumn[table], starts).lte(dateColumn[table], ends)
    if (staff.role === 'instructor') query = query.eq('program.instructor_id', staff.instructor_id!)
    const { data, error, count } = await query.order('id', { ascending: true }).range(rows.length, rows.length + 999).returns<T[]>()
    if (error) throw error
    if (count === null) throw Error('Record count unavailable')
    rows.push(...(data ?? []))
    if (rows.length >= count) break
    if (!data?.length) throw Error('Incomplete weekly records')
  }
  return rows
}
