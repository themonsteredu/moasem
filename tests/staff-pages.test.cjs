require('./register.cjs')
const { test, afterEach } = require('node:test')
const assert = require('node:assert/strict')
const React = require('react')
const { create, act } = require('react-test-renderer')
let pathname = '/'
require.cache[require.resolve('next/navigation')] = { id: require.resolve('next/navigation'), filename: require.resolve('next/navigation'), loaded: true, exports: { usePathname: () => pathname } }
const { StaffProvider } = require('../app/components/staff-session.tsx')
const { apiFetch } = require('../lib/staff-client.ts')
const admin = { id: 'admin', name: '운영자', email: 'admin@example.test', role: 'admin', instructor_id: null }
const instructor = { ...admin, id: 'instructor', role: 'instructor', instructor_id: 'i1' }
const pages = [
  { name: '기관·학생', path: '/', Component: require('../app/page.tsx').default, urls: ['/api/admin/institutions', '/api/admin/programs', '/api/admin/students', '/api/admin/instructors'] },
  { name: '대면 출석', path: '/attendance', Component: require('../app/attendance/page.tsx').default, urls: ['/api/admin/programs'] },
  { name: '보호자 리포트', path: '/reports', Component: require('../app/reports/page.tsx').default, urls: ['/api/admin/students', '/api/admin/report-options'] },
  { name: '오답·영상', path: '/wrong-types', Component: require('../app/wrong-types/page.tsx').default, urls: ['/api/admin/wrong-types', '/api/admin/videos'] },
  { name: '강사 관리', path: '/instructors', Component: require('../app/instructors/page.tsx').default, urls: ['/api/admin/instructors'] },
  { name: '내 학생', path: '/my-students', Component: require('../app/my-students/page.tsx').default, urls: ['/api/admin/programs', '/api/admin/students'] },
]
const originals = { fetch: global.fetch, window: global.window, sessionStorage: global.sessionStorage }
let mounted
function response(status, data) { return { status, ok: status >= 200 && status < 300, json: async () => data } }
function environment(staff = admin, status = 200) {
  const calls = [], redirects = [], removed = []
  global.window = { location: { replace: url => redirects.push(url) }, matchMedia: () => ({ matches: false }) }
  global.sessionStorage = { removeItem: key => removed.push(key) }
  global.fetch = async (url, options) => {
    calls.push({ url, options })
    if (url === '/api/auth/session') return response(status, { staff })
    return response(200, { items: [], programs: [], instructors: [], ok: true })
  }
  return { calls, redirects, removed }
}
async function mount(page) {
  pathname = page.path
  await act(async () => { mounted = create(React.createElement(StaffProvider, null, React.createElement(page.Component))) })
}
afterEach(async () => {
  if (mounted) await act(async () => mounted.unmount())
  mounted = null
  Object.assign(global, originals)
})
for (const page of pages) test(`${page.name}: login-confirmed list loads automatically and logout clears the page`, async () => {
  const env = environment(page.path === '/my-students' ? instructor : admin)
  await mount(page)
  assert.deepEqual(env.calls.map(x => x.url).sort(), ['/api/auth/session', ...page.urls].sort())
  for (const call of env.calls) {
    assert.equal(call.options.cache, 'no-store')
    assert.equal(call.options.headers?.['x-moasem-admin-key'], undefined)
  }
  assert.deepEqual(env.removed, ['moasem-admin-key'])
  assert.equal(mounted.root.findAllByProps({ id: 'admin-access-key' }).length, 0)
  const logout = mounted.root.findAllByType('button').find(button => button.children.includes('로그아웃'))
  await act(async () => logout.props.onClick())
  assert.deepEqual(env.redirects, ['/login'])
})
for (const status of [401, 403]) test(`Session ${status}: no list is fetched or shown`, async () => {
  const env = environment(admin, status)
  await mount(pages[0])
  assert.deepEqual(env.calls.map(x => x.url), ['/api/auth/session'])
  assert.deepEqual(env.redirects, ['/login'])
  assert.equal(mounted.root.findAllByProps({ className: 'management-grid' }).length, 0)
})
test('Instructor opening administrator page is redirected without fetching institution data', async () => {
  const env = environment(instructor)
  await mount(pages[0])
  assert.deepEqual(env.calls.map(x => x.url), ['/api/auth/session'])
  assert.deepEqual(env.redirects, ['/my-students'])
})
test('Instructor menu contains only own students, attendance and reports', async () => {
  environment(instructor)
  await mount(pages[5])
  const nav = mounted.root.findByProps({ 'aria-label': '학습관리 메뉴' })
  assert.deepEqual(nav.findAllByType('a').map(x => x.props.href), ['/my-students', '/attendance', '/reports'])
})
test('Temporary session error offers retry without redirect or data request', async () => {
  const env = environment(admin, 503)
  await mount(pages[0])
  assert.deepEqual(env.redirects, [])
  assert.deepEqual(env.calls.map(x => x.url), ['/api/auth/session'])
  assert.match(JSON.stringify(mounted.toJSON()), /다시 시도/)
})
test('Blocked storage does not prevent login or list loading', async () => {
  const env = environment()
  global.sessionStorage.removeItem = () => { throw new Error('blocked') }
  await mount(pages[0])
  assert.equal(env.calls.length, 5)
})
test('Public guardian and institution pages never request staff login', async () => {
  for (const path of ['/report/example-token', '/institution/example-token']) {
    const env = environment(null, 401)
    await mount({ path, Component: () => React.createElement('p', null, 'public report') })
    assert.deepEqual(env.calls, [])
    assert.deepEqual(env.redirects, [])
    await act(async () => mounted.unmount()); mounted = null
  }
})
test('Concurrent expired requests share one session refresh, then retry with cookies', async () => {
  environment()
  const counts = new Map()
  global.fetch = async (url, options) => {
    counts.set(url, (counts.get(url) || 0) + 1)
    if (url === '/api/auth/session') { await new Promise(resolve => setImmediate(resolve)); return response(200, {}) }
    assert.equal(options.credentials, 'same-origin')
    return response(counts.get(url) === 1 ? 401 : 200, {})
  }
  const results = await Promise.all([apiFetch('/api/admin/programs'), apiFetch('/api/admin/students')])
  assert.deepEqual(results.map(x => x.status), [200, 200])
  assert.equal(counts.get('/api/auth/session'), 1)
})

