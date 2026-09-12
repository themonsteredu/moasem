require('./register.cjs')
const { test, afterEach } = require('node:test'), assert = require('node:assert/strict'), React = require('react')
const { create, act } = require('react-test-renderer')
const { HomeworkReview } = require('../app/components/homework-review.tsx')
const originalFetch = global.fetch
let mounted
const response = (status, data) => ({ status, ok: status >= 200 && status < 300, json: async () => data })
const item = (id = 'a', status = 'submitted') => ({ id, title: `과제 ${id}`, details: '익힘책 10쪽', due_on: '2026-09-06', assigned_on: '2026-09-01', status, photo_count: 1, student: { id: `student-${id}`, name: `학생 ${id}`, grade: 3 } })
const list = (items = [item()], extra = {}) => ({ items, counts: { submitted: 1, assigned: 2, overdue: 1, checked: 0, all: 3 }, total: items.length, page: 1, page_size: 30, today: '2026-09-06', ...extra })
const photo = id => ({ item: item(id), photos: [{ id: `photo-${id}`, url: `https://photos.example/${id}.jpg?temporary` }], expires_in: 300 })
async function setup(handler, programId = 'p') {
  global.fetch = (url, options) => handler(url, options)
  await act(async () => { mounted = create(React.createElement(HomeworkReview, { programId, refresh: 0, key: programId })) })
}
const button = label => mounted.root.findAllByType('button').find(b => b.children.some(c => c === label))
const filter = label => mounted.root.findAllByType('button').find(b => b.findAllByType('span').some(s => s.children[0] === label))
const click = async b => act(async () => b.props.onClick())
const text = () => JSON.stringify(mounted.toJSON())
afterEach(async () => { if (mounted) await act(async () => mounted.unmount()); mounted = null; global.fetch = originalFetch })

test('Review defaults to submitted, explains counts, links student records and loads no photos eagerly', async () => {
  const requests = []
  await setup(async (url, opts) => { requests.push({ url, opts }); return response(200, list()) })
  assert.match(requests[0].url, /filter=submitted&page=1/)
  assert.equal(requests.length, 1); assert.equal(requests[0].opts.cache, 'no-store')
  assert.equal(filter('확인 대기').props['aria-pressed'], true)
  assert.match(text(), /자동채점 결과가 아닙니다/); assert.match(text(), /과제 건수/)
  assert.ok(mounted.root.findAllByType('a').some(a => a.props.href === '/students/student-a#student-homework'))
  assert.equal(mounted.root.findAllByType('img').length, 0)
})
test('Missing program issues no request and provides a selection prompt', async () => {
  await setup(() => { throw Error('must not fetch') }, '')
  assert.match(text(), /프로그램을 선택해 주세요/)
})
test('Late previous filter result never replaces the newly selected list', async () => {
  let resolveOld
  await setup(url => url.includes('filter=submitted') ? new Promise(resolve => { resolveOld = resolve }) : response(200, list([item('b', 'assigned')])))
  await click(filter('미제출'))
  assert.match(text(), /학생 b/)
  await act(async () => { resolveOld(response(200, list([item('a')])) ) })
  assert.doesNotMatch(text(), /학생 a/)
  assert.equal(filter('미제출').props['aria-pressed'], true)
})
test('Program change unmounts the old data and pending photo response', async () => {
  let resolvePhoto
  await setup(url => url.includes('/homework-review/a?') ? new Promise(resolve => { resolvePhoto = resolve }) : response(200, list([item(url.includes('program_id=q') ? 'b' : 'a')])))
  await click(mounted.root.findByProps({ 'aria-label': '학생 a 과제 a 사진 보기' }))
  await act(async () => { mounted.update(React.createElement(HomeworkReview, { key: 'q', programId: 'q', refresh: 0 })) })
  await act(async () => { resolvePhoto(response(200, photo('a'))) })
  assert.match(text(), /학생 b/); assert.doesNotMatch(text(), /학생 a|photos.example\/a/)
})
test('Photos open on demand, refresh after error, and disappear when the filter changes', async () => {
  let photoRequests = 0
  await setup(url => {
    if (url.includes('/homework-review/a?')) { photoRequests++; return response(photoRequests === 2 ? 500 : 200, photoRequests === 2 ? { error: '사진을 다시 불러와 주세요' } : photo('a')) }
    return response(200, list())
  })
  await click(mounted.root.findByProps({ 'aria-label': '학생 a 과제 a 사진 보기' }))
  assert.equal(photoRequests, 1)
  const img = mounted.root.findByType('img')
  assert.equal(img.props.src, 'https://photos.example/a.jpg?temporary')
  assert.equal(img.props.referrerPolicy, 'no-referrer')
  assert.equal(img.props.srcSet, undefined) // No shared Next image optimizer for private URLs.
  await click(button('사진 새로고침'))
  assert.match(text(), /사진을 다시 불러와 주세요/); assert.equal(mounted.root.findAllByType('img').length, 0)
  await click(button('사진 새로고침')); assert.equal(mounted.root.findAllByType('img').length, 1)
  await click(filter('미제출')); assert.equal(mounted.root.findAllByType('img').length, 0)
  assert.equal(mounted.root.findAllByProps({ 'aria-label': '학생 a 과제 사진' }).length, 0)
})
test('A late first photo cannot replace the second student or reopen a closed panel', async () => {
  let resolveFirst
  await setup(url => {
    if (url.includes('/homework-review/a?')) return new Promise(resolve => { resolveFirst = resolve })
    if (url.includes('/homework-review/b?')) return response(200, photo('b'))
    return response(200, list([item('a'), item('b')]))
  })
  await click(mounted.root.findByProps({ 'aria-label': '학생 a 과제 a 사진 보기' }))
  await click(mounted.root.findByProps({ 'aria-label': '학생 b 과제 b 사진 보기' }))
  await act(async () => { resolveFirst(response(200, photo('a'))) })
  assert.equal(mounted.root.findByType('img').props.src, 'https://photos.example/b.jpg?temporary')
  await click(button('사진 닫기')); assert.equal(mounted.root.findAllByType('img').length, 0)
})
test('Errors remain distinct from empty results and a refresh recovers', async () => {
  let fail = true
  await setup(() => response(fail ? 500 : 200, fail ? { error: '연결을 확인해 주세요' } : list([])))
  assert.match(text(), /연결을 확인해 주세요/); assert.doesNotMatch(text(), /확인 대기 과제가 없습니다/)
  fail = false; await click(button('다시 불러오기'))
  assert.match(text(), /확인 대기 과제가 없습니다/); assert.doesNotMatch(text(), /연결을 확인해 주세요/)
})
test('Next page is bounded and switching status returns to page one', async () => {
  const requests = []
  await setup(url => { requests.push(url); return response(200, list([item()], { total: 31 })) })
  await click(button('다음')); assert.match(requests.at(-1), /page=2/)
  assert.equal(button('다음').props.disabled, true)
  await click(filter('미제출')); assert.match(requests.at(-1), /filter=assigned&page=1/)
})
