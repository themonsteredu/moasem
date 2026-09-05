require('./register.cjs')
const { test, beforeEach, afterEach } = require('node:test')
const assert = require('node:assert/strict')
const { createHmac } = require('node:crypto')
const { alimtalkConfig, sendReportAlimtalk, checkReportAlimtalk, maskPhone } = require('../lib/alimtalk.ts')
const env = { MOASEM_ALIMTALK_ENABLED: 'true', MOASEM_PUBLIC_URL: 'https://reports.example.test', SOLAPI_API_KEY: 'test-key', SOLAPI_API_SECRET: 'test-secret', SOLAPI_PF_ID: 'PFtest', SOLAPI_REPORT_TEMPLATE_ID: 'KAtest' }
const originalEnv = Object.fromEntries(Object.keys(env).map(key => [key, process.env[key]]))
const originalFetch = global.fetch
let calls
function mockResponse(data, status = 200) { return new Response(JSON.stringify(data), { status, headers: { 'content-type': 'application/json' } }) }
beforeEach(() => { Object.assign(process.env, env); calls = []; global.fetch = async (...args) => { calls.push(args); throw new Error('Unmocked network request forbidden') } })
afterEach(() => { global.fetch = originalFetch; for (const [key, value] of Object.entries(originalEnv)) if (value === undefined) delete process.env[key]; else process.env[key] = value })
test('Sending stays disabled until server credentials, approved template and HTTPS origin are configured', () => {
  assert.ok(alimtalkConfig())
  process.env.MOASEM_ALIMTALK_ENABLED = 'false'; assert.equal(alimtalkConfig(), null)
  process.env.MOASEM_ALIMTALK_ENABLED = 'true'
  for (const url of ['http://reports.example.test', 'https://user:secret@example.test', 'https://example.test/?token=secret', 'https://example.test/report']) {
    process.env.MOASEM_PUBLIC_URL = url; assert.equal(alimtalkConfig(), null)
  }
  process.env.MOASEM_PUBLIC_URL = env.MOASEM_PUBLIC_URL
  delete process.env.SOLAPI_REPORT_TEMPLATE_ID; assert.equal(alimtalkConfig(), null)
  assert.equal(calls.length, 0)
})
test('MOAKIT template receives only the report link, correct HMAC and no SMS fallback', async () => {
  global.fetch = async (url, options) => {
    calls.push({ url, options })
    const match = options.headers.Authorization.match(/^HMAC-SHA256 apiKey=test-key, date=(.+), salt=([0-9a-f]{32}), signature=([0-9a-f]{64})$/)
    assert.ok(match)
    assert.equal(match[3], createHmac('sha256', 'test-secret').update(match[1] + match[2]).digest('hex'))
    return mockResponse({ failedMessageList: [], groupInfo: { groupId: 'G1' }, messageList: [{ messageId: 'M1', statusCode: '2000' }] })
  }
  const result = await sendReportAlimtalk(alimtalkConfig(), '01000000000', 'report-token', 'attempt-id')
  const body = JSON.parse(calls[0].options.body)
  assert.equal(calls[0].url, 'https://api.solapi.com/messages/v4/send-many/detail')
  assert.equal(calls[0].options.redirect, 'error')
  assert.deepEqual(body.messages[0].kakaoOptions, { pfId: 'PFtest', templateId: 'KAtest', disableSms: true, variables: { '#{리포트링크}': 'https://reports.example.test/report/report-token' } })
  assert.equal(body.messages[0].text, undefined)
  assert.equal(body.messages[0].type, 'ATA')
  assert.equal(body.messages[0].from, undefined)
  assert.equal(body.messages[0].customFields.moasemAttempt, 'attempt-id')
  assert.equal(body.showMessageList, true)
  assert.equal(body.strict, true)
  assert.equal(result.status, 'accepted')
  assert.equal(result.provider_message_id, 'M1')
})
test('A failedMessageList reply is a confirmed rejection, even with HTTP 200', async () => {
  global.fetch = async () => mockResponse({ failedMessageList: [{ to: '01000000000', statusCode: '1033', statusMessage: 'sensitive provider details' }] })
  const result = await sendReportAlimtalk(alimtalkConfig(), '01000000000', 'token', 'attempt')
  assert.equal(result.status, 'failed')
  assert.equal(result.provider_status_code, '1033')
  assert.doesNotMatch(JSON.stringify(result), /sensitive provider details/)
})
test('Timeout, server error and incomplete replies remain uncertain and are never retried by the client', async () => {
  for (const response of [null, mockResponse({}, 503), mockResponse({}), mockResponse({ messageList: [{ messageId: 'M1' }] })]) {
    let count = 0
    global.fetch = async () => { count++; if (!response) throw new Error('Timeout'); return response }
    assert.equal((await sendReportAlimtalk(alimtalkConfig(), '01000000000', 'token', 'attempt')).status, 'unknown')
    assert.equal(count, 1)
  }
})
test('Delivery lookup checks one saved message ID and distinguishes accepted, delivered and failed', async () => {
  for (const [statusCode, status, expected] of [['2000', 'PENDING', 'accepted'], ['3000', 'SENDING', 'accepted'], ['4000', 'COMPLETE', 'delivered'], ['5000', 'COMPLETE', 'failed']]) {
    global.fetch = async (url, options) => {
      const query = new URL(url).searchParams
      assert.equal(query.get('criteria'), 'messageId'); assert.equal(query.get('value'), 'M1'); assert.equal(options.method, 'GET')
      return mockResponse({ messageList: { M1: { messageId: 'M1', type: 'ATA', status, statusCode } } })
    }
    assert.equal((await checkReportAlimtalk(alimtalkConfig(), 'M1')).status, expected)
  }
})
test('Unrelated messages and lookup errors cannot mark the report as delivered', async () => {
  global.fetch = async () => mockResponse({ messageList: { M2: { messageId: 'M2', type: 'ATA', statusCode: '4000' } } })
  assert.equal(await checkReportAlimtalk(alimtalkConfig(), 'M1'), null)
  global.fetch = async () => mockResponse({}, 503)
  assert.equal(await checkReportAlimtalk(alimtalkConfig(), 'M1'), null)
  assert.equal(await checkReportAlimtalk(alimtalkConfig(), '../../unexpected'), null)
})
test('Recipient preview masks the middle digits', () => {
  assert.equal(maskPhone('010-1234-5678'), '010-****-5678')
  assert.equal(maskPhone(null), '연락처 확인 필요')
})
