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
      supabase.from('moasem_students').select('id,name,grade,student_number').eq('program_id', programId).eq('active', true).order('name'),
      supabase.from('moasem_attendance').select('id,student_id,status,note').eq('program_id', programId).eq('session_date', sessionDate).eq('session_type', 'in_person'),
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
    const rows = records.map((record: { student_id: string; status: string; note?: string }) => ({
      program_id: programId,
      student_id: record.student_id,
      session_date: sessionDate,
      session_type: 'in_person',
      status: record.status,
      note: record.note || null,
      updated_at: new Date().toISOString(),
    }))

    const { error } = await supabase
      .from('moasem_attendance')
      .upsert(rows, { onConflict: 'student_id,session_date,session_type' })

    if (error) throw error
    return NextResponse.json({ ok: true })
  } catch (error) {
    if (error instanceof Error && error.message === 'UNAUTHORIZED') {
      return NextResponse.json({ error: '관리자 인증이 필요합니다.' }, { status: 401 })
    }
    return NextResponse.json({ error: '출석을 저장하지 못했습니다.' }, { status: 500 })
  }
}
