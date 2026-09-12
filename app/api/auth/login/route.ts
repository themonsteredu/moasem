import { NextRequest, NextResponse } from 'next/server'
import { assertSameOrigin, authErrorResponse, clearSessionCookies, privateHeaders, setSessionCookies } from '@/lib/admin-auth'
import { credentials, signInStaff } from '@/lib/staff-identity'
export async function POST(request: NextRequest) {
  try {
    assertSameOrigin(request)
    const { email, password } = credentials(await request.json())
    const { staff, session } = await signInStaff(email, password)
    return setSessionCookies(NextResponse.json({ staff }, { headers: privateHeaders }), session)
  } catch (error) {
    return clearSessionCookies(authErrorResponse(error) || NextResponse.json({ error: '로그인하지 못했습니다. 잠시 후 다시 시도해 주세요.' }, { status: 500, headers: privateHeaders }))
  }
}
