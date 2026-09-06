require('./register.cjs')
const { test, beforeEach } = require('node:test'), assert = require('node:assert/strict')
const { NextRequest } = require('next/server')
const own = '11111111-1111-4111-8111-111111111111', other = '22222222-2222-4222-8222-222222222222'
const id = n => `44444444-4444-4444-8444-${String(n).padStart(12, '0')}`
let account, tables, queries, signs, failTable, failSign, moveProgram
class Query {
  constructor(table) { this.table = table; this.filters = []; this.orders = []; queries.push(this) }
  select(columns, options) { this.columns = columns; this.head = options?.head; return this }
  eq(key, value) { this.filters.push([key, value, 'eq']); return this }
  lt(key, value) { this.filters.push([key, value, 'lt']); return this }
  order(key, options) { this.orders.push([key, options]); return this }
  range(from, to) { this.bounds = [from, to]; return this }
  returns() { return this }
  maybeSingle() { this.one = true; return this }
  then(resolve, reject) {
    if (failTable === this.table) return Promise.resolve({ error: { message: 'secret database details' }, data: null }).then(resolve, reject)
    let rows = this.table === 'staff_accounts' ? [account] : tables[this.table]
    if (this.table === 'homework') rows = rows.map(r => ({ ...r, student: tables.students.find(s => s.id === r.student_id), program: tables.programs.find(p => p.id === r.program_id) }))
    rows = rows.filter(row => this.filters.every(([key, expected, op]) => {
      const actual = key.split('.').reduce((v, k) => v?.[k], row)
      return op === 'lt' ? actual < expected : actual === expected
    }))
    const count = rows.length
    for (const [key, opts] of [...this.orders].reverse()) rows = [...rows].sort((a, b) => {
      if (a[key] === b[key]) return 0
      if (a[key] == null) return opts.nullsFirst ? -1 : 1
      if (b[key] == null) return opts.nullsFirst ? 1 : -1
      return (a[key] < b[key] ? -1 : 1) * (opts.ascending ? 1 : -1)
    })
    if (this.table === 'programs' && moveProgram) tables.programs[0].instructor_id = 'reassigned'
    if (this.bounds && this.bounds[0] >= count && this.bounds[0] > 0) return Promise.resolve({ data: null, count, error: { code: 'PGRST103' } }).then(resolve, reject)
    if (this.bounds) rows = rows.slice(this.bounds[0], this.bounds[1] + 1)
    return Promise.resolve({ data: this.head ? null : this.one ? rows[0] ?? null : rows, count, error: null }).then(resolve, reject)
  }
}
const db = {
  from: table => new Query(table),
  auth: { getUser: async token => ({ data: { user: token === 'valid' ? { id: 'user', user_metadata: { role: 'admin' } } : null }, error: null }) },
  storage: { from: bucket => ({ createSignedUrl: async (path, seconds) => { signs.push({ bucket, path, seconds }); return { data: failSign ? null : { signedUrl: 'https://photos.example/signed?token=temporary' }, error: failSign ? Error('secret storage detail') : null } } }) },
}
const dbPath = require.resolve('../lib/supabase-admin.ts')
require.cache[dbPath] = { id: dbPath, filename: dbPath, loaded: true, exports: { getSupabaseAdmin: () => db } }
const list = require('../app/api/admin/homework-review/route.ts'), detail = require('../app/api/admin/homework-review/[id]/route.ts')
const { koreaToday, deadlineLabel } = require('../lib/homework-review.ts')
function req(query = '', token = 'valid') { return new NextRequest(`https://moasem.example/api/admin/homework-review?program_id=${own}${query}`, { headers: token ? { cookie: `moasem-access=${token}` } : {} }) }
const read = (homeworkId, query = '', token = 'valid') => detail.GET(req(query, token), { params: { id: homeworkId } })
beforeEach(() => {
  account = { id: 'staff', name: '강사', email: 'teacher@example.test', role: 'instructor', instructor_id: 'teacher', auth_user_id: 'user', active: true }
  queries = []; signs = []; failTable = null; failSign = false; moveProgram = false
  tables = {
    programs: [{ id: own, instructor_id: 'teacher' }, { id: other, instructor_id: 'another' }],
    students: [{ id: id(100), name: '담당 학생', grade: 3, active: true, program_id: own, phone: 'private' }, { id: id(101), name: '이동 학생', grade: 4, active: true, program_id: other }, { id: id(102), name: '중지 학생', grade: 2, active: false, program_id: own }],
    homework: [],
  }
  function homework(n, status, student = 100, program = own, due = '2000-01-01') {
    return { id: id(n), title: `과제 ${n}`, details: '10쪽', assigned_on: '1999-12-01', due_on: due, status, submitted_at: status === 'submitted' ? '2026-01-01T00:00:00Z' : null, checked_at: status === 'checked' ? '2026-01-02T00:00:00Z' : null, student_id: id(student), program_id: program, photos: [{ id: id(500 + n), storage_path: `private/path/${n}.jpg` }], private_note: 'not for response' }
  }
  tables.homework = [homework(1, 'assigned'), homework(2, 'assigned', 100, own, koreaToday()), homework(3, 'assigned', 100, own, '2099-01-01'), homework(4, 'submitted'), homework(5, 'checked'), homework(6, 'submitted', 101), homework(7, 'assigned', 102), homework(8, 'submitted', 101, other)]
})
test('Review requires current staff login, not the setup key or editable metadata', async () => {
  assert.equal((await list.GET(req('', null))).status, 401)
  assert.equal((await read(id(4), '', null)).status, 401)
  assert.equal(queries.length, 0)
  account.active = false
  assert.equal((await list.GET(req())).status, 403)
  assert.equal(signs.length, 0)
})
test('Foreign program and homework IDs are denied before photo signing', async () => {
  const foreign = new NextRequest(`https://moasem.example/api/admin/homework-review?program_id=${other}`, { headers: { cookie: 'moasem-access=valid' } })
  assert.equal((await list.GET(foreign)).status, 403)
  assert.equal((await detail.GET(foreign, { params: { id: id(8) } })).status, 403)
  assert.equal((await read(id(8))).status, 404)
  assert.equal(signs.length, 0)
})
test('Counts distinguish all assigned from overdue and exclude moved/inactive students', async () => {
  const r = await list.GET(req()), body = await r.json()
  assert.equal(r.status, 200)
  assert.deepEqual(body.counts, { assigned: 3, submitted: 1, checked: 1, overdue: 1, all: 5 })
  assert.deepEqual(body.items.map(h => h.id), [id(4)])
  assert.equal(body.items[0].photo_count, 1)
  assert.deepEqual(Object.keys(body.items[0].student).sort(), ['grade', 'id', 'name'])
  assert.doesNotMatch(JSON.stringify(body), /storage_path|private\/path|private_note|phone|instructor_id/)
  assert.deepEqual(signs, [])
  assert.match(r.headers.get('cache-control'), /private.*no-store/)
  assert.match(r.headers.get('x-robots-tag'), /noindex/)
  for (const q of queries.filter(q => q.table === 'homework')) {
    assert.match(q.columns, /student:students!inner/); assert.match(q.columns, /program:programs!inner/)
    assert.ok(q.filters.some(([k, v]) => k === 'program.instructor_id' && v === 'teacher'))
  }
})
test('Each status selects the correct tasks; checked and submitted are never overdue', async () => {
  for (const [filter, expected] of Object.entries({ assigned: [1, 2, 3], overdue: [1], checked: [5], all: [1, 4, 5, 2, 3] })) {
    assert.deepEqual((await (await list.GET(req(`&filter=${filter}`))).json()).items.map(h => h.id), expected.map(id))
  }
})
test('Pagination uses a stable ID tie-breaker, 30 rows, and recovers when a later page empties', async () => {
  const sample = tables.homework[3]
  tables.homework = Array.from({ length: 65 }, (_, n) => ({ ...sample, id: id(n + 1) })).reverse()
  const result = await (await list.GET(req('&page=2'))).json()
  assert.equal(result.total, 65); assert.equal(result.items.length, 30)
  assert.equal(result.items[0].id, id(31)); assert.equal(result.items[29].id, id(60))
  const last = await list.GET(req('&page=4')), empty = await last.json()
  assert.equal(last.status, 200); assert.deepEqual(empty.items, []); assert.equal(empty.total, 65)
})
test('Invalid filters, UUIDs and unbounded pages fail safely', async () => {
  for (const query of ['&filter=bad', '&page=0', '&page=-1', '&page=1.5', '&page=1000000', '&page=1e3']) assert.equal((await list.GET(req(query))).status, 400)
  assert.equal((await read('invalid')).status, 400)
  assert.equal(queries.filter(q => q.table === 'homework').length, 0)
})
test('Detail signs only one authorized homework for five minutes, never returns raw paths', async () => {
  const r = await read(id(4)), body = await r.json()
  assert.equal(r.status, 200); assert.equal(body.item.id, id(4)); assert.equal(body.expires_in, 300)
  assert.deepEqual(signs, [{ bucket: 'moasem-homework', path: 'private/path/4.jpg', seconds: 300 }])
  assert.deepEqual(body.photos, [{ id: id(504), url: 'https://photos.example/signed?token=temporary' }])
  assert.doesNotMatch(JSON.stringify(body), /storage_path|private\/path|private_note/)
  assert.match(r.headers.get('cache-control'), /no-store/)
})
test('Moved or inactive student and reassigned program cannot expose a photo', async () => {
  for (const n of [6, 7]) assert.equal((await read(id(n))).status, 404)
  moveProgram = true
  assert.equal((await read(id(4))).status, 404)
  assert.deepEqual(signs, [])
})
test('Database and storage failures are errors, not an empty success or leaked details', async () => {
  failTable = 'homework'
  const r = await list.GET(req()); assert.equal(r.status, 500); assert.doesNotMatch(await r.text(), /secret/)
  failTable = null; failSign = true
  const photo = await read(id(4)); assert.equal(photo.status, 500); assert.doesNotMatch(await photo.text(), /secret/)
})
test('Korean midnight and assigned dates distinguish overdue, today, not started and completed', () => {
  assert.equal(koreaToday(new Date('2026-09-05T15:00:00Z')), '2026-09-06')
  assert.equal(koreaToday(new Date('2026-09-05T14:59:59Z')), '2026-09-05')
  const h = { status: 'assigned', assigned_on: '2026-09-05', due_on: '2026-09-06' }
  assert.equal(deadlineLabel(h, '2026-09-07'), '기한 초과')
  assert.equal(deadlineLabel(h, '2026-09-06'), '오늘 마감')
  assert.equal(deadlineLabel(h, '2026-09-05'), '마감 전')
  assert.equal(deadlineLabel(h, '2026-09-04'), '시작 전')
  assert.equal(deadlineLabel({ ...h, status: 'submitted' }, '2026-09-07'), '')
})
