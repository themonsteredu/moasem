require('./register.cjs')
const { test, afterEach } = require('node:test')
const assert = require('node:assert/strict')
const React = require('react')
const { create, act } = require('react-test-renderer')
require.cache[require.resolve('next/navigation')] = { id: require.resolve('next/navigation'), filename: require.resolve('next/navigation'), loaded: true, exports: { usePathname: () => '/students/44444444-4444-4444-8444-444444444444' } }
const { StaffProvider } = require('../app/components/staff-session.tsx')
const { StudentProgress } = require('../app/components/student-progress.tsx')
const { progressInput } = require('../lib/student-progress.ts')
const original = { fetch: global.fetch, window: global.window, sessionStorage: global.sessionStorage }
let mounted
const id = '44444444-4444-4444-8444-444444444444'
const form = { lesson_date: '2026-09-01', book: '수학 3-2', unit: '곱셈', pages: '20~23', next_assignment: '24쪽', learned: '', difficulties: '', teacher_note: '' }
const fixture = { student: { name: '시험 학생', grade: 3, institution_name: '시험 기관', program_name: '시험 프로그램', active: true }, current: { id: 'old', ...form }, entries: [{ id: 'result', kind: 'result', lesson_date: '2026-09-01', solved_count: 10, wrong_count: 2, reports: [{ id: 'r', token: 'example-token', language: 'en' }] }], has_more: false }
const response = (status, data) => ({ status, ok: status < 400, json: async () => data })
afterEach(async () => { if (mounted) await act(async () => mounted.unmount()); mounted = null; Object.assign(global, original) })
function setup(handler) {
 global.window = { location: { replace() { throw new Error('Unexpected redirect') } } }
 global.sessionStorage = { removeItem() {} }
 global.fetch = async (url, opts) => url === '/api/auth/session' ? response(200, { staff: { id: 'staff', name: '강사', role: 'instructor', instructor_id: 'teacher' } }) : handler(url, opts)
}
async function mount() { await act(async () => { mounted = create(React.createElement(StaffProvider, null, React.createElement(StudentProgress, { studentId: id }))) }) }
function button(text) { return mounted.root.findAllByType('button').find(b => b.props.children === text) }
test('Personal page authenticates instructor and shows current progress and report history', async () => {
 const urls = []; setup(async url => { urls.push(url); return response(200, fixture) }); await mount()
 assert.deepEqual(urls, [`/api/admin/students/${id}/progress?offset=0`])
 assert.match(JSON.stringify(mounted.toJSON()), /수학 3-2/)
 assert.equal(mounted.root.findByProps({ href: '/report/example-token' }).props.target, '_blank')
 assert.equal(button('다음 기록 페이지').props.disabled, true)
})
test('Lost save response retries the exact same record without clearing the form or duplicating', async () => {
 const posts = []; let fail = true
 setup(async (_url, opts) => {
  if (opts.method === 'POST') { posts.push(JSON.parse(opts.body)); if (fail) { fail = false; throw new Error('lost after save') } return response(201, { id: posts[0].entry_id }) }
  return response(200, fixture)
 })
 await mount(); await act(async () => button('수업 기록 추가').props.onClick())
 await act(async () => { const f = mounted.root.findByType('form'); await Promise.all([f.props.onSubmit({ preventDefault() {} }), f.props.onSubmit({ preventDefault() {} })]) })
 assert.equal(posts.length, 1)
 assert.equal(mounted.root.findByType('fieldset').props.disabled, true)
 assert.ok(button('저장 결과 확인'))
 await act(async () => mounted.root.findByType('form').props.onSubmit({ preventDefault() {} }))
 assert.equal(posts.length, 2); assert.deepEqual(posts[0], posts[1])
 assert.equal(mounted.root.findAllByType('form').length, 0)
 assert.match(JSON.stringify(mounted.toJSON()), /저장했습니다/)
})
test('Failed history load retains visible records and gives a retry message', async () => {
 let fail = false; setup(async () => fail ? response(500, { error: '다시 시도해 주세요.' }) : response(200, fixture)); await mount(); fail = true
 await act(async () => button('새로고침').props.onClick())
 assert.match(JSON.stringify(mounted.toJSON()), /수학 3-2/)
 assert.match(JSON.stringify(mounted.toJSON()), /다시 시도/)
})
test('Inactive student cannot add progress', async () => {
 setup(async () => response(200, { ...fixture, student: { ...fixture.student, active: false } })); await mount()
 assert.equal(button('수업 기록 추가').props.disabled, true)
})
test('Progress validation rejects nonexistent and future dates, blank books and excessive text', () => {
 assert.equal(progressInput(form).book, '수학 3-2')
 for (const patch of [{ lesson_date: '2026-02-30' }, { lesson_date: '2099-01-01' }, { book: ' ' }, { teacher_note: 'a'.repeat(2001) }]) assert.throws(() => progressInput({ ...form, ...patch }))
})
