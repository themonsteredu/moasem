import { timingSafeEqual } from 'node:crypto'
import { NextRequest, NextResponse } from 'next/server'
import { getSupabaseAdmin } from './supabase-admin'
import type { Staff } from './staff-types'

export const accessCookie = 'moasem-access'
export const refreshCookie = 'moasem-refresh'
export const privateHeaders = { 'Cache-Control': 'private, no-store, max-age=0', 'X-Robots-Tag': 'noindex, nofollow' }
export const staffColumns = 'id,name,email,role,instructor_id,auth_user_id,active'
export class AccessError extends Error {
  constructor(public status: number, message: string) { super(message) }
}
export function authErrorResponse(error: unknown) {
  return error instanceof AccessError ? NextResponse.json({ error: error.message }, { status: error.status, headers: privateHeaders }) : null
}
export function assertSameOrigin(request: NextRequest) {
  if (request.headers.get('origin') !== request.nextUrl.origin) throw new AccessError(403, '이 사이트에서 다시 시도해 주세요.')
}
export function verifySetupKey(key: unknown) {
  const expected = Buffer.from(process.env.MOASEM_ADMIN_KEY || '')
  const received = Buffer.from(typeof key === 'string' ? key : '')
  if (!expected.length || expected.length !== received.length || !timingSafeEqual(expected, received)) throw new AccessError(401, '관리 키를 확인해 주세요.')
}
export function publicStaff(row: Staff): Staff {
  return { id: row.id, name: row.name, email: row.email, role: row.role, instructor_id: row.instructor_id }
}
export async function staffForUser(userId: string): Promise<Staff> {
  const { data, error } = await getSupabaseAdmin().from('staff_accounts').select(staffColumns).eq('auth_user_id', userId).eq('active', true).maybeSingle()
  if (error) throw error
  if (!data || (data.role !== 'admin' && (!data.instructor_id || data.role !== 'instructor'))) throw new AccessError(403, '사용 가능한 계정이 없습니다. 관리자에게 확인해 주세요.')
  return publicStaff(data as Staff)
}
export async function assertStaff(request: NextRequest): Promise<Staff> {
  if (!['GET', 'HEAD'].includes(request.method)) assertSameOrigin(request)
  const token = request.cookies.get(accessCookie)?.value
  if (!token) throw new AccessError(401, '로그인이 필요합니다.')
  // Roles and active status come from our DB, never user-editable metadata.
  const { data, error } = await getSupabaseAdmin().auth.getUser(token)
  if (error || !data.user || data.user.is_anonymous) throw new AccessError(401, '다시 로그인해 주세요.')
  return staffForUser(data.user.id)
}
export async function assertAdmin(request: NextRequest) {
  const staff = await assertStaff(request)
  if (staff.role !== 'admin') throw new AccessError(403, '관리자만 사용할 수 있습니다.')
  return staff
}
export async function assertProgramAccess(staff: Staff, programId: string) {
  if (!/^[0-9a-f-]{36}$/i.test(programId)) throw new AccessError(404, '프로그램을 찾지 못했습니다.')
  let query = getSupabaseAdmin().from('programs').select('id').eq('id', programId)
  if (staff.role === 'instructor') query = query.eq('instructor_id', staff.instructor_id!)
  const { data, error } = await query.maybeSingle()
  if (error) throw error
  if (!data) throw new AccessError(403, '담당 프로그램만 사용할 수 있습니다.')
}
export function setSessionCookies(response: NextResponse, session: { access_token: string; refresh_token: string; expires_in: number }) {
  const options = { httpOnly: true, secure: process.env.NODE_ENV === 'production', sameSite: 'lax' as const, path: '/' }
  response.cookies.set(accessCookie, session.access_token, { ...options, maxAge: session.expires_in })
  response.cookies.set(refreshCookie, session.refresh_token, { ...options, maxAge: 8 * 60 * 60 })
  return response
}
export function clearSessionCookies(response: NextResponse) {
  for (const name of [accessCookie, refreshCookie]) response.cookies.set(name, '', { httpOnly: true, secure: process.env.NODE_ENV === 'production', sameSite: 'lax', path: '/', maxAge: 0 })
  return response
}
