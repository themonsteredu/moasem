import { NextRequest, NextResponse } from 'next/server'
import { AccessError, assertSameOrigin, authErrorResponse, privateHeaders, setSessionCookies, verifySetupKey } from '@/lib/admin-auth'
import { createIdentity, credentials, signInStaff } from '@/lib/staff-identity'
import { getSupabaseAdmin } from '@/lib/supabase-admin'
export const dynamic = 'force-dynamic'
export async function GET() {
  try {
    const { count, error } = await getSupabaseAdmin().from('staff_accounts').select('id', { count: 'exact', head: true }).eq('role', 'admin')
    if (error) throw error
    return NextResponse.json({ needs_setup: count === 0 }, { headers: privateHeaders })
  } catch {
    return NextResponse.json({ error: '계정 준비 상태를 확인하지 못했습니다.' }, { status: 503, headers: privateHeaders })
  }
}
export async function POST(request: NextRequest) {
  let createdUser: string | null = null
  try {
    assertSameOrigin(request)
    const body = await request.json()
    verifySetupKey(body.setup_key)
    const db = getSupabaseAdmin()
    const { count, error } = await db.from('staff_accounts').select('id', { count: 'exact', head: true }).eq('role', 'admin')
    if (error) throw error
    if (count !== 0) throw new AccessError(409, '관리자 계정이 이미 있습니다. 로그인해 주세요.')
    const { email, password } = credentials(body)
    const name = String(body.name || '').trim()
    if (!name || name.length > 100) throw new AccessError(400, '관리자 이름을 입력해 주세요.')
    createdUser = await createIdentity(email, password)
    let userId = createdUser
    if (!userId) {
      const existing = await getSupabaseAdmin().auth.signInWithPassword({ email, password })
      if (existing.error || !existing.data.user?.email_confirmed_at) throw new AccessError(401, '이미 등록된 이메일입니다. 기존 비밀번호를 입력해 주세요.')
      userId = existing.data.user.id
    }
    const { error: setupError } = await db.rpc('bootstrap_staff_admin', { p_user_id: userId, p_email: email, p_name: name })
    if (setupError) throw new AccessError(409, '관리자 등록을 완료하지 못했습니다. 이미 등록되어 있는지 확인해 주세요.')
    const { staff, session } = await signInStaff(email, password)
    return setSessionCookies(NextResponse.json({ staff }, { status: 201, headers: privateHeaders }), session)
  } catch (error) {
    // Keep a newly created identity for a safe retry; another concurrent request may have linked it.
    return authErrorResponse(error) || NextResponse.json({ error: '관리자 계정을 만들지 못했습니다.' }, { status: 500, headers: privateHeaders })
  }
}
