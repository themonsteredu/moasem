import { NextRequest, NextResponse } from 'next/server'
import { assertAdmin } from '@/lib/admin-auth'
import { getSupabaseAdmin } from '@/lib/supabase-admin'

export async function GET(request: NextRequest) {
  try {
    assertAdmin(request)
    const programId = request.nextUrl.searchParams.get('program_id')
    const sessionDate = request.nextUrl.searchParams.get('session_date')
    if (!programId || !sessionDate) {
      return NextResponse.json({ error: '프로그램과 수업일을 선택하세요.' }, { status: 400 })
    }

    const supabase = getSupabaseAdmin()
    const [{ data: students, error: studentError }, { data: attendance, error: attendanceError }] = await Promise.all([
      supabase.from('students').select('id,name,grade,student_number').eq('program_id', programId).eq('active', true).order('name'),
      supabase.from('attendance').select('id,student_id,status,note').eq('program_id', programId).eq('session_date', sessionDate).eq('session_type', 'in_person'),
    ])

    if (studentError) throw studentError
    if (attendanceError) throw attendanceError

    const byStudent = new Map((attendance ?? []).map(item => [item.student_id, item]))
    const items = (students ?? []).map(student => ({
      ...student,
      status: byStudent.get(student.id)?.status ?? 'present',
      note: byStudent.get(student.id)?.note ?? '',
    }))

    return NextResponse.json({ items })
  } catch (error) {
    if (error instanceof Error && error.message === 'UNAUTHORIZED') {
      return NextResponse.json({ error: '관리자 인증이 필요합니다.' }, { status: 401 })
    }
    return NextResponse.json({ error: '출석 정보를 불러오지 못했습니다.' }, { status: 500 })
  }
}

export async function POST(request: NextRequest) {
  try {
    assertAdmin(request)
    const body = await request.json()
    const programId = String(body.program_id ?? '')
    const sessionDate = String(body.session_date ?? '')
    const records = Array.isArray(body.records) ? body.records : []

    if (!programId || !sessionDate || !records.length) {
      return NextResponse.json({ error: '출석 정보를 확인하세요.' }, { status: 400 })
    }

    const supabase = getSupabaseAdmin()
    const recordStudentIds = records.map((record: { student_id: string }) => String(record.student_id))
    const { data: validStudents, error: validStudentError } = await supabase
      .from('students')
      .select('id')
      .eq('program_id', programId)
      .in('id', recordStudentIds)

    if (validStudentError) throw validStudentError
    const validIds = new Set((validStudents ?? []).map(student => student.id))
    if (validIds.size !== new Set(recordStudentIds).size) {
      return NextResponse.json({ error: '선택한 프로그램에 속하지 않은 학생이 포함되어 있습니다.' }, { status: 400 })
    }

    const allowedStatuses = new Set(['present','absent','late','excused'])
    const rows = records.map((record: { student_id: string; status: string; note?: string }) => {
      if (!allowedStatuses.has(record.status)) throw new Error('INVALID_STATUS')
      return {
        program_id: programId,
        student_id: record.student_id,
        session_date: sessionDate,
        session_type: 'in_person',
        status: record.status,
        note: record.note || null,
        updated_at: new Date().toISOString(),
      }
    })

    const { error } = await supabase
      .from('attendance')
      .upsert(rows, { onConflict: 'student_id,session_date,session_type' })

    if (error) throw error
    return NextResponse.json({ ok: true })
  } catch (error) {
    if (error instanceof Error && error.message === 'UNAUTHORIZED') {
      return NextResponse.json({ error: '관리자 인증이 필요합니다.' }, { status: 401 })
    }
    if (error instanceof Error && error.message === 'INVALID_STATUS') {
      return NextResponse.json({ error: '올바르지 않은 출석 상태가 포함되어 있습니다.' }, { status: 400 })
    }
    return NextResponse.json({ error: '출석을 저장하지 못했습니다.' }, { status: 500 })
  }
}
