require('./register.cjs')
const { test } = require('node:test'), assert = require('node:assert/strict')
const { createClient } = require('@supabase/supabase-js')
const requests = []
const db = createClient('https://example.test', 'test-only-key', {
  auth: { persistSession: false, autoRefreshToken: false }, db: { schema: 'moasem' },
  global: { fetch: async (url, init) => {
    requests.push({ url: new URL(url), method: init.method, headers: new Headers(init.headers) })
    return new Response(init.method === 'HEAD' ? null : '[]', { status: 200, headers: { 'content-type': 'application/json', 'content-range': '0-29/65' } })
  } },
})
const dbPath = require.resolve('../lib/supabase-admin.ts')
require.cache[dbPath] = { id: dbPath, filename: dbPath, loaded: true, exports: { getSupabaseAdmin: () => db } }
const { filteredHomework, scopedHomework } = require('../lib/homework-review-data.ts')
test('Installed Supabase SDK produces scoped inner-join queries, exact HEAD counts and bounded pagination', async () => {
  const staff = { role: 'instructor', instructor_id: 'teacher' }
  await filteredHomework(staff, 'program', 'id', 'overdue', '2026-09-06', true)
  const count = requests[0]
  assert.equal(count.method, 'HEAD')
  assert.equal(count.url.pathname, '/rest/v1/homework')
  assert.equal(count.headers.get('accept-profile'), 'moasem')
  assert.match(count.headers.get('prefer'), /count=exact/)
  for (const [key, value] of Object.entries({ program_id: 'eq.program', 'student.program_id': 'eq.program', 'student.active': 'eq.true', 'program.instructor_id': 'eq.teacher', status: 'eq.assigned', due_on: 'lt.2026-09-06' })) assert.equal(count.url.searchParams.get(key), value)
  assert.match(count.url.searchParams.get('select'), /students!inner/)
  assert.match(count.url.searchParams.get('select'), /programs!inner/)
  await scopedHomework(staff, 'program', 'id,photos:homework_photos(id)').order('due_on').order('id').range(30, 59)
  const page = requests[1].url.searchParams
  assert.equal(page.get('offset'), '30'); assert.equal(page.get('limit'), '30')
  assert.equal(page.get('order'), 'due_on.asc,id.asc')
  assert.doesNotMatch(page.get('select'), /storage_path/)
})
