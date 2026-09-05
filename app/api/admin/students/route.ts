import { NextRequest, NextResponse } from 'next/server'
import { assertAdmin, assertStaff, authErrorResponse } from '@/lib/admin-auth'
import { getSupabaseAdmin } from '@/lib/supabase-admin'

export const dynamic = 'force-dynamic'

export async function GET(request: NextRequest) {
  try {
    const staff = await assertStaff(request)
    const supabase = getSupabaseAdmin()
    let query = supabase
      .from('students')
      .select('id,name,grade,student_number,active,program:programs!inner(id,name,institution:institutions(id,name)),guardian:guardians(id,name,phone,language)')
      .order('created_at', { ascending: false })
    if (staff.role === 'instructor') query = query.eq('program.instructor_id', staff.instructor_id!)
    const { data, error } = await query

    if (error) throw error
    return NextResponse.json({ items: data ?? [] })
  } catch (error) {
    const denied = authErrorResponse(error)
    if (denied) return denied
    return NextResponse.json({ error: '학생 목록을 불러오지 못했습니다.' }, { status: 500 })
  }
}

export async function POST(request: NextRequest) {
  try {
    await assertAdmin(request)
    const body = await request.json()
    const supabase = getSupabaseAdmin()

    const guardianPhone = String(body.guardian_phone ?? '').trim()
    if (!guardianPhone) {
      return NextResponse.json({ error: '보호자 연락처를 입력하세요.' }, { status: 400 })
    }

    const { data: guardian, error: guardianError } = await supabase
      .from('guardians')
      .insert({
        name: body.guardian_name || null,
        phone: guardianPhone,
        language: body.guardian_language || 'ko',
      })
      .select('id')
      .single()

    if (guardianError) throw guardianError

    const { data: student, error: studentError } = await supabase
      .from('students')
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
      await supabase.from('guardians').delete().eq('id', guardian.id)
      throw studentError
    }

    return NextResponse.json({ item: student }, { status: 201 })
  } catch (error) {
    const denied = authErrorResponse(error)
    if (denied) return denied
    return NextResponse.json({ error: '학생을 등록하지 못했습니다.' }, { status: 500 })
  }
}
