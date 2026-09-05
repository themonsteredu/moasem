import { NextRequest, NextResponse } from 'next/server'
import { accessCookie, refreshCookie, assertSameOrigin, authErrorResponse, clearSessionCookies, privateHeaders } from '@/lib/admin-auth'
import { getSupabaseAdmin } from '@/lib/supabase-admin'
export async function POST(request: NextRequest) {
  try {
    assertSameOrigin(request)
    const token = request.cookies.get(accessCookie)?.value
    if (token) {
      const { error } = await getSupabaseAdmin().auth.admin.signOut(token, 'local')
      if (!error) return clearSessionCookies(NextResponse.json({ ok: true }, { headers: privateHeaders }))
    }
    const refresh = request.cookies.get(refreshCookie)?.value
    if (refresh) {
      const { data } = await getSupabaseAdmin().auth.refreshSession({ refresh_token: refresh })
      if (data.session) await getSupabaseAdmin().auth.admin.signOut(data.session.access_token, 'local')
    }
    return clearSessionCookies(NextResponse.json({ ok: true }, { headers: privateHeaders }))
  } catch (error) {
    return authErrorResponse(error) || clearSessionCookies(NextResponse.json({ ok: true }, { headers: privateHeaders }))
  }
}
