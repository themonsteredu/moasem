import { NextRequest, NextResponse } from 'next/server'
import { assertAdmin } from '@/lib/admin-auth'
import { getSupabaseAdmin } from '@/lib/supabase-admin'

export async function GET(request: NextRequest) {
  try {
    assertAdmin(request)
    const supabase = getSupabaseAdmin()
    const { data, error } = await supabase
      .from('moasem_institutions')
      .select('id,name,logo_url,manager_name,manager_phone,manager_notifications_enabled,created_at')
      .order('created_at', { ascending: false })

    if (error) throw error
    return NextResponse.json({ items: data ?? [] })
  } catch (error) {
    if (error instanceof Error && error.message === 'UNAUTHORIZED') {
      return NextResponse.json({ error: '관리자 인증이 필요합니다.' }, { status: 401 })
    }
    return NextResponse.json({ error: '기관 목록을 불러오지 못했습니다.' }, { status: 500 })
  }
}

export async function POST(request: NextRequest) {
  try {
    assertAdmin(request)
    const body = await request.json()
    const name = String(body.name ?? '').trim()
    if (!name) return NextResponse.json({ error: '기관명을 입력하세요.' }, { status: 400 })

    const supabase = getSupabaseAdmin()
    const { data, error } = await supabase
      .from('moasem_institutions')
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
    if (error instanceof Error && error.message === 'UNAUTHORIZED') {
      return NextResponse.json({ error: '관리자 인증이 필요합니다.' }, { status: 401 })
    }
    return NextResponse.json({ error: '기관을 등록하지 못했습니다.' }, { status: 500 })
  }
}
