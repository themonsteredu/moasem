require('./register.cjs')
const { test, beforeEach } = require('node:test')
const assert = require('node:assert/strict')
const { createHash } = require('node:crypto')
const { NextRequest } = require('next/server')
const studentId = '11111111-1111-4111-8111-111111111111'
const programId = '22222222-2222-4222-8222-222222222222'
const documentId = '33333333-3333-4333-8333-333333333333'
const guardianId = '44444444-4444-4444-8444-444444444444'
const requestId = '55555555-5555-4555-8555-555555555555'
const token = 'a'.repeat(64)
const user = { id: 'auth-user', user_metadata: { role: 'admin' }, is_anonymous: false }
let account, tables, calls, queries, rpcError, rpcResult, dbError
class Query {
  constructor(table) { this.table = table; this.filters = []; this.one = false; queries.push(this) }
  select(columns) { this.columns = columns; return this }
  eq(key, value) { this.filters.push([key, value]); return this }
  order() { return this }
  limit() { return this }
  maybeSingle() { this.one = true; return this }
  then(resolve, reject) {
    const rows = (this.table === 'staff_accounts' ? [account] : tables[this.table] || [])
      .filter(row => row && this.filters.every(([key, value]) => row[key] === value))
      .map(row => Object.fromEntries(Object.entries(row).filter(([key]) => this.columns.split(',').includes(key) || key === 'records' && this.columns.includes('records:'))))
    return Promise.resolve({ data: dbError ? null : this.one ? rows[0] || null : rows, error: dbError }).then(resolve, reject)
  }
}
const db = {
  from: table => new Query(table),
  rpc: async (name, args) => { calls.push({ name, args }); return { data: rpcResult, error: rpcError } },
  auth: { getUser: async access => ({ data: { user: access === 'valid' ? user : null }, error: null }) },
}
const dbPath = require.resolve('../lib/supabase-admin.ts')
require.cache[dbPath] = { id: dbPath, filename: dbPath, loaded: true, exports: { getSupabaseAdmin: () => db } }
const consent = require('../lib/guardian-consent.ts')
const documents = require('../app/api/admin/consent-documents/route.ts')
const requests = require('../app/api/admin/guardian-consents/route.ts')
const publicConsent = require('../app/api/consent/[token]/route.ts')
const input = { label: '검토용 문구', translations: { ko: { title: '시험 동의서', body: '실제 동의서가 아닌 시험 문구입니다.' }, vi: { title: 'Test', body: 'Test only.' } } }
const submission = { accepted: true, is_legal_representative: true, signer_name: '시험 보호자', language: 'vi', document_id: documentId }
function req(path = '/', { method = 'GET', body, rawBody, auth = 'valid', origin = 'https://moasem.example' } = {}) {
  return new NextRequest(`https://moasem.example${path}`, { method, headers: { origin, ...(auth ? { cookie: `moasem-access=${auth}` } : {}) }, body: rawBody ?? (body === undefined ? undefined : JSON.stringify(body)) })
}
beforeEach(() => {
  account = { id: 'staff', auth_user_id: user.id, role: 'instructor', instructor_id: 'teacher', active: true, name: '강사', email: 'test@example.invalid' }
  calls = []; queries = []; rpcError = null; dbError = null; rpcResult = { id: requestId, status: 'pending' }
  tables = {
    programs: [{ id: programId, instructor_id: 'teacher' }],
    students: [{ id: studentId, program_id: programId, guardian_id: guardianId, active: true }],
    guardians: [{ id: guardianId, phone: '01000000000' }],
    consent_documents: [], guardian_consent_requests: [],
  }
})
test('Consent documents require Korean copy, supported languages and nonempty operator text', () => {
  assert.deepEqual(consent.consentDocumentInput(input), input)
  for (const value of [null, [], { ...input, translations: {} }, { ...input, translations: { ...input.translations, en: { title: 'x', body: 'x' } } }, { ...input, translations: { ko: { title: 'x', body: ' ' } } }]) {
    assert.throws(() => consent.consentDocumentInput(value), error => error.status === 400)
  }
})
test('A 256-bit random link is hashed and independent links do not repeat', () => {
  const first = consent.newConsentToken(), second = consent.newConsentToken()
  assert.match(first.token, /^[a-f0-9]{64}$/)
  assert.notEqual(first.token, second.token)
  assert.notEqual(first.token, first.hash)
  assert.equal(first.hash, createHash('sha256').update(first.token).digest('hex'))
  assert.throws(() => consent.consentTokenHash('report-token'), error => error.status === 404)
})
test('Submission requires explicit affirmative choices and strips caller-supplied facts', () => {
  assert.deepEqual(consent.consentSubmission({ ...submission, consented_at: '1999-01-01', student_id: 'another', verification_method: 'phone_verified' }), submission)
  for (const patch of [{ accepted: false }, { accepted: 'true' }, { is_legal_representative: false }, { signer_name: '' }, { language: 'en' }, { document_id: 'bad' }]) {
    assert.throws(() => consent.consentSubmission({ ...submission, ...patch }), error => error.status === 400)
  }
})
test('Publishing needs a verified administrator and same-origin request', async () => {
  assert.equal((await documents.POST(req('/', { method: 'POST', body: input, auth: null }))).status, 401)
  assert.equal((await documents.POST(req('/', { method: 'POST', body: input }))).status, 403)
  account.role = 'admin'; account.instructor_id = null
  assert.equal((await documents.POST(req('/', { method: 'POST', body: input, origin: 'https://another.example' }))).status, 403)
  assert.equal(calls.length, 0)
  assert.equal((await documents.POST(req('/', { method: 'POST', body: { ...input, staff_id: 'spoofed' } }))).status, 201)
  assert.equal(calls[0].args.p_staff_id, account.id)
})
test('No session and inactive staff cannot read documents or consent history', async () => {
  assert.equal((await documents.GET(req('/', { auth: null }))).status, 401)
  account.active = false
  assert.equal((await requests.GET(req(`/?student_id=${studentId}`))).status, 403)
  assert.equal(calls.length, 0)
})
test('Foreign student history, link creation and link revocation are all denied', async () => {
  tables.programs[0].instructor_id = 'foreign-teacher'
  assert.equal((await requests.GET(req(`/?student_id=${studentId}`))).status, 403)
  assert.equal((await requests.POST(req('/', { method: 'POST', body: { student_id: studentId, document_id: documentId } }))).status, 403)
  assert.equal((await requests.DELETE(req('/', { method: 'DELETE', body: { student_id: studentId, request_id: requestId } }))).status, 403)
  assert.equal(calls.length, 0)
  assert.equal(queries.filter(q => q.table === 'guardian_consent_requests').length, 0)
})
test('Issuing a link uses verified staff, current student and server-generated token only', async () => {
  const response = await requests.POST(req('/', { method: 'POST', body: { student_id: studentId, document_id: documentId, guardian_id: 'other', staff_id: 'admin', language: 'ko', token, expires_at: '2099-01-01', url: 'https://foreign.example' } }))
  assert.equal(response.status, 201)
  const result = await response.json()
  assert.match(result.path, /^\/consent\/[0-9a-f]{64}$/)
  const rawToken = result.path.split('/').at(-1)
  assert.notEqual(rawToken, token)
  assert.deepEqual(calls[0], { name: 'create_guardian_consent_request', args: { p_staff_id: account.id, p_student_id: studentId, p_document_id: documentId, p_token_hash: consent.consentTokenHash(rawToken) } })
  assert.ok(!JSON.stringify(result).includes(calls[0].args.p_token_hash))
})
test('Staff history hides capability hashes and phone, distinguishes old recipient', async () => {
  tables.guardian_consent_requests = [{ id: requestId, student_id: studentId, guardian_id: guardianId, guardian_phone: '01011111111', program_id: programId, token_hash: 'hidden-hash', expires_at: '2099-01-01', revoked_at: null, records: [{ consented_at: '2026-09-05' }] }]
  const response = await requests.GET(req(`/?student_id=${studentId}`))
  const result = await response.json()
  assert.equal(result.items[0].recipient_changed, true)
  assert.equal(result.items[0].link_status, 'unavailable')
  assert.equal(result.items[0].records.length, 1)
  assert.doesNotMatch(JSON.stringify(result), /hidden-hash|01011111111|guardian_id/)
})
test('Public consent reads require a valid capability and never require staff login', async () => {
  assert.equal((await publicConsent.GET(req('/', { auth: null }), { params: { token: 'bad' } })).status, 404)
  assert.equal(calls.length, 0)
  const response = await publicConsent.GET(req('/', { auth: null }), { params: { token } })
  assert.equal(response.status, 200)
  assert.deepEqual(calls[0].args, { p_token_hash: consent.consentTokenHash(token), p_submission: null })
  assert.match(response.headers.get('cache-control'), /no-store/)
  assert.equal(response.headers.get('referrer-policy'), 'no-referrer')
  assert.match(response.headers.get('x-robots-tag'), /noindex/)
})
test('Cross-origin or unconfirmed public submission never reaches the database', async () => {
  assert.equal((await publicConsent.POST(req('/', { method: 'POST', auth: null, origin: 'https://other.example', body: submission }), { params: { token } })).status, 403)
  assert.equal((await publicConsent.POST(req('/', { method: 'POST', auth: null, body: { ...submission, accepted: false } }), { params: { token } })).status, 400)
  assert.equal(calls.length, 0)
})
test('Submission ignores forged timestamp and identity verification claims', async () => {
  const response = await publicConsent.POST(req('/', { method: 'POST', auth: null, body: { ...submission, consented_at: '1999-01-01', verification_method: 'phone_verified' } }), { params: { token } })
  assert.equal(response.status, 200)
  assert.deepEqual(calls[0].args.p_submission, submission)
})
test('Missing translation, invalidated link and database failures are truthful safe errors', async () => {
  for (const [message, status] of [['TRANSLATION_REQUIRED', 400], ['CONSENT_UNAVAILABLE', 410], ['CONSENT_ALREADY_RECORDED', 409], ['private database URL and phone', 500]]) {
    rpcError = { message }
    const response = await publicConsent.GET(req('/', { auth: null }), { params: { token } })
    assert.equal(response.status, status)
    assert.doesNotMatch(await response.text(), /private database URL/)
    assert.match(response.headers.get('cache-control'), /no-store/)
  }
})
test('Malformed JSON and oversized streaming bodies fail before any writes', async () => {
  account.role = 'admin'; account.instructor_id = null
  assert.equal((await documents.POST(req('/', { method: 'POST', rawBody: '{' }))).status, 400)
  assert.equal((await documents.POST(req('/', { method: 'POST', rawBody: ' '.repeat(256001) }))).status, 413)
  assert.equal(calls.length, 0)
})
test('Revocation uses verified staff and scoped student without deleting the consent record', async () => {
  const response = await requests.DELETE(req('/', { method: 'DELETE', body: { student_id: studentId, request_id: requestId, staff_id: 'spoofed' } }))
  assert.equal(response.status, 200)
  assert.deepEqual(calls[0], { name: 'revoke_guardian_consent_request', args: { p_staff_id: account.id, p_student_id: studentId, p_request_id: requestId } })
})
