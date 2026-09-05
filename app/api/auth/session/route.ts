import { NextRequest, NextResponse } from 'next/server'
import { AccessError, accessCookie, refreshCookie, authErrorResponse, clearSessionCookies, privateHeaders, setSessionCookies, staffForUser } from '@/lib/admin-auth'
import { getSupabaseAdmin } from '@/lib/supabase-admin'
export const dynamic = 'force-dynamic'
export async function GET(request: NextRequest) {
  try {
    const access = request.cookies.get(accessCookie)?.value
    if (access) {
      const { data, error } = await getSupabaseAdmin().auth.getUser(access)
      if (!error && data.user && !data.user.is_anonymous) return NextResponse.json({ staff: await staffForUser(data.user.id) }, { headers: privateHeaders })
    }
    const refresh = request.cookies.get(refreshCookie)?.value
    if (!refresh) throw new AccessError(401, '로그인이 필요합니다.')
    const { data, error } = await getSupabaseAdmin().auth.refreshSession({ refresh_token: refresh })
    if (error || !data.session || !data.user || data.user.is_anonymous) throw new AccessError(401, '다시 로그인해 주세요.')
    const staff = await staffForUser(data.user.id)
    return setSessionCookies(NextResponse.json({ staff }, { headers: privateHeaders }), data.session)
  } catch (error) {
    const response = authErrorResponse(error)
    return response ? clearSessionCookies(response) : NextResponse.json({ error: '연결을 확인하고 다시 시도해 주세요.' }, { status: 500, headers: privateHeaders })
  }
}
