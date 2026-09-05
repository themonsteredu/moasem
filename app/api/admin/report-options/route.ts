import { NextRequest, NextResponse } from 'next/server'
import { assertStaff, authErrorResponse, privateHeaders } from '@/lib/admin-auth'
import { getSupabaseAdmin } from '@/lib/supabase-admin'
import { safeVideoUrl } from '@/lib/report-resources'

export const dynamic = 'force-dynamic'
export async function GET(request: NextRequest) {
  try {
    await assertStaff(request)
    const { data, error } = await getSupabaseAdmin().from('wrong_types')
      .select('id,code,name,grade,unit,description_ko,description_vi,description_zh_cn,video_links:wrong_type_videos(is_primary,video:supplement_videos(id,title,url,language,active,visibility))')
      .eq('active', true).order('display_order').order('code')
    if (error) throw error
    const items = (data ?? []).map(item => {
      const primary = item.video_links?.find(link => link.is_primary)
      const video = Array.isArray(primary?.video) ? primary.video[0] : primary?.video
      const url = video?.active && video.visibility !== 'private' ? safeVideoUrl(video.url) : null
      const { video_links: _links, ...type } = item
      return { ...type, video: video && url ? { id: video.id, title: video.title, url, language: video.language } : null }
    })
    return NextResponse.json({ items }, { headers: privateHeaders })
  } catch (error) {
    return authErrorResponse(error) || NextResponse.json({ error: '오답 유형과 영상을 불러오지 못했습니다.' }, { status: 500, headers: privateHeaders })
  }
}
