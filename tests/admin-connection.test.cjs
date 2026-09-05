const { test, afterEach } = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const ts = require('typescript')
const React = require('react')
const { create, act } = require('react-test-renderer')

// Render the real pages and hooks; only the network and browser storage are fake.
for (const extension of ['.ts', '.tsx']) {
  require.extensions[extension] = (module, filename) => {
    const compiled = ts.transpileModule(fs.readFileSync(filename, 'utf8'), {
      compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX, target: ts.ScriptTarget.ES2020 },
      fileName: filename,
    })
    module._compile(compiled.outputText, filename)
  }
}

const pages = [
  { name: '기관·학생', Component: require('../app/page.tsx').default, urls: ['/api/admin/institutions', '/api/admin/programs', '/api/admin/students'] },
  { name: '대면 출석', Component: require('../app/attendance/page.tsx').default, urls: ['/api/admin/programs'] },
  { name: '보호자 리포트', Component: require('../app/reports/page.tsx').default, urls: ['/api/admin/students'] },
  { name: '오답·영상', Component: require('../app/wrong-types/page.tsx').default, urls: ['/api/admin/wrong-types', '/api/admin/videos'] },
]
const storageKey = 'moasem-admin-key'
const fakeKey = 'component-test-key-only'
const originalFetch = global.fetch
const originalStorage = global.sessionStorage
const originalWindow = global.window
let mounted

afterEach(async () => {
  if (mounted) await act(async () => mounted.unmount())
  mounted = null
  global.fetch = originalFetch
  global.sessionStorage = originalStorage
  global.window = originalWindow
})

function environment(savedKey, status = 200) {
  const data = new Map(savedKey ? [[storageKey, savedKey]] : [])
  const calls = []
  let reloads = 0
  global.sessionStorage = {
    getItem: key => data.get(key) ?? null,
    setItem: (key, value) => data.set(key, value),
    removeItem: key => data.delete(key),
  }
  global.window = { location: { reload: () => { reloads += 1 } } }
  global.fetch = async (url, options) => {
    calls.push({ url, options })
    return { status, ok: status === 200, json: async () => ({ items: [], error: '요청 실패' }) }
  }
  return { data, calls, reloads: () => reloads }
}

async function mount(Component) {
  await act(async () => { mounted = create(React.createElement(Component)) })
}
function accessForm() {
  return mounted.root.findByProps({ className: 'access-bar' })
}
async function connect() {
  await act(async () => accessForm().props.onSubmit({ preventDefault() {} }))
}
async function typeKey() {
  await act(async () => mounted.root.findByProps({ id: 'admin-access-key' }).props.onChange({ target: { value: fakeKey } }))
}

for (const page of pages) {
  test(`${page.name}: first connection, menu remount and disconnect`, async () => {
    const env = environment()
    await mount(page.Component)
    assert.equal(env.calls.length, 0, 'No unauthenticated requests on initial visit')
    await typeKey()
    assert.equal(env.calls.length, 0, 'Typing must not send a request on every keystroke')
    assert.equal(env.data.has(storageKey), false)
    await connect()
    assert.deepEqual(env.calls.map(call => call.url).sort(), [...page.urls].sort())
    assert.equal(env.data.get(storageKey), fakeKey)
    assert.equal(mounted.root.findAllByProps({ id: 'admin-access-key' }).length, 0)

    await act(async () => mounted.unmount())
    env.calls.length = 0
    await mount(page.Component)
    assert.deepEqual(env.calls.map(call => call.url).sort(), [...page.urls].sort(), 'Saved connection automatically fetches this page')
    for (const call of env.calls) {
      assert.equal(call.options.headers['x-moasem-admin-key'], fakeKey, 'Restored request uses the saved key, not stale empty state')
      assert.equal(call.options.cache, 'no-store')
    }
    const disconnect = accessForm().findAllByType('button').find(button => button.children.includes('연결 해제'))
    await act(async () => disconnect.props.onClick())
    assert.equal(env.data.has(storageKey), false)
    assert.equal(env.reloads(), 1, 'Disconnect clears the page as well as the key')
    await act(async () => mounted.unmount())
    env.calls.length = 0
    await mount(page.Component)
    assert.equal(env.calls.length, 0, 'A disconnected page does not reconnect itself')
  })

  test(`${page.name}: rejected saved key requires reconnection`, async () => {
    const env = environment(fakeKey, 401)
    await mount(page.Component)
    assert.equal(env.data.has(storageKey), false)
    assert.equal(mounted.root.findAllByProps({ id: 'admin-access-key' }).length, 1)
    assert.match(JSON.stringify(mounted.toJSON()), /다시 연결해 주세요/)
  })

  test(`${page.name}: a mistyped key is never remembered`, async () => {
    const env = environment(undefined, 401)
    await mount(page.Component)
    await typeKey()
    await connect()
    assert.equal(env.data.has(storageKey), false)
    assert.equal(mounted.root.findAllByProps({ id: 'admin-access-key' }).length, 1)
  })
}

test('One connection restores across all four menus', async () => {
  const env = environment()
  await mount(pages[0].Component)
  await typeKey()
  await connect()
  for (const page of pages.slice(1)) {
    await act(async () => mounted.unmount())
    env.calls.length = 0
    await mount(page.Component)
    assert.deepEqual(env.calls.map(call => call.url).sort(), [...page.urls].sort())
    assert.equal(mounted.root.findAllByProps({ id: 'admin-access-key' }).length, 0)
  }
})

test('A transient server error keeps the valid key for retry', async () => {
  const env = environment(fakeKey, 503)
  await mount(pages[0].Component)
  assert.equal(env.data.get(storageKey), fakeKey)
  assert.match(JSON.stringify(mounted.toJSON()), /목록을 불러오지 못했습니다/)
})

test('Blocked storage still allows the current page to connect', async () => {
  environment()
  global.sessionStorage = {
    getItem() { throw new Error('blocked') },
    setItem() { throw new Error('blocked') },
    removeItem() { throw new Error('blocked') },
  }
  await mount(pages[0].Component)
  await typeKey()
  await connect()
  assert.equal(mounted.root.findAllByProps({ id: 'admin-access-key' }).length, 0)
  assert.match(JSON.stringify(mounted.toJSON()), /연결을 기억하지 못했습니다/)
})
