require('./register.cjs')
const { test, afterEach } = require('node:test'), assert = require('node:assert/strict'), React = require('react')
const { create, act } = require('react-test-renderer')
const { WeeklyProgress } = require('../app/components/weekly-progress.tsx')
const { weekWindow, summarizeWeeks } = require('../lib/weekly-progress.ts')
const originalFetch = global.fetch
let mounted
const response = (status, data) => ({ status, ok: status >= 200 && status < 300, json: async () => data })
const program = { id: 'p', name: '수학', starts_on: '2026-09-30', ends_on: '2026-12-22', week_count: 10 }
const student = id => ({ id, name: `학생 ${id}`, grade: 3 })
function list(ids = ['a'], start = 1, extra = {}) {
  const window = weekWindow(program, '2026-10-01', start)
  return { program, today: '2026-10-01', ...window, rows: summarizeWeeks(ids.map(student), window.weeks, [], [], [], '2026-10-01'), total_students: ids.length, page: 1, page_size: 25, ...extra }
}
const detail = (id = 'a', number = 1) => ({ student: student(id), week: weekWindow(program, '2026-10-01', number).weeks[0], progress: [{ id: 'entry', lesson_date: '2026-10-01', book: `교재 ${id}`, pages: '10', learned: '분수 비교', teacher_note: '자세한 기록' }], homework: [], attendance: [] })
async function setup(handler, programId = 'p') {
  global.fetch = (url, options) => handler(url, options)
  await act(async () => { mounted = create(React.createElement(WeeklyProgress, { programId, refresh: 0, key: programId })) })
}
const button = label => mounted.root.findAllByType('button').find(b => b.children.includes(label))
const cell = (id = 'a', week = 1) => mounted.root.findByProps({ 'aria-label': `학생 ${id} ${week}주차 기록 보기` })
const click = async b => act(async () => b.props.onClick())
const text = () => JSON.stringify(mounted.toJSON())
afterEach(async () => { if (mounted) await act(async () => mounted.unmount()); mounted = null; global.fetch = originalFetch })

test('A missing program makes no request; the selected program shows accessible cells and explains real counts', async () => {
  await setup(() => { throw Error('must not fetch') }, '')
  assert.match(text(), /프로그램을 선택해 주세요/)
  await act(async () => mounted.unmount())
  const requests = []
  await setup((url, opts) => { requests.push({ url, opts }); return response(200, list()) })
  assert.equal(requests.length, 1); assert.equal(requests[0].opts.cache, 'no-store')
  assert.equal(cell().props.type, 'button'); assert.equal(cell().props['aria-pressed'], false)
  assert.match(text(), /기록 없음/); assert.match(text(), /저장된 출석 기록 수/); assert.match(text(), /현재 제출 상태/)
  assert.match(text(), /등록 주차는/); assert.equal(mounted.root.findAllByProps({ className: 'weekly-detail' }).length, 0)
})
test('Details load on demand and clear on refresh failure, then recover without old contents', async () => {
  let requests = 0
  await setup(url => {
    if (url.includes('/weekly-progress/a?')) { requests++; return response(requests === 2 ? 500 : 200, requests === 2 ? { error: '다시 확인해 주세요' } : detail()) }
    return response(200, list())
  })
  assert.equal(requests, 0); await click(cell()); assert.equal(requests, 1)
  assert.match(text(), /교재 a/)
  assert.ok(mounted.root.findAllByType('a').some(a => a.props.href === '/students/a#student-homework'))
  await click(button('상세 새로고침')); assert.match(text(), /다시 확인해 주세요/); assert.doesNotMatch(text(), /교재 a/)
  await click(button('상세 새로고침')); assert.match(text(), /교재 a/)
  await click(button('상세 닫기')); assert.doesNotMatch(text(), /교재 a/)
})
test('Late detail cannot overwrite another student or reopen a closed panel', async () => {
  let resolveFirst
  await setup(url => url.includes('/weekly-progress/a?') ? new Promise(resolve => { resolveFirst = resolve }) : response(200, url.includes('/weekly-progress/b?') ? detail('b') : list(['a', 'b'])))
  await click(cell('a')); await click(cell('b'))
  await act(async () => resolveFirst(response(200, detail('a'))))
  assert.match(text(), /교재 b/); assert.doesNotMatch(text(), /교재 a/)
  await click(cell('a')); await click(button('상세 닫기'))
  await act(async () => resolveFirst(response(200, detail('a'))))
  assert.equal(mounted.root.findAllByProps({ className: 'weekly-detail' }).length, 0)
})
test('Week and student page changes discard selected details and keep navigation bounded', async () => {
  const requests = []
  let resolveDetail
  await setup(url => {
    requests.push(url)
    if (url.includes('/weekly-progress/a?')) return new Promise(resolve => { resolveDetail = resolve })
    const p = new URL(url, 'https://test.example').searchParams
    return response(200, list(['a'], Number(p.get('week_start') || 1), { total_students: 26 }))
  })
  await click(cell()); await click(button('다음 4주'))
  await act(async () => resolveDetail(response(200, detail())))
  assert.match(requests.at(-1), /week_start=5/); assert.doesNotMatch(text(), /교재 a/)
  assert.ok(cell('a', 5)); await click(button('다음 학생'))
  assert.match(requests.at(-1), /page=2&week_start=5/); assert.equal(button('다음 학생').props.disabled, true)
  await click(button('이번 주로')); assert.doesNotMatch(requests.at(-1), /week_start=/)
})
test('Changing programs discards a late overview and a late detail from the old program', async () => {
  let resolveList
  await setup(url => url.includes('program_id=p') ? new Promise(resolve => { resolveList = resolve }) : response(200, list(['b'])))
  await act(async () => mounted.update(React.createElement(WeeklyProgress, { key: 'q', programId: 'q', refresh: 0 })))
  await act(async () => resolveList(response(200, list(['a']))))
  assert.match(text(), /학생 b/); assert.doesNotMatch(text(), /학생 a/)
  let resolveDetail
  global.fetch = url => url.includes('/weekly-progress/b?') ? new Promise(resolve => { resolveDetail = resolve }) : response(200, list(['c']))
  await click(cell('b'))
  await act(async () => mounted.update(React.createElement(WeeklyProgress, { key: 'r', programId: 'r', refresh: 0 })))
  await act(async () => resolveDetail(response(200, detail('b'))))
  assert.match(text(), /학생 c/); assert.doesNotMatch(text(), /학생 b|교재 b/)
})
test('Connection errors differ from an empty roster and the retry restores a usable table', async () => {
  let fail = true
  await setup(() => response(fail ? 500 : 200, fail ? { error: '연결 오류' } : list([])))
  assert.match(text(), /연결 오류/); assert.doesNotMatch(text(), /표시할 학생이 없습니다/)
  fail = false; await click(button('다시 시도'))
  assert.match(text(), /표시할 학생이 없습니다/); assert.doesNotMatch(text(), /연결 오류/)
})
