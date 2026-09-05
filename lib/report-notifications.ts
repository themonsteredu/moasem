import { AccessError, assertProgramAccess } from './admin-auth'
import { getSupabaseAdmin } from './supabase-admin'
import { alimtalkConfig, checkReportAlimtalk, DeliveryResult, maskPhone, sendReportAlimtalk } from './alimtalk'
import type { Staff } from './staff-types'

export const notificationColumns = 'id,report_id,status,recipient_phone,provider_message_id,provider_group_id,provider_status_code,error_code,created_at,updated_at'
type Attempt = { id: string; report_id: string; status: string; recipient_phone: string; provider_message_id: string | null; provider_group_id: string | null; provider_status_code: string | null; error_code: string | null; created_at: string; updated_at: string }
export function publicNotification(row: Attempt | null) {
  if (!row) return null
  const status = row.status === 'sending' && Date.now() - new Date(row.created_at).getTime() > 60000 ? 'unknown' : row.status
  return { id: row.id, status, recipient: maskPhone(row.recipient_phone), status_code: row.provider_status_code, created_at: row.created_at, updated_at: row.updated_at }
}
export async function authorizedReport(staff: Staff, token: string) {
  if (!/^[0-9a-f-]{36}$/i.test(token)) throw new AccessError(404, '리포트를 찾지 못했습니다.')
  const db = getSupabaseAdmin()
  const { data: report, error } = await db.from('guardian_reports').select('id,token,student_id,guardian_id,expires_at,student:students(program_id)').eq('token', token).maybeSingle()
  if (error) throw error
  const student = Array.isArray(report?.student) ? report.student[0] : report?.student
  if (!report || !student) throw new AccessError(404, '리포트를 찾지 못했습니다.')
  await assertProgramAccess(staff, student.program_id)
  return report
}
export async function latestAttempt(reportId: string): Promise<Attempt | null> {
  const { data, error } = await getSupabaseAdmin().from('report_notification_attempts').select(notificationColumns).eq('report_id', reportId).order('created_at', { ascending: false }).limit(1).maybeSingle()
  if (error) throw error
  return data
}
function claimError(error: { message: string }) {
  if (/STAFF_ACCESS_DENIED|PROGRAM_ACCESS_DENIED/.test(error.message)) return new AccessError(403, '담당 프로그램과 계정 상태를 확인해 주세요.')
  if (/REPORT_EXPIRED/.test(error.message)) return new AccessError(410, '리포트가 만료되어 보낼 수 없습니다.')
  if (/GUARDIAN_CHANGED|INVALID_PHONE/.test(error.message)) return new AccessError(400, '등록된 보호자와 휴대폰 번호를 확인해 주세요.')
  if (/RETRY_LIMIT/.test(error.message)) return new AccessError(429, '재발송은 1분 뒤에 가능하며 리포트당 최대 3회입니다.')
  return new AccessError(500, '발송 준비를 저장하지 못했습니다.')
}
async function saveResult(attempt: Attempt, result: DeliveryResult, expectedStatus: string) {
  const { data, error } = await getSupabaseAdmin().from('report_notification_attempts')
    .update({ ...result, updated_at: new Date().toISOString() }).eq('id', attempt.id).eq('status', expectedStatus).select(notificationColumns).maybeSingle()
  if (error) throw error
  return data as Attempt | null
}
export async function sendNotification(staff: Staff, token: string, retry: boolean) {
  await authorizedReport(staff, token)
  const config = alimtalkConfig()
  if (!config) throw new AccessError(503, '모아킷 알림톡 연결 설정이 필요합니다. 리포트 링크는 그대로 사용할 수 있습니다.')
  const { data, error } = await getSupabaseAdmin().rpc('claim_report_notification', { p_staff_id: staff.id, p_report_token: token, p_retry: retry })
  if (error) throw claimError(error)
  const attempt = data.attempt as Attempt
  if (!data.claimed) return { notification: publicNotification(attempt), duplicate: true }
  const result = await sendReportAlimtalk(config, attempt.recipient_phone, token, attempt.id)
  try {
    const saved = await saveResult(attempt, result, 'sending')
    if (!saved) throw new Error('Attempt changed')
    return { notification: publicNotification(saved), duplicate: false }
  } catch {
    // The durable 'sending' row continues to block duplicates even if recording the result fails.
    return { notification: publicNotification({ ...attempt, status: 'unknown' }), duplicate: false, notice: '발송 결과를 저장하지 못했습니다. 중복 발송을 막기 위해 재발송을 보류합니다. 관리자에게 확인해 주세요.' }
  }
}
export async function refreshNotification(staff: Staff, token: string) {
  const report = await authorizedReport(staff, token)
  const attempt = await latestAttempt(report.id)
  const config = alimtalkConfig()
  if (!attempt || attempt.status === 'delivered' || attempt.status === 'failed') return { notification: publicNotification(attempt) }
  if (!config || !attempt.provider_message_id) return { notification: publicNotification(attempt), notice: '결과를 자동 확인할 수 없습니다. 관리자에게 발송 내역 확인을 요청해 주세요.' }
  const result = await checkReportAlimtalk(config, attempt.provider_message_id)
  if (!result) return { notification: publicNotification(attempt), notice: '발송 결과를 아직 확인하지 못했습니다. 잠시 후 다시 확인해 주세요.' }
  const saved = await saveResult(attempt, result, attempt.status)
  return { notification: publicNotification(saved || await latestAttempt(report.id)) }
}
