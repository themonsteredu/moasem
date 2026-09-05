require('./register.cjs')
const { test, afterEach } = require('node:test')
const assert = require('node:assert/strict')
const React = require('react')
const { create, act } = require('react-test-renderer')
const { ReportNotifications } = require('../app/components/report-notifications.tsx')
const originalFetch = global.fetch
let mounted
afterEach(async () => { if (mounted) await act(async () => mounted.unmount()); mounted = null; global.fetch = originalFetch })
const item = { token: 'sample', lesson_date: '2026-09-05', expires_at: '2099-01-01', recipient: '010-****-0000', attempts: 0, notification: null }
function response(data) { return { ok: true, status: 200, json: async () => data } }
test('Unconfigured channel displays history but cannot send messages', async () => {
  const requests = [], ready = []
  global.fetch = async (url, options) => { requests.push(options); return response({ configured: false, items: [item] }) }
  await act(async () => { mounted = create(React.createElement(ReportNotifications, { studentId: 's1', revision: 0, onReady: value => ready.push(value), onBusy: () => {}, disabled: false })) })
  assert.equal(mounted.root.findAllByType('button').filter(button => button.children.includes('알림톡 보내기')).length, 0)
  assert.ok(ready.every(value => value === false))
  assert.equal(requests.length, 1)
  assert.notEqual(requests[0].method, 'POST')
})
test('Sending once shows acceptance; delivery check shows arrival, and no repeat-send button remains', async () => {
  const requests = [], busy = []
  global.fetch = async (url, options) => {
    if (options.method !== 'POST') return response({ configured: true, items: [item] })
    const action = JSON.parse(options.body).action; requests.push(action)
    return response({ notification: { id: 'attempt', status: action === 'send' ? 'accepted' : 'delivered' } })
  }
  await act(async () => { mounted = create(React.createElement(ReportNotifications, { studentId: 's1', revision: 0, onReady: () => {}, onBusy: value => busy.push(value), disabled: false })) })
  await act(async () => mounted.root.findAllByType('button').find(button => button.children.includes('알림톡 보내기')).props.onClick())
  assert.match(JSON.stringify(mounted.toJSON()), /접수 완료 · 도착 확인 전/)
  assert.equal(mounted.root.findAllByType('button').filter(button => button.children.includes('알림톡 보내기')).length, 0)
  await act(async () => mounted.root.findAllByType('button').find(button => button.children.includes('도착 여부 확인')).props.onClick())
  assert.match(JSON.stringify(mounted.toJSON()), /도착 확인/)
  assert.deepEqual(requests, ['send', 'refresh'])
  assert.deepEqual(busy, [true, false, true, false])
})
