import { NextRequest, NextResponse } from 'next/server'
import { assertAdmin } from '@/lib/admin-auth'
import { getSupabaseAdmin } from '@/lib/supabase-admin'

export async function GET(request: NextRequest) {
  try {
    assertAdmin(request)
    const supabase = getSupabaseAdmin()
    const { data, error } = await supabase
      .from('moasem_programs')
      .select('id,name,starts_on,ends_on,week_count,status,in_person_weekdays,zoom_weekdays,zoom_meeting_number,institution:moasem_institutions(id,name),instructor:moasem_instructors(id,name)')
      .order('created_at', { ascending: false })

    if (error) throw error
    return NextResponse.json({ items: data ?? [] })
  } catch (error) {
    if (error instanceof Error && error.message === 'UNAUTHORIZED') {
      return NextResponse.json({ error: '관리자 인증이 필요합니다.' }, { status: 401 })
    }
    return NextResponse.json({ error: '프로그램 목록을 불러오지 못했습니다.' }, { status: 500 })
  }
}

export async function POST(request: NextRequest) {
  try {
    assertAdmin(request)
    const body = await request.json()
    const supabase = getSupabaseAdmin()

    let instructorId: string | null = null
    const instructorName = String(body.instructor_name ?? '').trim()
    if (instructorName) {
      const { data: instructor, error: instructorError } = await supabase
        .from('moasem_instructors')
        .insert({ name: instructorName, phone: body.instructor_phone || null })
        .select('id')
        .single()
      if (instructorError) throw instructorError
      instructorId = instructor.id
    }

    const { data, error } = await supabase
      .from('moasem_programs')
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
    if (error instanceof Error && error.message === 'UNAUTHORIZED') {
      return NextResponse.json({ error: '관리자 인증이 필요합니다.' }, { status: 401 })
    }
    return NextResponse.json({ error: '프로그램을 만들지 못했습니다.' }, { status: 500 })
  }
}
