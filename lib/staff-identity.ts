import { getSupabaseAdmin } from './supabase-admin'
import { AccessError, staffColumns, staffForUser } from './admin-auth'
export function credentials(body: Record<string, unknown>) {
  const email = String(body.email || '').trim().toLowerCase()
  const password = typeof body.password === 'string' ? body.password : ''
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || email.length > 254 || !password || password.length > 128) throw new AccessError(400, '이메일과 비밀번호를 확인해 주세요.')
  return { email, password }
}
export async function createIdentity(email: string, password: string) {
  if (password.length < 10 || password.length > 128) throw new AccessError(400, '비밀번호는 10자 이상 입력해 주세요.')
  const { data, error } = await getSupabaseAdmin().auth.admin.createUser({ email, password, email_confirm: true })
  // Never reset an existing Auth user's password shared with another app.
  if (error && ['email_exists', 'user_already_exists'].includes(error.code || '')) return null
  if (error || !data.user) throw new AccessError(400, '계정을 만들지 못했습니다. 이메일과 비밀번호를 확인해 주세요.')
  return data.user.id
}
export async function signInStaff(email: string, password: string) {
  // A fresh Auth client avoids mutating the service-role database client's session.
  const { data, error } = await getSupabaseAdmin().auth.signInWithPassword({ email, password })
  if (error || !data.session || !data.user?.email_confirmed_at || data.user.is_anonymous) throw new AccessError(401, '이메일 또는 비밀번호를 확인해 주세요.')
  const db = getSupabaseAdmin()
  const { data: account, error: accountError } = await db.from('staff_accounts').select(staffColumns).eq('email', data.user.email!.toLowerCase()).eq('active', true).maybeSingle()
  if (accountError) throw accountError
  if (!account || (account.auth_user_id && account.auth_user_id !== data.user.id)) throw new AccessError(403, '사용 가능한 계정이 없습니다. 관리자에게 확인해 주세요.')
  if (!account.auth_user_id) {
    const { error: bindError } = await db.from('staff_accounts').update({ auth_user_id: data.user.id }).eq('id', account.id).is('auth_user_id', null).eq('active', true)
    if (bindError) throw bindError
  }
  return { staff: await staffForUser(data.user.id), session: data.session }
}
