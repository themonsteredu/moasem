import { NextRequest, NextResponse } from 'next/server'
import { assertStaff, authErrorResponse, privateHeaders, AccessError } from '@/lib/admin-auth'
import { consentId, readConsentBody } from '@/lib/guardian-consent'
import { getSupabaseAdmin } from '@/lib/supabase-admin'
import { progressInput } from '@/lib/student-progress'
export const dynamic = 'force-dynamic'
type Context = { params: { id: string } }
function failure(error: unknown) {
  const auth = authErrorResponse(error)
  if (auth) return auth
  const code = error && typeof error === 'object' && 'message' in error ? String(error.message) : ''
  const known: Record<string, [number, string]> = {
    STAFF_ACCESS_DENIED: [403, '사용 가능한 계정인지 확인해 주세요.'], PROGRAM_ACCESS_DENIED: [403, '담당 학생만 확인할 수 있습니다.'], STUDENT_NOT_FOUND: [404, '학생을 찾지 못했습니다.'], STUDENT_INACTIVE: [400, '사용 중지된 학생은 기록을 추가할 수 없습니다.'], INVALID_PROGRESS: [400, '진도와 날짜를 확인해 주세요.'], PROGRESS_CONFLICT: [409, '같은 저장 요청의 내용이 달라졌습니다. 기록을 확인해 주세요.'],
  }
  const [status, message] = known[code] || [500, '학습기록을 처리하지 못했습니다. 다시 시도해 주세요.']
  return NextResponse.json({ error: message }, { status, headers: privateHeaders })
}
export async function GET(request: NextRequest, { params }: Context) {
  try {
    const staff = await assertStaff(request)
    const offset = Number(request.nextUrl.searchParams.get('offset') || 0)
    if (!Number.isInteger(offset) || offset < 0 || offset > 100000) throw new AccessError(400, '기록 페이지를 확인해 주세요.')
    const { data, error } = await getSupabaseAdmin().rpc('read_student_progress', { p_staff_id: staff.id, p_student_id: consentId(params.id), p_offset: offset })
    if (error) throw error
    return NextResponse.json({ ...data, entries: data.entries.slice(0, 20), has_more: data.entries.length > 20 }, { headers: privateHeaders })
  } catch (error) { return failure(error) }
}
export async function POST(request: NextRequest, { params }: Context) {
  try {
    const staff = await assertStaff(request)
    const body = await readConsentBody(request)
    const { data, error } = await getSupabaseAdmin().rpc('save_student_progress', { p_staff_id: staff.id, p_student_id: consentId(params.id), p_entry_id: consentId(body.entry_id), p_input: progressInput(body) })
    if (error) throw error
    return NextResponse.json({ id: data }, { status: 201, headers: privateHeaders })
  } catch (error) { return failure(error) }
}
