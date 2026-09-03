import { NextRequest, NextResponse } from 'next/server'
import { getSupabaseAdmin } from '@/lib/supabase-admin'

export async function GET(_request: NextRequest, { params }: { params: { token: string } }) {
  try {
    const supabase = getSupabaseAdmin()
    const { data: institution, error: institutionError } = await supabase
      .from('moasem_institutions')
      .select('id,name,logo_url,manager_name')
      .eq('portal_token', params.token)
      .single()

    if (institutionError || !institution) {
      return NextResponse.json({ error: '유효하지 않은 기관 링크입니다.' }, { status: 404 })
    }

    const { data: programs, error: programError } = await supabase
      .from('moasem_programs')
      .select('id,name,starts_on,ends_on,status')
      .eq('institution_id', institution.id)
      .order('starts_on', { ascending: false })

    if (programError) throw programError
    const programIds = (programs ?? []).map(program => program.id)

    if (!programIds.length) {
      return NextResponse.json({ institution, programs: [], students: [], attendance: [] })
    }

    const [{ data: students, error: studentError }, { data: attendance, error: attendanceError }] = await Promise.all([
      supabase
        .from('moasem_students')
        .select('id,name,grade,program_id,student_number')
        .in('program_id', programIds)
        .eq('active', true)
        .order('name'),
      supabase
        .from('moasem_attendance')
        .select('student_id,program_id,session_date,session_type,status')
        .in('program_id', programIds)
        .order('session_date', { ascending: false })
        .limit(500),
    ])

    if (studentError) throw studentError
    if (attendanceError) throw attendanceError

    return NextResponse.json({ institution, programs: programs ?? [], students: students ?? [], attendance: attendance ?? [] })
  } catch {
    return NextResponse.json({ error: '기관 현황을 불러오지 못했습니다.' }, { status: 500 })
  }
}
