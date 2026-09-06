import { NextRequest, NextResponse } from 'next/server'
import { AccessError, assertStaff, authErrorResponse, privateHeaders } from '@/lib/admin-auth'
import { uuidInput } from '@/lib/learning-operations'
import { koreaToday } from '@/lib/homework-review'
import { type WeeklyStudent, type ProgressRecord, type HomeworkRecord, type AttendanceRecord } from '@/lib/weekly-progress'
import { positiveNumber, publicWeeklyStudent, weeklyProgram, weeklyStudents, weeklyRecords, weeklyPeriod } from '@/lib/weekly-progress-data'
export const dynamic = 'force-dynamic'

export async function GET(req: NextRequest, { params }: { params: { studentId: string } }) {
  try {
    const staff = await assertStaff(req), studentId = uuidInput(params.studentId), programId = uuidInput(req.nextUrl.searchParams.get('program_id'))
    const number = positiveNumber(req.nextUrl.searchParams.get('week'))
    if (!number) throw new AccessError(400, '확인할 주차를 선택해 주세요.')
    const program = await weeklyProgram(staff, programId), week = weeklyPeriod(program, koreaToday(), number)
    const { data, error } = await weeklyStudents(staff, programId).eq('id', studentId).returns<WeeklyStudent[]>().maybeSingle()
    if (error) throw error
    if (!data) throw new AccessError(404, '현재 프로그램에서 사용 중인 학생만 확인할 수 있습니다.')
    const [progress, homework, attendance] = await Promise.all([
      weeklyRecords<ProgressRecord>(staff, programId, [studentId], 'student_progress_entries', 'id,student_id,lesson_date,created_at,book,unit,pages,learned,difficulties,next_assignment,teacher_note', week.starts_on, week.ends_on),
      weeklyRecords<HomeworkRecord>(staff, programId, [studentId], 'homework', 'id,student_id,title,details,assigned_on,due_on,status', week.starts_on, week.ends_on),
      weeklyRecords<AttendanceRecord>(staff, programId, [studentId], 'attendance', 'id,student_id,session_date,session_type,status,note', week.starts_on, week.ends_on),
    ])
    return NextResponse.json({ student: publicWeeklyStudent(data), week,
      progress: progress.sort((a, b) => b.lesson_date.localeCompare(a.lesson_date) || b.created_at.localeCompare(a.created_at) || b.id.localeCompare(a.id)).map(r => ({ id: r.id, student_id: r.student_id, lesson_date: r.lesson_date, created_at: r.created_at, book: r.book, unit: r.unit, pages: r.pages, learned: r.learned, difficulties: r.difficulties, next_assignment: r.next_assignment, teacher_note: r.teacher_note })),
      homework: homework.sort((a, b) => a.due_on.localeCompare(b.due_on) || a.id.localeCompare(b.id)).map(r => ({ id: r.id, student_id: r.student_id, title: r.title, details: r.details, assigned_on: r.assigned_on, due_on: r.due_on, status: r.status })),
      attendance: attendance.sort((a, b) => a.session_date.localeCompare(b.session_date) || a.session_type.localeCompare(b.session_type)).map(r => ({ id: r.id, student_id: r.student_id, session_date: r.session_date, session_type: r.session_type, status: r.status, note: r.note })),
    }, { headers: privateHeaders })
  } catch (error) { return authErrorResponse(error) || NextResponse.json({ error: '이번 주 기록을 불러오지 못했습니다. 다시 시도해 주세요.' }, { status: 500, headers: privateHeaders }) }
}
