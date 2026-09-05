import { NextRequest, NextResponse } from 'next/server'
import { assertAdmin, assertStaff, AccessError, authErrorResponse } from '@/lib/admin-auth'
import { getSupabaseAdmin } from '@/lib/supabase-admin'

export const dynamic = 'force-dynamic'

export async function GET(request: NextRequest) {
  try {
    const staff = await assertStaff(request)
    const supabase = getSupabaseAdmin()
    let query = supabase
      .from('programs')
      .select('id,name,starts_on,ends_on,week_count,status,in_person_weekdays,zoom_weekdays,zoom_meeting_number,institution:institutions(id,name),instructor:instructors(id,name)')
      .order('created_at', { ascending: false })
    if (staff.role === 'instructor') query = query.eq('instructor_id', staff.instructor_id!)
    const { data, error } = await query

    if (error) throw error
    return NextResponse.json({ items: data ?? [] })
  } catch (error) {
    const denied = authErrorResponse(error)
    if (denied) return denied
    return NextResponse.json({ error: '프로그램 목록을 불러오지 못했습니다.' }, { status: 500 })
  }
}

export async function POST(request: NextRequest) {
  try {
    await assertAdmin(request)
    const body = await request.json()
    const supabase = getSupabaseAdmin()

    const instructorId = body.instructor_id || null
    if (instructorId) {
      const { data: instructor, error } = await supabase.from('staff_accounts')
        .select('id').eq('instructor_id', instructorId).eq('role', 'instructor').eq('active', true).maybeSingle()
      if (error) throw error
      if (!instructor) throw new AccessError(400, '사용 중인 강사를 선택하세요.')
    }

    const { data, error } = await supabase
      .from('programs')
      .insert({
        institution_id: body.institution_id,
        name: String(body.name ?? '').trim(),
        starts_on: body.starts_on,
        ends_on: body.ends_on,
        week_count: Number(body.week_count),
        instructor_id: instructorId,
        in_person_weekdays: body.in_person_weekdays ?? [],
        zoom_weekdays: body.zoom_weekdays ?? [],
        zoom_meeting_number: body.zoom_meeting_number || null,
        zoom_password: body.zoom_password || null,
      })
      .select()
      .single()

    if (error) throw error
    return NextResponse.json({ item: data }, { status: 201 })
  } catch (error) {
    const denied = authErrorResponse(error)
    if (denied) return denied
    return NextResponse.json({ error: '프로그램을 만들지 못했습니다.' }, { status: 500 })
  }
}
