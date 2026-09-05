import { NextRequest, NextResponse } from 'next/server'
import { assertAdmin, assertStaff, authErrorResponse } from '@/lib/admin-auth'
import { getSupabaseAdmin } from '@/lib/supabase-admin'
import { isSupportedLanguage } from '@/lib/languages'
import { summarizeConsent } from '@/lib/consent-view'
import { consentError, consentHeaders, consentId, readConsentBody } from '@/lib/guardian-consent'

export const dynamic = 'force-dynamic'

export async function GET(request: NextRequest) {
  try {
    const staff = await assertStaff(request)
    const supabase = getSupabaseAdmin()
    let query = supabase
      .from('students')
      .select('id,name,grade,student_number,active,is_under_14,program_id,guardian_id,program:programs!inner(id,name,institution:institutions(id,name)),guardian:guardians(id,name,phone,language),consent_requests:guardian_consent_requests(guardian_id,program_id,guardian_phone,records:guardian_consent_records(language,consented_at))')
      .order('created_at', { ascending: false })
    if (staff.role === 'instructor') query = query.eq('program.instructor_id', staff.instructor_id!)
    const { data, error } = await query

    if (error) throw error
    const items = (data ?? []).map(row => {
      const consent = summarizeConsent(row)
      const { consent_requests: _requests, program_id: _program, guardian_id: _guardian, ...student } = row
      return { ...student, consent }
    })
    return NextResponse.json({ items }, { headers: consentHeaders })
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
    if (!isSupportedLanguage(body.guardian_language) || !Object.prototype.hasOwnProperty.call(body, 'is_under_14') || ![true, false, null].includes(body.is_under_14)) {
      return NextResponse.json({ error: '보호자 언어와 만 14세 미만 여부를 확인해 주세요.' }, { status: 400, headers: consentHeaders })
    }
    if (!String(body.name ?? '').trim() || !Number.isInteger(Number(body.grade)) || Number(body.grade) < 1 || Number(body.grade) > 12) {
      return NextResponse.json({ error: '학생 이름과 학년을 확인해 주세요.' }, { status: 400, headers: consentHeaders })
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
        is_under_14: body.is_under_14,
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

export async function PATCH(request: NextRequest) {
  try {
    const staff = await assertAdmin(request)
    const body = await readConsentBody(request)
    if (!Object.prototype.hasOwnProperty.call(body, 'is_under_14') || ![true, false, null].includes(body.is_under_14 as boolean | null) || !isSupportedLanguage(body.guardian_language)) {
      return NextResponse.json({ error: '연령 확인과 안내 언어를 선택해 주세요.' }, { status: 400, headers: consentHeaders })
    }
    const { error } = await getSupabaseAdmin().rpc('update_student_consent_details', { p_staff_id: staff.id, p_student_id: consentId(body.student_id), p_is_under_14: body.is_under_14, p_language: body.guardian_language })
    if (error) throw error
    return NextResponse.json({ saved: true }, { headers: consentHeaders })
  } catch (error) { return consentError(error) }
}
