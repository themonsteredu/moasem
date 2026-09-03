import { NextRequest, NextResponse } from 'next/server'
import { assertAdmin } from '@/lib/admin-auth'
import { getSupabaseAdmin } from '@/lib/supabase-admin'

export const dynamic = 'force-dynamic'
export const revalidate = 0

const privateHeaders = { 'Cache-Control': 'private, no-store, max-age=0' }

export async function GET(request: NextRequest) {
  try {
    assertAdmin(request)
    const supabase = getSupabaseAdmin()
    const { data, error } = await supabase
      .from('moasem_supplement_videos')
      .select('id,title,url,duration_seconds,language,provider,visibility,active')
      .order('active', { ascending: false })
      .order('title', { ascending: true })
    if (error) throw error
    return NextResponse.json({ items: data ?? [] }, { headers: privateHeaders })
  } catch (error) {
    if (error instanceof Error && error.message === 'UNAUTHORIZED') {
      return NextResponse.json({ error: '관리자 인증이 필요합니다.' }, { status: 401, headers: privateHeaders })
    }
    return NextResponse.json({ error: '보충영상을 불러오지 못했습니다.' }, { status: 500, headers: privateHeaders })
  }
}

export async function POST(request: NextRequest) {
  try {
    assertAdmin(request)
    const body = await request.json()
    const title = String(body.title ?? '').trim()
    const url = String(body.url ?? '').trim()
    let parsedUrl: URL
    try {
      parsedUrl = new URL(url)
    } catch {
      return NextResponse.json({ error: '올바른 영상 주소를 입력하세요.' }, { status: 400, headers: privateHeaders })
    }
    if (!title || !['http:', 'https:'].includes(parsedUrl.protocol)) {
      return NextResponse.json({ error: '영상 제목과 올바른 주소를 입력하세요.' }, { status: 400, headers: privateHeaders })
    }

    const payload = {
      title,
      url: parsedUrl.toString(),
      duration_seconds: body.duration_seconds ? Number(body.duration_seconds) : null,
      language: ['ko', 'vi', 'zh-CN'].includes(body.language) ? body.language : 'ko',
      provider: ['youtube', 'vimeo', 'direct', 'other'].includes(body.provider) ? body.provider : 'youtube',
      visibility: ['public', 'unlisted', 'private'].includes(body.visibility) ? body.visibility : 'unlisted',
      active: body.active !== false,
      updated_at: new Date().toISOString(),
    }

    const supabase = getSupabaseAdmin()
    const query = body.id
      ? supabase.from('moasem_supplement_videos').update(payload).eq('id', body.id)
      : supabase.from('moasem_supplement_videos').insert(payload)
    const { data: item, error } = await query.select().single()
    if (error) throw error
    return NextResponse.json({ item }, { status: body.id ? 200 : 201, headers: privateHeaders })
  } catch (error) {
    if (error instanceof Error && error.message === 'UNAUTHORIZED') {
      return NextResponse.json({ error: '관리자 인증이 필요합니다.' }, { status: 401, headers: privateHeaders })
    }
    return NextResponse.json({ error: '보충영상을 저장하지 못했습니다.' }, { status: 500, headers: privateHeaders })
  }
}
