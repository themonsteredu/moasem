import { NextRequest, NextResponse } from 'next/server'
import { assertStaff, assertProgramAccess, authErrorResponse, privateHeaders } from '@/lib/admin-auth'
import { getSupabaseAdmin } from '@/lib/supabase-admin'
import { safeVideoUrl } from '@/lib/report-resources'

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
    const typeIds = body.wrong_type_ids ?? []
    if (!Array.isArray(typeIds) || typeIds.length > 100 || typeIds.some(id => typeof id !== 'string' || !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id)) || new Set(typeIds).size !== typeIds.length) {
      return NextResponse.json({ error: '선택한 오답 유형을 확인해 주세요.' }, { status: 400 })
    }
    if (wrongCount === 0 && typeIds.length) return NextResponse.json({ error: '오답 유형을 선택했다면 틀린 문제 수를 입력해 주세요.' }, { status: 400 })
    const videoUrl = safeVideoUrl(body.video_url)
    if (body.video_url && (!videoUrl || videoUrl.length > 2048)) return NextResponse.json({ error: '올바른 영상 주소를 입력해 주세요.' }, { status: 400 })

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

    const { data, error } = await supabase.rpc('create_staff_learning_report', {
      p_staff_id: staff.id,
      p_student_id: student.id,
      p_wrong_type_ids: typeIds,
      p_payload: {
        lesson_date: lessonDate, solved_count: solvedCount, wrong_count: wrongCount, language,
        wrong_type_summary: body.wrong_type_summary || null, weekly_assignment: body.weekly_assignment || null,
        video_url: videoUrl, teacher_note: body.teacher_note || null,
        headline: body.headline || null, action_line: body.action_line || null,
      },
    })
    if (error) {
      if (['STAFF_ACCESS_DENIED', 'PROGRAM_ACCESS_DENIED'].some(code => error.message.includes(code))) return NextResponse.json({ error: '담당 프로그램과 계정 상태를 확인해 주세요.' }, { status: 403 })
      if (['INVALID_WRONG_TYPES', 'WRONG_COUNT_REQUIRED'].some(code => error.message.includes(code))) return NextResponse.json({ error: '오답 유형이 변경되었거나 사용할 수 없습니다. 새로고침 후 다시 선택해 주세요.' }, { status: 400 })
      if (['INVALID_REPORT', 'INVALID_VIDEO_URL'].some(code => error.message.includes(code)) || error.code?.startsWith('22')) return NextResponse.json({ error: '수업일과 입력 내용을 확인해 주세요.' }, { status: 400 })
      throw error
    }
    return NextResponse.json(data, { status: 201, headers: privateHeaders })
  } catch (error) {
    const denied = authErrorResponse(error)
    if (denied) return denied
    return NextResponse.json({ error: '리포트를 만들지 못했습니다.' }, { status: 500 })
  }
}
