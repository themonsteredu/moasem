import { NextRequest, NextResponse } from 'next/server'
import { AccessError, assertStaff, assertProgramAccess, authErrorResponse, privateHeaders } from '@/lib/admin-auth'
import { getSupabaseAdmin } from '@/lib/supabase-admin'
import { allRows, uuidInput } from '@/lib/learning-operations'
import { homeworkBatchInput } from '@/lib/homework-batch'
export const dynamic = 'force-dynamic'
export async function GET(req: NextRequest) {
  try {
    const staff = await assertStaff(req), programId = uuidInput(req.nextUrl.searchParams.get('program_id'))
    await assertProgramAccess(staff, programId)
    const students = (await allRows('students', 'id,name,grade,student_number,active', [programId])).filter(s => s.active).sort((a, b) => a.name.localeCompare(b.name, 'ko') || a.id.localeCompare(b.id))
    const { data, error } = await getSupabaseAdmin().from('homework_batches').select('id,payload,created_at').eq('program_id', programId).order('created_at', { ascending: false }).limit(10)
    if (error) throw error
    const recent = (data ?? []).map(b => ({ id: b.id, title: b.payload.title, due_on: b.payload.due_on, count: b.payload.student_ids.length, created_at: b.created_at }))
    return NextResponse.json({ students, recent }, { headers: privateHeaders })
  } catch (e) { return authErrorResponse(e) || NextResponse.json({ error: '학생과 과제 목록을 불러오지 못했습니다.' }, { status: 500, headers: privateHeaders }) }
}
export async function POST(req: NextRequest) {
  try {
    const staff = await assertStaff(req)
    const raw = await req.text()
    if (raw.length > 50000) throw new AccessError(413, '한 번에 200명까지 등록할 수 있습니다.')
    let body: unknown
    try { body = JSON.parse(raw) } catch { throw new AccessError(400, '과제 내용을 확인해 주세요.') }
    const b = homeworkBatchInput(body)
    await assertProgramAccess(staff, b.program_id)
    const { data, error } = await getSupabaseAdmin().rpc('assign_homework_batch', { p_staff: staff.id, p_batch: b.id, p_program: b.program_id, p_students: b.student_ids, p_title: b.title, p_details: b.details, p_assigned: b.assigned_on, p_due: b.due_on })
    if (error) {
      if (error.message.includes('ACCESS_DENIED')) throw new AccessError(403, '담당 프로그램만 사용할 수 있습니다.')
      if (error.message.includes('STUDENTS_CHANGED')) throw new AccessError(409, '학생 소속이나 사용 상태가 변경되었습니다. 명단을 새로고침한 뒤 다시 선택해 주세요.')
      if (error.message.includes('ID_CONFLICT')) throw new AccessError(409, '이미 처리된 요청과 내용이 다릅니다. 최근 등록 내역을 확인해 주세요.')
      if (error.message.includes('INVALID_BATCH')) throw new AccessError(400, '학생과 과제 내용을 확인해 주세요.')
      throw error
    }
    return NextResponse.json({ batch: data }, { headers: privateHeaders })
  } catch (e) { return authErrorResponse(e) || NextResponse.json({ error: '저장 결과를 확인하지 못했습니다. 같은 내용으로 다시 눌러 주세요.' }, { status: 500, headers: privateHeaders }) }
}
