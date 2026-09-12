import { NextRequest, NextResponse } from 'next/server'
import { assertStaff, authErrorResponse, privateHeaders } from '@/lib/admin-auth'
import { uuidInput } from '@/lib/learning-operations'
import { koreaToday } from '@/lib/homework-review'
import { summarizeWeeks, weeklyPageSize, type WeeklyStudent, type ProgressRecord, type HomeworkRecord, type AttendanceRecord } from '@/lib/weekly-progress'
import { positiveNumber, publicWeeklyStudent, weeklyProgram, weeklyStudents, weeklyRecords, weeklyWindow } from '@/lib/weekly-progress-data'
export const dynamic = 'force-dynamic'

export async function GET(req: NextRequest) {
  try {
    const staff = await assertStaff(req), params = req.nextUrl.searchParams, programId = uuidInput(params.get('program_id'))
    const page = positiveNumber(params.get('page'), 1)!, start = positiveNumber(params.get('week_start')), today = koreaToday()
    const program = await weeklyProgram(staff, programId), window = weeklyWindow(program, today, start)
    const { data, error, count } = await weeklyStudents(staff, programId).order('name', { ascending: true }).order('id', { ascending: true })
      .range((page - 1) * weeklyPageSize, page * weeklyPageSize - 1).returns<WeeklyStudent[]>()
    if (error && !(page > 1 && error.code === 'PGRST103')) throw error
    if (!error && count === null) throw Error('Student count unavailable')
    const students = (data ?? []).map(publicWeeklyStudent), ids = students.map(s => s.id)
    const from = window.weeks[0].starts_on, to = window.weeks[window.weeks.length - 1].ends_on
    const [progress, homework, attendance] = await Promise.all([
      weeklyRecords<ProgressRecord>(staff, programId, ids, 'student_progress_entries', 'id,student_id,lesson_date,created_at,book,unit,pages', from, to),
      weeklyRecords<HomeworkRecord>(staff, programId, ids, 'homework', 'id,student_id,due_on,status', from, to),
      weeklyRecords<AttendanceRecord>(staff, programId, ids, 'attendance', 'id,student_id,session_date,session_type,status', from, to),
    ])
    return NextResponse.json({ program, today, ...window, rows: summarizeWeeks(students, window.weeks, progress, homework, attendance, today), total_students: count ?? 0, page, page_size: weeklyPageSize }, { headers: privateHeaders })
  } catch (error) { return authErrorResponse(error) || NextResponse.json({ error: '주차별 진도표를 불러오지 못했습니다. 다시 시도해 주세요.' }, { status: 500, headers: privateHeaders }) }
}
