import { NextRequest, NextResponse } from 'next/server'
import { assertStaff, assertProgramAccess, authErrorResponse, privateHeaders, AccessError } from '@/lib/admin-auth'
import { getSupabaseAdmin } from '@/lib/supabase-admin'
import { alimtalkConfig, maskPhone } from '@/lib/alimtalk'
import { publicNotification } from '@/lib/report-notifications'

export const dynamic = 'force-dynamic'
export async function GET(request: NextRequest) {
  try {
    const staff = await assertStaff(request)
    const studentId = request.nextUrl.searchParams.get('student_id')
    const configured = Boolean(alimtalkConfig())
    if (!studentId) return NextResponse.json({ configured, items: [] }, { headers: privateHeaders })
    const db = getSupabaseAdmin()
    const { data: student, error } = await db.from('students').select('id,program_id,guardian_id,guardian:guardians(phone)').eq('id', studentId).maybeSingle()
    if (error) throw error
    if (!student) throw new AccessError(404, '학생을 찾지 못했습니다.')
    await assertProgramAccess(staff, student.program_id)
    const { data: reports, error: reportError } = await db.from('guardian_reports')
      .select('id,token,guardian_id,expires_at,created_at,language,learning_log:learning_logs(lesson_date),attempts:report_notification_attempts(id,report_id,status,recipient_phone,provider_message_id,provider_group_id,provider_status_code,error_code,created_at,updated_at)')
      .eq('student_id', student.id).order('created_at', { ascending: false }).limit(10)
    if (reportError) throw reportError
    const guardian = Array.isArray(student.guardian) ? student.guardian[0] : student.guardian
    const items = (reports || []).map(report => {
      const attempts = [...(report.attempts || [])].sort((a, b) => b.created_at.localeCompare(a.created_at))
      const notification = publicNotification(attempts[0] || null)
      const log = Array.isArray(report.learning_log) ? report.learning_log[0] : report.learning_log
      return { token: report.token, expires_at: report.expires_at, lesson_date: log?.lesson_date, language: report.language,
        recipient: notification?.recipient || maskPhone(guardian?.phone), notification, attempts: attempts.length,
        recipient_changed: !report.guardian_id || report.guardian_id !== student.guardian_id }
    })
    return NextResponse.json({ configured, items }, { headers: privateHeaders })
  } catch (error) { return authErrorResponse(error) || NextResponse.json({ error: '리포트 발송 내역을 불러오지 못했습니다.' }, { status: 500, headers: privateHeaders }) }
}
