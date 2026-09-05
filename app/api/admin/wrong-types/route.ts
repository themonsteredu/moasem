import { NextRequest, NextResponse } from 'next/server'
import { assertAdmin, authErrorResponse } from '@/lib/admin-auth'
import { getSupabaseAdmin } from '@/lib/supabase-admin'

export const dynamic = 'force-dynamic'
export const revalidate = 0

const privateHeaders = { 'Cache-Control': 'private, no-store, max-age=0' }

function optionalText(value: unknown) {
  const text = String(value ?? '').trim()
  return text || null
}

export async function GET(request: NextRequest) {
  try {
    await assertAdmin(request)
    const supabase = getSupabaseAdmin()
    const { data, error } = await supabase
      .from('wrong_types')
      .select('id,code,name,grade,semester,domain,unit,description_ko,description_vi,description_zh_cn,display_order,active,video_links:wrong_type_videos(is_primary,priority,video:supplement_videos(id,title,url,duration_seconds,language,active))')
      .order('display_order', { ascending: true })
      .order('code', { ascending: true })

    if (error) throw error
    return NextResponse.json({ items: data ?? [] }, { headers: privateHeaders })
  } catch (error) {
    const denied = authErrorResponse(error)
    if (denied) return denied
    if (error instanceof Error && error.message === 'UNAUTHORIZED') {
      return NextResponse.json({ error: '관리자 인증이 필요합니다.' }, { status: 401, headers: privateHeaders })
    }
    return NextResponse.json({ error: '오답 유형을 불러오지 못했습니다.' }, { status: 500, headers: privateHeaders })
  }
}

export async function POST(request: NextRequest) {
  try {
    await assertAdmin(request)
    const body = await request.json()
    const code = String(body.code ?? '').trim()
    const name = String(body.name ?? '').trim()
    const grade = Number(body.grade)
    const semester = body.semester ? Number(body.semester) : null

    if (!code || !name || !Number.isInteger(grade) || grade < 1 || grade > 12) {
      return NextResponse.json({ error: '유형 코드, 유형명, 학년을 정확히 입력하세요.' }, { status: 400, headers: privateHeaders })
    }
    if (semester !== null && semester !== 1 && semester !== 2) {
      return NextResponse.json({ error: '학기는 1 또는 2만 입력할 수 있습니다.' }, { status: 400, headers: privateHeaders })
    }

    const payload = {
      code,
      name,
      grade,
      semester,
      domain: optionalText(body.domain),
      unit: optionalText(body.unit),
      description_ko: optionalText(body.description_ko),
      description_vi: optionalText(body.description_vi),
      description_zh_cn: optionalText(body.description_zh_cn),
      display_order: Number.isInteger(Number(body.display_order)) ? Number(body.display_order) : 0,
      active: body.active !== false,
      updated_at: new Date().toISOString(),
    }

    const supabase = getSupabaseAdmin()
    const query = body.id
      ? supabase.from('wrong_types').update(payload).eq('id', body.id)
      : supabase.from('wrong_types').insert(payload)
    const { data: item, error } = await query.select('id,code,name').single()

    if (error) {
      if (error.code === '23505') {
        return NextResponse.json({ error: '이미 사용 중인 유형 코드입니다.' }, { status: 409, headers: privateHeaders })
      }
      throw error
    }

    if (Object.prototype.hasOwnProperty.call(body, 'primary_video_id')) {
      const { error: deleteError } = await supabase
        .from('wrong_type_videos')
        .delete()
        .eq('wrong_type_id', item.id)
        .eq('is_primary', true)
      if (deleteError) throw deleteError

      if (body.primary_video_id) {
        const { error: linkError } = await supabase
          .from('wrong_type_videos')
          .upsert({ wrong_type_id: item.id, video_id: body.primary_video_id, is_primary: true, priority: 0 }, { onConflict: 'wrong_type_id,video_id' })
        if (linkError) throw linkError
      }
    }

    return NextResponse.json({ item }, { status: body.id ? 200 : 201, headers: privateHeaders })
  } catch (error) {
    const denied = authErrorResponse(error)
    if (denied) return denied
    if (error instanceof Error && error.message === 'UNAUTHORIZED') {
      return NextResponse.json({ error: '관리자 인증이 필요합니다.' }, { status: 401, headers: privateHeaders })
    }
    return NextResponse.json({ error: '오답 유형을 저장하지 못했습니다.' }, { status: 500, headers: privateHeaders })
  }
}
