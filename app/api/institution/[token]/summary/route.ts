import { NextRequest, NextResponse } from 'next/server'
import { getSupabaseAdmin } from '@/lib/supabase-admin'

export const dynamic = 'force-dynamic'
export const revalidate = 0

const privateHeaders = {
  'Cache-Control': 'private, no-store, max-age=0',
  'X-Robots-Tag': 'noindex, nofollow, noarchive',
}

export async function GET(_request: NextRequest, { params }: { params: { token: string } }) {
  try {
    const supabase = getSupabaseAdmin()
    const { data: institution, error: institutionError } = await supabase
      .from('institutions')
      .select('id,name,logo_url,manager_name')
      .eq('portal_token', params.token)
      .single()

    if (institutionError || !institution) {
      return NextResponse.json(
        { error: '유효하지 않은 기관 링크입니다.' },
        { status: 404, headers: privateHeaders },
      )
    }

    const { data: programs, error: programError } = await supabase
      .from('programs')
      .select('id,name,starts_on,ends_on,status')
      .eq('institution_id', institution.id)
      .order('starts_on', { ascending: false })

    if (programError) throw programError
    const programIds = (programs ?? []).map(program => program.id)

    if (!programIds.length) {
      return NextResponse.json(
        { institution, programs: [], students: [], attendance: [] },
        { headers: privateHeaders },
      )
    }

    const { data: students, error: studentError } = await supabase
      .from('students')
      .select('id,name,grade,program_id,student_number')
      .in('program_id', programIds)
      .eq('active', true)
      .order('name')

    if (studentError) throw studentError

    const attendance: Array<{student_id:string;program_id:string;session_date:string;session_type:string;status:string}> = []
    const pageSize = 1000
    for (let from = 0; ; from += pageSize) {
      const { data: page, error } = await supabase
        .from('attendance')
        .select('student_id,program_id,session_date,session_type,status')
        .in('program_id', programIds)
        .order('session_date', { ascending: false })
        .range(from, from + pageSize - 1)
      if (error) throw error
      attendance.push(...(page ?? []))
      if (!page || page.length < pageSize) break
    }

    return NextResponse.json(
      { institution, programs: programs ?? [], students: students ?? [], attendance },
      { headers: privateHeaders },
    )
  } catch {
    return NextResponse.json(
      { error: '기관 현황을 불러오지 못했습니다.' },
      { status: 500, headers: privateHeaders },
    )
  }
}
