require('./register.cjs')
const { test, beforeEach } = require('node:test'), assert = require('node:assert/strict')
const { NextRequest } = require('next/server')
const own = '11111111-1111-4111-8111-111111111111', other = '22222222-2222-4222-8222-222222222222'
const id = n => `44444444-4444-4444-8444-${String(n).padStart(12, '0')}`
let account, tables, queries, failTable, rowCap, reassign
class Query {
  constructor(table) { this.table = table; this.filters = []; this.orders = []; queries.push(this) }
  select(columns, options) { this.columns = columns; this.countMode = options?.count; return this }
  eq(key, value) { this.filters.push([key, value, 'eq']); return this }
  in(key, value) { this.filters.push([key, value, 'in']); return this }
  gte(key, value) { this.filters.push([key, value, 'gte']); return this }
  lte(key, value) { this.filters.push([key, value, 'lte']); return this }
  order(key, options) { this.orders.push([key, options]); return this }
  range(from, to) { this.bounds = [from, to]; return this }
  returns() { return this }
  maybeSingle() { this.one = true; return this }
  then(resolve, reject) {
    if (failTable === this.table) return Promise.resolve({ error: { message: 'private SQL details' }, data: null }).then(resolve, reject)
    let rows = this.table === 'staff_accounts' ? [account] : tables[this.table]
    if (this.table === 'students') rows = rows.map(r => ({ ...r, program: tables.programs.find(p => p.id === r.program_id) }))
    if (['student_progress_entries', 'homework', 'attendance'].includes(this.table)) rows = rows.map(r => ({ ...r, student: tables.students.find(s => s.id === r.student_id), program: tables.programs.find(p => p.id === r.program_id) }))
    rows = rows.filter(row => this.filters.every(([key, expected, op]) => {
      const actual = key.split('.').reduce((v, k) => v?.[k], row)
      return op === 'in' ? expected.includes(actual) : op === 'gte' ? actual >= expected : op === 'lte' ? actual <= expected : actual === expected
    }))
    const count = rows.length
    for (const [key, opts] of [...this.orders].reverse()) rows = [...rows].sort((a, b) => a[key] === b[key] ? 0 : (a[key] < b[key] ? -1 : 1) * (opts.ascending ? 1 : -1))
    if (this.table === 'programs' && reassign) tables.programs[0].instructor_id = 'reassigned'
    if (this.bounds && this.bounds[0] >= count && this.bounds[0] > 0) return Promise.resolve({ data: null, count, error: { code: 'PGRST103' } }).then(resolve, reject)
    if (this.bounds) rows = rows.slice(this.bounds[0], Math.min(this.bounds[1] + 1, this.bounds[0] + rowCap))
    return Promise.resolve({ data: this.one ? rows[0] ?? null : rows, count, error: null }).then(resolve, reject)
  }
}
const db = { from: table => new Query(table), auth: { getUser: async token => ({ data: { user: token === 'valid' ? { id: 'user', user_metadata: { role: 'admin' } } : null }, error: null }) } }
const dbPath = require.resolve('../lib/supabase-admin.ts')
require.cache[dbPath] = { id: dbPath, filename: dbPath, loaded: true, exports: { getSupabaseAdmin: () => db } }
const list = require('../app/api/admin/weekly-progress/route.ts'), detail = require('../app/api/admin/weekly-progress/[studentId]/route.ts')
function req(query = '', token = 'valid', program = own) { return new NextRequest(`https://moasem.example/api/admin/weekly-progress?program_id=${program}&week_start=1${query}`, { headers: token ? { cookie: `moasem-access=${token}` } : {} }) }
const read = (studentId = id(100), query = '&week=1', token = 'valid', program = own) => detail.GET(req(query, token, program), { params: { studentId } })
beforeEach(() => {
  account = { id: 'staff', name: '강사', email: 'teacher@example.test', role: 'instructor', instructor_id: 'teacher', auth_user_id: 'user', active: true }
  queries = []; failTable = null; rowCap = 1000; reassign = false
  tables = {
    programs: [{ id: own, name: '수학', starts_on: '2026-09-30', ends_on: '2026-10-21', week_count: 12, institution: { name: '기관', phone: 'private' }, instructor_id: 'teacher' }, { id: other, instructor_id: 'another' }],
    students: [{ id: id(100), name: '담당 학생', grade: 3, active: true, program_id: own, phone: 'private' }, { id: id(101), name: '이동 학생', grade: 4, active: true, program_id: other }, { id: id(102), name: '중지 학생', grade: 2, active: false, program_id: own }],
    student_progress_entries: [], homework: [], attendance: [],
  }
  tables.student_progress_entries = [100, 101, 102].map(n => ({ id: id(n + 1), student_id: id(n), program_id: own, lesson_date: '2026-10-01', created_at: '2026-10-01T00:00:00Z', book: '수학 익힘', pages: '10', unit: '분수', teacher_note: '강사 메모', storage_path: 'private/file' }))
  tables.homework = [{ id: id(1), student_id: id(100), program_id: own, due_on: '2026-10-02', assigned_on: '2026-09-29', title: '분수 연습', status: 'checked', storage_path: 'private/file' }]
  tables.attendance = [{ id: id(2), student_id: id(100), program_id: own, session_date: '2026-10-01', session_type: 'zoom', status: 'late', note: '메모' }]
})
test('Both APIs require active staff and reject foreign programs, moved/inactive students and invalid weeks', async () => {
  assert.equal((await list.GET(req('', null))).status, 401); assert.equal((await read(id(100), '&week=1', null)).status, 401)
  assert.equal(queries.length, 0)
  assert.equal((await list.GET(req('', 'valid', other))).status, 403)
  assert.equal((await read(id(100), '&week=1', 'valid', other)).status, 403)
  for (const n of [101, 102]) assert.equal((await read(id(n))).status, 404)
  for (const query of ['', '&week=0', '&week=5', '&week=1.1', '&week=1000000']) assert.equal((await read(id(100), query)).status, 400)
  assert.equal((await list.GET(req('&page=0'))).status, 400)
  account.active = false; assert.equal((await list.GET(req())).status, 403)
})
test('Overview is private, limited to four weeks and current students, and does not leak record details', async () => {
  const r = await list.GET(req()), body = await r.json()
  assert.equal(r.status, 200); assert.equal(body.total_students, 1); assert.equal(body.weeks.length, 4)
  assert.equal(body.program.week_count, 12); assert.equal(body.total_weeks, 4)
  assert.equal(body.rows[0].cells[0].progress_count, 1); assert.equal(body.rows[0].cells[0].homework.checked, 1)
  assert.equal(body.rows[0].cells[0].attendance.zoom.late, 1)
  assert.doesNotMatch(JSON.stringify(body), /storage_path|phone|instructor_id|teacher_note/)
  assert.match(r.headers.get('cache-control'), /private.*no-store/); assert.match(r.headers.get('x-robots-tag'), /noindex/)
  for (const q of queries.filter(q => ['student_progress_entries', 'homework', 'attendance'].includes(q.table))) {
    assert.match(q.columns, /students!inner/); assert.match(q.columns, /programs!inner/)
    for (const [key, value] of [['program_id', own], ['student.program_id', own], ['student.active', true], ['program.instructor_id', 'teacher']]) assert.ok(q.filters.some(([k, v]) => k === key && v === value))
    assert.deepEqual(q.filters.find(([k]) => k === 'student_id')[1], [id(100)])
  }
})
test('Pagination keeps 25 students and reads all records even with more than 1000 and a lower server cap', async () => {
  const student = tables.students[0], entry = tables.student_progress_entries[0]
  tables.students = Array.from({ length: 26 }, (_, n) => ({ ...student, id: id(n + 100), name: '동명이인' }))
  tables.student_progress_entries = Array.from({ length: 1005 }, (_, n) => ({ ...entry, id: id(n + 1000) }))
  rowCap = 400
  const first = await (await list.GET(req())).json()
  assert.equal(first.rows.length, 25); assert.equal(first.total_students, 26); assert.equal(first.rows[0].cells[0].progress_count, 1005)
  assert.deepEqual(queries.filter(q => q.table === 'student_progress_entries').map(q => q.bounds[0]), [0, 400, 800])
  const second = await (await list.GET(req('&page=2'))).json()
  assert.equal(second.rows.length, 1); assert.equal(second.rows[0].student.id, id(125))
  const empty = await list.GET(req('&page=3')); assert.equal(empty.status, 200); assert.deepEqual((await empty.json()).rows, [])
})
test('Single-week detail clips the final day, excludes out-of-period entries, and whitelists its response', async () => {
  tables.student_progress_entries.push(...['2026-10-21', '2026-10-22'].map((date, i) => ({ ...tables.student_progress_entries[0], id: id(i + 900), lesson_date: date })))
  const first = await (await read()).json()
  assert.equal(first.progress.length, 1); assert.equal(first.progress[0].teacher_note, '강사 메모')
  assert.equal(first.homework[0].title, '분수 연습'); assert.equal(first.attendance[0].note, '메모')
  assert.doesNotMatch(JSON.stringify(first), /storage_path|phone|instructor_id|program_id/)
  const last = await (await read(id(100), '&week=4')).json()
  assert.equal(last.week.starts_on, '2026-10-21'); assert.equal(last.week.ends_on, '2026-10-21')
  assert.deepEqual(last.progress.map(r => r.lesson_date), ['2026-10-21'])
})
test('Reassigned programs lose access in each current-scope query; administrators can read all programs', async () => {
  reassign = true
  assert.equal((await read()).status, 404)
  account.role = 'admin'
  assert.equal((await read()).status, 200)
})
test('Query failures never masquerade as an empty success or expose raw SQL', async () => {
  failTable = 'attendance'
  for (const result of [await list.GET(req()), await read()]) { assert.equal(result.status, 500); assert.doesNotMatch(await result.text(), /private SQL/) }
  failTable = null; tables.programs[0].ends_on = '2026-09-01'
  assert.equal((await list.GET(req())).status, 400)
})
