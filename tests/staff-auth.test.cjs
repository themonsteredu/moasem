require('./register.cjs')
const { test, beforeEach } = require('node:test')
const assert = require('node:assert/strict')
const { NextRequest } = require('next/server')
const own = '11111111-1111-4111-8111-111111111111'
const other = '22222222-2222-4222-8222-222222222222'
const instructorId = '33333333-3333-4333-8333-333333333333'
const studentId = '44444444-4444-4444-8444-444444444444'
const user = { id: 'auth-user', email: 'teacher@example.test', email_confirmed_at: '2026-01-01', user_metadata: { role: 'admin' }, is_anonymous: false }
let account, authUser, tables, queries, writes, rpcCalls, identityCalls, sessionCalls
let loginFails, refreshFails, dbFails
const session = { access_token: 'fresh-access', refresh_token: 'fresh-refresh', expires_in: 3600 }
class Query {
  constructor(table) { this.table = table; this.filters = []; this.kind = 'select'; this.payload = null; this.head = false; this.one = false; queries.push(this) }
  select(columns, options) { this.columns = columns; this.head = options?.head || false; return this }
  eq(key, value) { this.filters.push([key, value]); return this }
  is(key, value) { return this.eq(key, value) }
  in(key, value) { this.filters.push([key, value, 'in']); return this }
  order() { return this }
  maybeSingle() { this.one = true; return this }
  single() { this.one = true; return this }
  update(value) { this.kind = 'update'; this.payload = value; return this }
  insert(value) { this.kind = 'insert'; this.payload = value; return this }
  delete() { this.kind = 'delete'; return this }
  upsert(value) { this.kind = 'upsert'; this.payload = value; return this }
  then(resolve, reject) {
    if (dbFails) return Promise.resolve({ data: null, error: new Error('database unavailable') }).then(resolve, reject)
    let rows = this.table === 'staff_accounts' ? (account ? [account] : []) : (tables[this.table] || [])
    rows = rows.filter(row => this.filters.every(([key, expected, op]) => {
      const actual = key === 'program.instructor_id' ? tables.programs.find(p => p.id === row.program_id)?.instructor_id : row[key]
      return op === 'in' ? expected.includes(actual) : actual === expected
    }))
    if (this.kind !== 'select') {
      writes.push({ table: this.table, kind: this.kind, payload: this.payload })
      if (this.kind === 'update') rows.forEach(row => Object.assign(row, this.payload))
      if (this.kind === 'insert') rows = [{ id: 'new-record', token: 'report-token', ...this.payload }]
    }
    const data = this.head ? null : this.one ? rows[0] || null : rows
    return Promise.resolve({ data, count: rows.length, error: null }).then(resolve, reject)
  }
}
const fakeDb = {
  from: name => new Query(name),
  rpc: async (name, args) => { rpcCalls.push({ name, args }); return { data: 'saved', error: null } },
  auth: {
    getUser: async token => ({ data: { user: token === 'valid' ? authUser : null }, error: token === 'valid' ? null : new Error('expired') }),
    signInWithPassword: async () => { sessionCalls.push('login'); return { data: { user: authUser, session }, error: loginFails ? new Error('wrong password') : null } },
    refreshSession: async () => { sessionCalls.push('refresh'); return { data: { user: authUser, session }, error: refreshFails ? new Error('expired') : null } },
    admin: {
      createUser: async () => { identityCalls.push('create'); return { data: { user: null }, error: { code: 'email_exists' } } },
      signOut: async (token, scope) => { sessionCalls.push({ token, scope }); return { error: null } },
      deleteUser: async () => { throw new Error('Must not delete a shared identity') },
    },
  },
}
const dbPath = require.resolve('../lib/supabase-admin.ts')
require.cache[dbPath] = { id: dbPath, filename: dbPath, loaded: true, exports: { getSupabaseAdmin: () => fakeDb } }
const guards = require('../lib/admin-auth.ts')
const programs = require('../app/api/admin/programs/route.ts')
const students = require('../app/api/admin/students/route.ts')
const attendance = require('../app/api/admin/attendance/route.ts')
const reports = require('../app/api/admin/learning-reports/route.ts')
const instructors = require('../app/api/admin/instructors/route.ts')
const login = require('../app/api/auth/login/route.ts')
const status = require('../app/api/auth/session/route.ts')
const logout = require('../app/api/auth/logout/route.ts')
const setup = require('../app/api/auth/setup/route.ts')
function req(path, { method = 'GET', body, token = 'valid', origin = 'https://moasem.example', refresh } = {}) {
  const headers = { origin }
  if (token) headers.cookie = `moasem-access=${token}`
  if (refresh) headers.cookie = `${headers.cookie || ''}; moasem-refresh=${refresh}`
  return new NextRequest(`https://moasem.example${path}`, { method, headers, body: body ? JSON.stringify(body) : undefined })
}
beforeEach(() => {
  account = { id: 'staff', name: '강사', email: user.email, role: 'instructor', instructor_id: instructorId, auth_user_id: user.id, active: true }
  authUser = { ...user }; queries = []; writes = []; rpcCalls = []; identityCalls = []; sessionCalls = []; loginFails = false; refreshFails = false; dbFails = false
  tables = {
    programs: [{ id: own, instructor_id: instructorId, name: '담당 프로그램' }, { id: other, instructor_id: 'another-instructor', name: '다른 프로그램' }],
    students: [{ id: studentId, program_id: own, name: '담당 학생', active: true, guardian_id: 'guardian' }, { id: 'other-student', program_id: other, name: '다른 학생', active: true }],
    attendance: [],
  }
  process.env.MOASEM_ADMIN_KEY = 'test-setup-key'
})
test('The old admin key cannot bypass staff authentication', async () => {
  const request = new NextRequest('https://moasem.example/api/admin/programs', { headers: { 'x-moasem-admin-key': 'test-setup-key' } })
  assert.equal((await programs.GET(request)).status, 401)
  assert.equal(queries.length, 0)
})
test('User-editable admin metadata does not grant administrator access', async () => {
  assert.equal((await guards.assertStaff(req('/'))).role, 'instructor')
  await assert.rejects(guards.assertAdmin(req('/')), error => error.status === 403)
})
for (const state of ['inactive', 'unregistered', 'anonymous']) test(`${state} account is denied`, async () => {
  if (state === 'inactive') account.active = false
  if (state === 'unregistered') account = null
  if (state === 'anonymous') authUser.is_anonymous = true
  assert.ok([401, 403].includes((await programs.GET(req('/api/admin/programs'))).status))
})
test('Program and student lists are filtered to the verified instructor', async () => {
  assert.deepEqual((await (await programs.GET(req('/api/admin/programs'))).json()).items.map(x => x.id), [own])
  assert.deepEqual((await (await students.GET(req('/api/admin/students'))).json()).items.map(x => x.id), [studentId])
  const studentQuery = queries.find(q => q.table === 'students')
  assert.match(studentQuery.columns, /programs!inner/)
})
test('Administrator can read all program and student records', async () => {
  account.role = 'admin'; account.instructor_id = null
  assert.equal((await (await programs.GET(req('/api/admin/programs'))).json()).items.length, 2)
  assert.equal((await (await students.GET(req('/api/admin/students'))).json()).items.length, 2)
})
test('Changing program ID cannot read or write another instructor attendance', async () => {
  assert.equal((await attendance.GET(req(`/api/admin/attendance?program_id=${other}&session_date=2026-09-05`))).status, 403)
  assert.equal((await attendance.POST(req('/api/admin/attendance', { method: 'POST', body: { program_id: other, session_date: '2026-09-05', records: [{ student_id: 'other-student', status: 'present' }] } }))).status, 403)
  assert.equal(writes.length, 0)
  assert.equal(queries.filter(q => q.table === 'attendance').length, 0)
})
test('Mixing a foreign student into own attendance rejects the entire write', async () => {
  const response = await attendance.POST(req('/api/admin/attendance', { method: 'POST', body: { program_id: own, session_date: '2026-09-05', records: [{ student_id: studentId, status: 'present' }, { student_id: 'other-student', status: 'present' }] } }))
  assert.equal(response.status, 400)
  assert.equal(writes.length, 0)
})
test('Own attendance and report creation work', async () => {
  assert.equal((await attendance.POST(req('/api/admin/attendance', { method: 'POST', body: { program_id: own, session_date: '2026-09-05', records: [{ student_id: studentId, status: 'present' }] } }))).status, 200)
  assert.equal((await reports.POST(req('/api/admin/learning-reports', { method: 'POST', body: { student_id: studentId, lesson_date: '2026-09-05', solved_count: 10, wrong_count: 2 } }))).status, 201)
  assert.deepEqual(writes.map(x => x.table), ['attendance', 'learning_logs', 'guardian_reports'])
})
test('Another student report cannot be created by guessing their ID', async () => {
  assert.equal((await reports.POST(req('/api/admin/learning-reports', { method: 'POST', body: { student_id: 'other-student', lesson_date: '2026-09-05', solved_count: 10, wrong_count: 2 } }))).status, 403)
  assert.equal(writes.length, 0)
})
test('Instructor cannot create accounts or register students', async () => {
  assert.equal((await instructors.POST(req('/api/admin/instructors', { method: 'POST', body: {} }))).status, 403)
  assert.equal((await students.POST(req('/api/admin/students', { method: 'POST', body: {} }))).status, 403)
  assert.deepEqual(identityCalls, [])
  assert.deepEqual(writes, [])
})
test('Cross-origin mutations are rejected before database or identity calls', async () => {
  assert.equal((await login.POST(req('/api/auth/login', { method: 'POST', origin: 'https://attacker.example', body: {} }))).status, 403)
  assert.equal((await attendance.POST(req('/api/admin/attendance', { method: 'POST', origin: 'https://attacker.example', body: {} }))).status, 403)
  assert.equal(queries.length, 0)
  assert.equal(sessionCalls.length, 0)
})
test('Login returns only staff data; tokens are HttpOnly cookies', async () => {
  const response = await login.POST(req('/api/auth/login', { method: 'POST', token: null, body: { email: user.email, password: 'example-pass' } }))
  assert.equal(response.status, 200)
  const body = await response.json()
  assert.equal(body.staff.role, 'instructor')
  assert.equal(body.staff.auth_user_id, undefined)
  assert.equal(body.session, undefined)
  assert.equal(response.cookies.get('moasem-access').httpOnly, true)
  assert.equal(response.cookies.get('moasem-refresh').httpOnly, true)
  assert.equal(response.cookies.get('moasem-refresh').sameSite, 'lax')
  assert.equal(response.cookies.get('moasem-refresh').maxAge, 28800)
  assert.match(response.headers.get('cache-control'), /no-store/)
})
test('Pending account binds only after password and confirmed email verification', async () => {
  account.auth_user_id = null
  loginFails = true
  const payload = { method: 'POST', body: { email: user.email, password: 'example-pass' } }
  assert.equal((await login.POST(req('/api/auth/login', payload))).status, 401)
  assert.equal(writes.length, 0)
  loginFails = false
  assert.equal((await login.POST(req('/api/auth/login', payload))).status, 200)
  assert.equal(account.auth_user_id, user.id)
})
test('Inactive account cannot sign in or refresh existing cookies', async () => {
  account.active = false
  assert.equal((await login.POST(req('/api/auth/login', { method: 'POST', body: { email: user.email, password: 'example-pass' } }))).status, 403)
  const response = await status.GET(req('/api/auth/session', { token: 'expired', refresh: 'old-refresh' }))
  assert.equal(response.status, 403)
  assert.equal(response.cookies.get('moasem-refresh').maxAge, 0)
})
test('Expired access refreshes cookies and rechecks active membership', async () => {
  const response = await status.GET(req('/api/auth/session', { token: 'expired', refresh: 'old-refresh' }))
  assert.equal(response.status, 200)
  assert.equal(response.cookies.get('moasem-access').value, 'fresh-access')
  assert.deepEqual(sessionCalls, ['refresh'])
})
test('A database outage does not clear valid session cookies', async () => {
  dbFails = true
  const response = await status.GET(req('/api/auth/session'))
  assert.equal(response.status, 500)
  assert.equal(response.headers.get('set-cookie'), null)
})
test('Logout revokes only this session and clears both cookies', async () => {
  const response = await logout.POST(req('/api/auth/logout', { method: 'POST' }))
  assert.equal(response.status, 200)
  assert.deepEqual(sessionCalls, [{ token: 'valid', scope: 'local' }])
  assert.equal(response.cookies.get('moasem-access').maxAge, 0)
  assert.equal(response.cookies.get('moasem-refresh').maxAge, 0)
})
test('First-admin setup requires the setup key and closes after first administrator exists', async () => {
  const payload = { email: 'admin@example.test', password: 'example-password', name: '원장', setup_key: 'wrong' }
  assert.equal((await setup.POST(req('/api/auth/setup', { method: 'POST', body: payload }))).status, 401)
  account.role = 'admin'; account.instructor_id = null
  payload.setup_key = 'test-setup-key'
  assert.equal((await setup.POST(req('/api/auth/setup', { method: 'POST', body: payload }))).status, 409)
  assert.equal(identityCalls.length, 0)
  assert.equal(rpcCalls.length, 0)
  assert.equal((await (await setup.GET()).json()).needs_setup, false)
})
test('Existing Auth identity is linked without a password reset or global account changes', async () => {
  account.role = 'admin'; account.instructor_id = null
  const response = await instructors.POST(req('/api/admin/instructors', { method: 'POST', body: { name: '새 강사', email: 'existing@example.test', password: 'initial-password', program_ids: [own], active: true } }))
  assert.equal(response.status, 201)
  assert.equal((await response.json()).uses_existing_account, true)
  assert.equal(rpcCalls[0].args.p_auth_user_id, null)
})
test('Logout with only a refresh cookie still revokes that session', async () => {
  const response = await logout.POST(req('/api/auth/logout', { method: 'POST', token: null, refresh: 'old-refresh' }))
  assert.equal(response.status, 200)
  assert.deepEqual(sessionCalls, ['refresh', { token: 'fresh-access', scope: 'local' }])
  assert.equal(response.cookies.get('moasem-refresh').maxAge, 0)
})
