import { NextRequest, NextResponse } from 'next/server'
import { assertAdmin } from '@/lib/admin-auth'
import { getSupabaseAdmin } from '@/lib/supabase-admin'

export async function GET(request: NextRequest) {
  try {
    assertAdmin(request)
    const supabase = getSupabaseAdmin()
    const { data, error } = await supabase
      .from('moasem_students')
      .select('id,name,grade,student_number,active,program:moasem_programs(id,name,institution:moasem_institutions(id,name)),guardian:moasem_guardians(id,name,phone,language)')
      .order('created_at', { ascending: false })

    if (error) throw error
    return NextResponse.json({ items: data ?? [] })
  } catch (error) {
    if (error instanceof Error && error.message === 'UNAUTHORIZED') {
      return NextResponse.json({ error: '관리자 인증이 필요합니다.' }, { status: 401 })
    }
    return NextResponse.json({ error: '학생 목록을 불러오지 못했습니다.' }, { status: 500 })
  }
}

export async function POST(request: NextRequest) {
  try {
    assertAdmin(request)
    const body = await request.json()
    const supabase = getSupabaseAdmin()

    const guardianPhone = String(body.guardian_phone ?? '').trim()
    if (!guardianPhone) {
      return NextResponse.json({ error: '보호자 연락처를 입력하세요.' }, { status: 400 })
    }

    const { data: guardian, error: guardianError } = await supabase
      .from('moasem_guardians')
      .insert({
        name: body.guardian_name || null,
        phone: guardianPhone,
        language: body.guardian_language || 'ko',
      })
      .select('id')
      .single()

    if (guardianError) throw guardianError

    const { data: student, error: studentError } = await supabase
      .from('moasem_students')
      .insert({
        program_id: body.program_id,
        guardian_id: guardian.id,
        name: String(body.name ?? '').trim(),
        grade: Number(body.grade),
        student_number: body.student_number || null,
      })
      .select()
      .single()

    if (studentError) {
      await supabase.from('moasem_guardians').delete().eq('id', guardian.id)
      throw studentError
    }

    return NextResponse.json({ item: student }, { status: 201 })
  } catch (error) {
    if (error instanceof Error && error.message === 'UNAUTHORIZED') {
      return NextResponse.json({ error: '관리자 인증이 필요합니다.' }, { status: 401 })
    }
    return NextResponse.json({ error: '학생을 등록하지 못했습니다.' }, { status: 500 })
  }
}
