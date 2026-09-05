import { NextRequest, NextResponse } from 'next/server'
import { assertSameOrigin } from '@/lib/admin-auth'
import { getSupabaseAdmin } from '@/lib/supabase-admin'
import { consentError, consentHeaders, consentSubmission, consentTokenHash, readConsentBody } from '@/lib/guardian-consent'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'
type Context = { params: { token: string } }

export async function GET(_request: NextRequest, { params }: Context) {
  try {
    const hash = consentTokenHash(params.token)
    const { data, error } = await getSupabaseAdmin().rpc('access_guardian_consent', { p_token_hash: hash, p_submission: null })
    if (error) throw error
    return NextResponse.json({ consent: data }, { headers: consentHeaders })
  } catch (error) { return consentError(error) }
}
export async function POST(request: NextRequest, { params }: Context) {
  try {
    assertSameOrigin(request)
    const hash = consentTokenHash(params.token)
    const submission = consentSubmission(await readConsentBody(request))
    const { data, error } = await getSupabaseAdmin().rpc('access_guardian_consent', { p_token_hash: hash, p_submission: submission })
    if (error) throw error
    return NextResponse.json({ consent: data }, { headers: consentHeaders })
  } catch (error) { return consentError(error) }
}
