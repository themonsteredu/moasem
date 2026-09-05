import { NextRequest, NextResponse } from 'next/server'
import { assertStaff, assertProgramAccess, authErrorResponse } from '@/lib/admin-auth'
import { getSupabaseAdmin } from '@/lib/supabase-admin'

const allowedLanguages = new Set(['ko', 'vi', 'zh-CN'])

export const dynamic = 'force-dynamic'

export async function POST(request: NextRequest) {
  try {
    const staff = await assertStaff(request)
    const body = await request.json()
    const studentId = String(body.student_id ?? '')
    const lessonDate = String(body.lesson_date ?? '')
    const solvedCount = Number(body.solved_count ?? 0)
    const wrongCount = Number(body.wrong_count ?? 0)

    if (!studentId || !lessonDate) {
      return NextResponse.json({ error: '학생과 수업일을 확인하세요.' }, { status: 400 })
    }
    if (!Number.isInteger(solvedCount) || !Number.isInteger(wrongCount) || solvedCount < 0 || wrongCount < 0 || wrongCount > solvedCount) {
      return NextResponse.json({ error: '문제 수와 틀린 문제 수를 확인하세요.' }, { status: 400 })
    }

    const supabase = getSupabaseAdmin()
    const { data: student, error: studentError } = await supabase
      .from('students')
      .select('id,program_id,guardian_id,guardian:guardians(id,language)')
      .eq('id', studentId)
      .single()
    if (studentError || !student) {
      return NextResponse.json({ error: '학생 정보를 찾지 못했습니다.' }, { status: 404 })
    }

    await assertProgramAccess(staff, student.program_id)
    const guardian = Array.isArray(student.guardian) ? student.guardian[0] : student.guardian
    const requestedLanguage = String(body.language || guardian?.language || 'ko')
    const language = allowedLanguages.has(requestedLanguage) ? requestedLanguage : 'ko'

    const { data: log, error: logError } = await supabase
      .from('learning_logs')
      .insert({
        student_id: student.id,
        program_id: student.program_id,
        lesson_date: lessonDate,
        solved_count: solvedCount,
        wrong_count: wrongCount,
        wrong_type_summary: body.wrong_type_summary || null,
        weekly_assignment: body.weekly_assignment || null,
        video_url: body.video_url || null,
        teacher_note: body.teacher_note || null,
      })
      .select('id')
      .single()
    if (logError) throw logError

    const { data: report, error: reportError } = await supabase
      .from('guardian_reports')
      .insert({
        student_id: student.id,
        guardian_id: student.guardian_id,
        learning_log_id: log.id,
        language,
        headline: body.headline || null,
        action_line: body.action_line || null,
      })
      .select('token,expires_at')
      .single()

    if (reportError) {
      await supabase.from('learning_logs').delete().eq('id', log.id)
      throw reportError
    }

    return NextResponse.json({ token: report.token, expires_at: report.expires_at }, { status: 201 })
  } catch (error) {
    const denied = authErrorResponse(error)
    if (denied) return denied
    return NextResponse.json({ error: '리포트를 만들지 못했습니다.' }, { status: 500 })
  }
}
