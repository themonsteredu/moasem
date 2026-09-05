import { NextRequest, NextResponse } from 'next/server'
import { assertStaff } from '@/lib/admin-auth'
import { getSupabaseAdmin } from '@/lib/supabase-admin'
import { consentError, consentHeaders, consentId, consentStudent, newConsentToken, readConsentBody } from '@/lib/guardian-consent'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

export async function GET(request: NextRequest) {
  try {
    const staff = await assertStaff(request)
    const student = await consentStudent(staff, request.nextUrl.searchParams.get('student_id') || '')
    const supabase = getSupabaseAdmin()
    const { data: guardian, error: guardianError } = student.guardian_id
      ? await supabase.from('guardians').select('phone').eq('id', student.guardian_id).maybeSingle()
      : { data: null, error: null }
    if (guardianError) throw guardianError
    const { data, error } = await supabase.from('guardian_consent_requests')
      .select('id,document_id,document_snapshot,language,created_at,expires_at,revoked_at,guardian_id,guardian_phone,program_id,records:guardian_consent_records(language,signer_name,consented_at,verification_method)')
      .eq('student_id', student.id).order('created_at', { ascending: false }).limit(20)
    if (error) throw error
    const items = (data ?? []).map(({ guardian_id, guardian_phone, program_id, ...item }) => {
      const recipientChanged = guardian_id !== student.guardian_id || program_id !== student.program_id || guardian_phone !== guardian?.phone
      const linkStatus = item.revoked_at ? 'revoked' : new Date(item.expires_at).getTime() <= Date.now() ? 'expired' : recipientChanged || !student.active ? 'unavailable' : 'active'
      return { ...item, recipient_changed: recipientChanged, link_status: linkStatus }
    })
    return NextResponse.json({ items }, { headers: consentHeaders })
  } catch (error) { return consentError(error) }
}
export async function POST(request: NextRequest) {
  try {
    const staff = await assertStaff(request)
    const body = await readConsentBody(request)
    const student = await consentStudent(staff, consentId(body.student_id))
    const documentId = consentId(body.document_id)
    const { token, hash } = newConsentToken()
    const { data, error } = await getSupabaseAdmin().rpc('create_guardian_consent_request', {
      p_staff_id: staff.id, p_student_id: student.id, p_document_id: documentId, p_token_hash: hash,
    })
    if (error) throw error
    // Relative path prevents caller-controlled hosts; UI will resolve it on the app origin.
    return NextResponse.json({ item: data, path: `/consent/${token}` }, { status: 201, headers: consentHeaders })
  } catch (error) { return consentError(error) }
}
export async function DELETE(request: NextRequest) {
  try {
    const staff = await assertStaff(request)
    const body = await readConsentBody(request)
    const student = await consentStudent(staff, consentId(body.student_id))
    const { error } = await getSupabaseAdmin().rpc('revoke_guardian_consent_request', { p_staff_id: staff.id, p_student_id: student.id, p_request_id: consentId(body.request_id) })
    if (error) throw error
    return NextResponse.json({ revoked: true }, { headers: consentHeaders })
  } catch (error) { return consentError(error) }
}
