require('./register.cjs')
const { test } = require('node:test'), assert = require('node:assert/strict')
const { createClient } = require('@supabase/supabase-js')
const requests = []
const db = createClient('https://example.test', 'test-only-key', { auth: { persistSession: false, autoRefreshToken: false }, db: { schema: 'moasem' }, global: { fetch: async (url, init) => {
  requests.push({ url: new URL(url), method: init.method, headers: new Headers(init.headers) })
  return new Response('[]', { status: 200, headers: { 'content-type': 'application/json', 'content-range': '*/0' } })
} } })
const dbPath = require.resolve('../lib/supabase-admin.ts')
require.cache[dbPath] = { id: dbPath, filename: dbPath, loaded: true, exports: { getSupabaseAdmin: () => db } }
const { weeklyRecords, weeklyStudents } = require('../lib/weekly-progress-data.ts')
test('Installed SDK generates bounded private-schema GET queries with current-student/program inner joins', async () => {
  const staff = { role: 'instructor', instructor_id: 'teacher' }
  for (const [table, date] of [['student_progress_entries', 'lesson_date'], ['homework', 'due_on'], ['attendance', 'session_date']]) {
    await weeklyRecords(staff, 'program', ['student'], table, 'id', '2026-09-30', '2026-10-27')
    const r = requests.at(-1), p = r.url.searchParams
    assert.equal(r.method, 'GET'); assert.equal(r.headers.get('accept-profile'), 'moasem'); assert.match(r.headers.get('prefer'), /count=exact/)
    for (const [key, value] of Object.entries({ program_id: 'eq.program', 'student.program_id': 'eq.program', 'student.active': 'eq.true', 'program.instructor_id': 'eq.teacher', student_id: 'in.(student)', order: 'id.asc', offset: '0', limit: '1000' })) assert.equal(p.get(key), value)
    assert.deepEqual(p.getAll(date), ['gte.2026-09-30', 'lte.2026-10-27'])
    assert.match(p.get('select'), /students!inner/); assert.match(p.get('select'), /programs!inner/)
  }
  await weeklyStudents(staff, 'program').order('name').order('id').range(25, 49)
  const p = requests.at(-1).url.searchParams
  assert.equal(p.get('offset'), '25'); assert.equal(p.get('limit'), '25'); assert.equal(p.get('order'), 'name.asc,id.asc')
})
