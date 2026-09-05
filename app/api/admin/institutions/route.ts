import { NextRequest, NextResponse } from 'next/server'
import { assertAdmin, authErrorResponse } from '@/lib/admin-auth'
import { getSupabaseAdmin } from '@/lib/supabase-admin'

export const dynamic = 'force-dynamic'

export async function GET(request: NextRequest) {
  try {
    await assertAdmin(request)
    const supabase = getSupabaseAdmin()
    const primary = await supabase
      .from('institutions')
      .select('id,name,logo_url,manager_name,manager_phone,manager_notifications_enabled,portal_token,created_at')
      .order('created_at', { ascending: false })

    if (!primary.error) {
      return NextResponse.json({ items: primary.data ?? [] })
    }

    // 0002 마이그레이션이 아직 적용되지 않은 동안에도 기본 관리자 화면은 유지한다.
    if (primary.error.code === '42703' || primary.error.message.includes('portal_token')) {
      const fallback = await supabase
        .from('institutions')
        .select('id,name,logo_url,manager_name,manager_phone,manager_notifications_enabled,created_at')
        .order('created_at', { ascending: false })
      if (fallback.error) throw fallback.error
      return NextResponse.json({ items: (fallback.data ?? []).map(item => ({ ...item, portal_token: null })) })
    }

    throw primary.error
  } catch (error) {
    const denied = authErrorResponse(error)
    if (denied) return denied
    return NextResponse.json({ error: '기관 목록을 불러오지 못했습니다.' }, { status: 500 })
  }
}

export async function POST(request: NextRequest) {
  try {
    await assertAdmin(request)
    const body = await request.json()
    const name = String(body.name ?? '').trim()
    if (!name) return NextResponse.json({ error: '기관명을 입력하세요.' }, { status: 400 })

    const supabase = getSupabaseAdmin()
    const { data, error } = await supabase
      .from('institutions')
      .insert({
        name,
        logo_url: body.logo_url || null,
        manager_name: body.manager_name || null,
        manager_phone: body.manager_phone || null,
        manager_notifications_enabled: body.manager_notifications_enabled !== false,
      })
      .select()
      .single()

    if (error) throw error
    return NextResponse.json({ item: data }, { status: 201 })
  } catch (error) {
    const denied = authErrorResponse(error)
    if (denied) return denied
    return NextResponse.json({ error: '기관을 등록하지 못했습니다.' }, { status: 500 })
  }
}
