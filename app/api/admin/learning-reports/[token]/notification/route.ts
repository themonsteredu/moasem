import { NextRequest, NextResponse } from 'next/server'
import { assertStaff, authErrorResponse, privateHeaders } from '@/lib/admin-auth'
import { refreshNotification, sendNotification } from '@/lib/report-notifications'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'
export const maxDuration = 30
export async function POST(request: NextRequest, { params }: { params: { token: string } }) {
  try {
    const staff = await assertStaff(request)
    const body = await request.json()
    if (!['send', 'refresh'].includes(body.action) || (body.retry !== undefined && typeof body.retry !== 'boolean')) return NextResponse.json({ error: '요청 내용을 확인해 주세요.' }, { status: 400, headers: privateHeaders })
    const result = body.action === 'refresh' ? await refreshNotification(staff, params.token) : await sendNotification(staff, params.token, body.retry === true)
    return NextResponse.json(result, { headers: privateHeaders })
  } catch (error) {
    return authErrorResponse(error) || NextResponse.json({ error: '알림톡 요청을 처리하지 못했습니다. 리포트 링크는 그대로 사용할 수 있습니다.' }, { status: 500, headers: privateHeaders })
  }
}
