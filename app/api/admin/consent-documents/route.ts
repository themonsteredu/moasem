import { NextRequest, NextResponse } from 'next/server'
import { assertAdmin, assertStaff } from '@/lib/admin-auth'
import { getSupabaseAdmin } from '@/lib/supabase-admin'
import { consentDocumentInput, consentError, consentHeaders, readConsentBody } from '@/lib/guardian-consent'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

export async function GET(request: NextRequest) {
  try {
    await assertStaff(request)
    const { data, error } = await getSupabaseAdmin().from('consent_documents').select('id,label,translations,created_at').order('created_at', { ascending: false }).limit(20)
    if (error) throw error
    return NextResponse.json({ items: data ?? [] }, { headers: consentHeaders })
  } catch (error) { return consentError(error) }
}
export async function POST(request: NextRequest) {
  try {
    const staff = await assertAdmin(request)
    const body = consentDocumentInput(await readConsentBody(request))
    const { data, error } = await getSupabaseAdmin().rpc('publish_consent_document', { p_staff_id: staff.id, p_label: body.label, p_translations: body.translations })
    if (error) throw error
    return NextResponse.json({ item: data }, { status: 201, headers: consentHeaders })
  } catch (error) { return consentError(error) }
}