test('Switching students clears selected wrong types and restores the new guardian language', async () => {
  environment(instructor)
  const fallback = global.fetch
  const options = [{ id: 'type-one', name: '분수', code: 'E3-01', grade: 3, unit: '분수', video: null }]
  global.fetch = async (url, init) => {
    if (url === '/api/admin/students') return response(200, { items: [{ id: 'a', name: '학생 A', guardian: { language: 'vi' } }, { id: 'b', name: '학생 B', guardian: { language: 'ko' } }] })
    if (url === '/api/admin/report-options') return response(200, { items: options })
    return fallback(url, init)
  }
  await mount(pages[2])
  await act(async () => mounted.root.findAllByType('select').find(select => select.props.required).props.onChange({ target: { value: 'a' } }))
  await act(async () => mounted.root.findByProps({ className: 'report-type-picker' }).findByProps({ type: 'checkbox' }).props.onChange({ target: { checked: true } }))
  assert.equal(mounted.root.findByProps({ className: 'report-type-picker' }).findByProps({ type: 'checkbox' }).props.checked, true)
  assert.ok(mounted.root.findAllByType('select').some(select => select.props.value === 'vi'))
  await act(async () => mounted.root.findAllByType('select').find(select => select.props.required).props.onChange({ target: { value: 'b' } }))
  assert.equal(mounted.root.findByProps({ className: 'report-type-picker' }).findByProps({ type: 'checkbox' }).props.checked, false)
  assert.ok(mounted.root.findAllByType('select').some(select => select.props.value === 'ko'))
  assert.equal(mounted.root.findAllByProps({ className: 'report-link' }).length, 0)
})
