import { NextRequest, NextResponse } from 'next/server'
import { AccessError, assertStaff, assertProgramAccess, authErrorResponse, privateHeaders } from '@/lib/admin-auth'
import { uuidInput } from '@/lib/learning-operations'
import { getSupabaseAdmin } from '@/lib/supabase-admin'
import { publicReviewItem, reviewColumns, scopedHomework, type ReviewRow } from '@/lib/homework-review-data'

export const dynamic = 'force-dynamic'
export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const staff = await assertStaff(req), id = uuidInput((await params).id), programId = uuidInput(req.nextUrl.searchParams.get('program_id'))
    await assertProgramAccess(staff, programId)
    const { data, error } = await scopedHomework(staff, programId, `${reviewColumns},photos:homework_photos(id,storage_path)`)
      .eq('id', id).returns<ReviewRow[]>().maybeSingle()
    if (error) throw error
    if (!data) throw new AccessError(404, '현재 프로그램에서 확인할 수 없는 과제입니다. 목록을 새로고침해 주세요.')
    // Only this authorized homework's private photos receive short-lived URLs.
    const photos = await Promise.all([...data.photos].sort((a, b) => a.id.localeCompare(b.id)).map(async photo => {
      if (!photo.storage_path) throw Error('Photo path missing')
      const { data: signed, error: signError } = await getSupabaseAdmin().storage.from('moasem-homework').createSignedUrl(photo.storage_path, 300)
      if (signError || !signed) throw signError || Error('Photo unavailable')
      return { id: photo.id, url: signed.signedUrl }
    }))
    return NextResponse.json({ item: publicReviewItem(data), photos, expires_in: 300 }, { headers: privateHeaders })
  } catch (e) {
    return authErrorResponse(e) || NextResponse.json({ error: '사진을 불러오지 못했습니다. 사진 새로고침을 눌러 주세요.' }, { status: 500, headers: privateHeaders })
  }
}
