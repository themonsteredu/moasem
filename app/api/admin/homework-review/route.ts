import { NextRequest, NextResponse } from 'next/server'
import { assertStaff, assertProgramAccess, authErrorResponse, privateHeaders } from '@/lib/admin-auth'
import { uuidInput } from '@/lib/learning-operations'
import { koreaToday, reviewPageSize } from '@/lib/homework-review'
import { filteredHomework, publicReviewItem, reviewColumns, reviewInput, type ReviewRow } from '@/lib/homework-review-data'

export const dynamic = 'force-dynamic'
export async function GET(req: NextRequest) {
  try {
    const staff = await assertStaff(req), programId = uuidInput(req.nextUrl.searchParams.get('program_id'))
    const { filter, page } = reviewInput(req.nextUrl.searchParams), today = koreaToday()
    await assertProgramAccess(staff, programId)
    let query = filteredHomework(staff, programId, `${reviewColumns},photos:homework_photos(id)`, filter, today)
    if (filter === 'submitted') query = query.order('submitted_at', { ascending: true, nullsFirst: true })
    else if (filter === 'checked') query = query.order('checked_at', { ascending: false, nullsFirst: false })
    else query = query.order('due_on', { ascending: true })
    const [list, assigned, submitted, checked, overdue] = await Promise.all([
      query.order('id', { ascending: true }).range((page - 1) * reviewPageSize, page * reviewPageSize - 1).returns<ReviewRow[]>(),
      ...(['assigned', 'submitted', 'checked', 'overdue'] as const).map(f => filteredHomework(staff, programId, 'id', f, today, true)),
    ])
    for (const result of [assigned, submitted, checked, overdue]) if (result.error) throw result.error
    // Records can move out of a status while a later page is being viewed.
    if (list.error && list.error.code !== 'PGRST103') throw list.error
    const counts = { assigned: assigned.count ?? 0, submitted: submitted.count ?? 0, checked: checked.count ?? 0, overdue: overdue.count ?? 0 }
    const allCounts = { ...counts, all: counts.assigned + counts.submitted + counts.checked }
    return NextResponse.json({
      items: (list.data ?? []).map(publicReviewItem), counts: allCounts,
      total: list.count ?? allCounts[filter], page, page_size: reviewPageSize, today,
    }, { headers: privateHeaders })
  } catch (e) {
    return authErrorResponse(e) || NextResponse.json({ error: '과제 현황을 불러오지 못했습니다. 다시 시도해 주세요.' }, { status: 500, headers: privateHeaders })
  }
}
