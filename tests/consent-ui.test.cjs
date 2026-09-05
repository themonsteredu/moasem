require('./register.cjs')
const { test, afterEach } = require('node:test')
const assert = require('node:assert/strict')
const React = require('react')
const { create, act } = require('react-test-renderer')
const { GuardianConsentForm } = require('../app/components/guardian-consent-form.tsx')
const { consentCopy, summarizeConsent } = require('../lib/consent-view.ts')
const { typeDescription } = require('../lib/report-resources.ts')
const { consentDocumentInput, consentSubmission } = require('../lib/guardian-consent.ts')
const originalFetch = global.fetch
let mounted
const token = 'a'.repeat(64)
const documentId = '33333333-3333-4333-8333-333333333333'
function fixture(language = 'en') {
  return { status: 'pending', student_name: 'Test pupil', program_name: 'Test program', institution_name: 'Test institution', language, document_id: documentId, document: { primary: { title: 'Native title', body: 'Native body <script>never executable</script>' }, korean: { title: '한국어 문구', body: '한국어 본문' } }, expires_at: '2099-01-01T00:00:00Z', consented_at: null }
}
const response = (status, data) => ({ status, ok: status >= 200 && status < 300, json: async () => data })
afterEach(async () => { if (mounted) await act(async () => mounted.unmount()); mounted = null; global.fetch = originalFetch })
for (const language of ['ko', 'en', 'vi', 'zh-CN']) test(`${language}: guardian sees native copy first, confirms two choices and records once`, async () => {
  const data = fixture(language), calls = []
  global.fetch = async (url, options) => {
    calls.push({ url, options })
    if (options.method === 'POST') {
      assert.deepEqual(JSON.parse(options.body), { signer_name: 'Guardian', accepted: true, is_legal_representative: true, language, document_id: documentId })
      return response(200, { consent: { ...data, status: 'accepted', consented_at: '2026-09-05T12:00:00Z' } })
    }
    return response(200, { consent: data })
  }
  await act(async () => { mounted = create(React.createElement(GuardianConsentForm, { token, initialLanguage: 'ko' })) })
  assert.equal(mounted.root.findByType('main').props.lang, language)
  const sections = mounted.root.findAllByType('section')
  assert.equal(sections[0].props.className, 'consent-document')
  assert.equal(sections[1]?.props.className, language === 'ko' ? undefined : 'consent-korean-copy')
  assert.equal(mounted.root.findAllByType('script').length, 0)
  assert.match(JSON.stringify(mounted.toJSON()), /Native body/)
  assert.equal(mounted.root.findAllByType('button').find(button => button.props.className.includes('button-primary')).props.disabled, true)
  await act(async () => {
    mounted.root.findByProps({ name: 'signer_name' }).props.onChange({ target: { value: 'Guardian' } })
    mounted.root.findAllByProps({ type: 'checkbox' }).forEach(box => box.props.onChange({ target: { checked: true } }))
  })
  await act(async () => {
    const form = mounted.root.findByType('form')
    await Promise.all([form.props.onSubmit({ preventDefault() {} }), form.props.onSubmit({ preventDefault() {} })])
  })
  assert.equal(calls.filter(call => call.options.method === 'POST').length, 1)
  assert.equal(mounted.root.findAllByType('form').length, 0)
  assert.ok(JSON.stringify(mounted.toJSON()).includes(consentCopy[language].received))
  assert.ok(calls.every(call => call.url.startsWith('/api/consent/')))
})
test('An English expired link has an English recovery message and no form', async () => {
  global.fetch = async () => response(410, { error: 'Korean server detail' })
  await act(async () => { mounted = create(React.createElement(GuardianConsentForm, { token, initialLanguage: 'en' })) })
  assert.equal(mounted.root.findByType('main').props.lang, 'en')
  assert.ok(JSON.stringify(mounted.toJSON()).includes(consentCopy.en.unavailable))
  assert.equal(mounted.root.findAllByType('form').length, 0)
  assert.doesNotMatch(JSON.stringify(mounted.toJSON()), /Korean server detail/)
})
test('Uncertain save remains unconfirmed, then refresh recovers the recorded receipt', async () => {
  let saved = false
  global.fetch = async (_url, options) => {
    if (options.method === 'POST') { saved = true; throw new Error('network lost after commit') }
    return response(200, { consent: { ...fixture(), ...(saved ? { status: 'accepted', consented_at: '2026-09-05T12:00:00Z' } : {}) } })
  }
  await act(async () => { mounted = create(React.createElement(GuardianConsentForm, { token, initialLanguage: 'en' })) })
  await act(async () => {
    mounted.root.findByProps({ name: 'signer_name' }).props.onChange({ target: { value: 'Guardian' } })
    mounted.root.findAllByProps({ type: 'checkbox' }).forEach(box => box.props.onChange({ target: { checked: true } }))
  })
  await act(async () => mounted.root.findByType('form').props.onSubmit({ preventDefault() {} }))
  assert.equal(mounted.root.findAllByProps({ className: 'consent-received' }).length, 0)
  assert.ok(JSON.stringify(mounted.toJSON()).includes(consentCopy.en.failure))
  await act(async () => mounted.root.findAllByType('button').find(button => button.children.includes(consentCopy.en.retry)).props.onClick())
  assert.equal(mounted.root.findAllByProps({ className: 'consent-received' }).length, 1)
})
test('Consent status uses current recipient evidence, supports one-to-one joins and never infers age', () => {
  const evidence = { guardian_id: 'g', program_id: 'p', guardian_phone: '01000000000', records: { language: 'en', consented_at: '2026-09-05T12:00:00Z' }, revoked_at: '2026-09-06', expires_at: '2026-09-07' }
  const student = { is_under_14: true, guardian_id: 'g', program_id: 'p', guardian: { phone: '01000000000' }, consent_requests: [evidence] }
  assert.equal(summarizeConsent(student).status, 'received')
  assert.equal(summarizeConsent({ ...student, consent_requests: [{ ...evidence, records: [evidence.records] }] }).language, 'en')
  assert.equal(summarizeConsent({ ...student, guardian_id: 'changed' }).status, 'pending')
  assert.equal(summarizeConsent({ ...student, guardian: { phone: 'changed' } }).status, 'pending')
  assert.equal(summarizeConsent({ ...student, program_id: 'changed' }).status, 'pending')
  assert.equal(summarizeConsent({ ...student, is_under_14: null }).status, 'age_unconfirmed')
  assert.equal(summarizeConsent({ ...student, is_under_14: false }).status, 'not_required')
})
test('English consent input and English error-type descriptions work without Korean substitution', () => {
  const translations = { ko: { title: '시험', body: '시험용 문구' }, en: { title: 'Test', body: 'Test-only copy' } }
  assert.equal(consentDocumentInput({ label: 'Test', translations }).translations.en.body, 'Test-only copy')
  assert.equal(consentSubmission({ signer_name: 'Test guardian', accepted: true, is_legal_representative: true, language: 'en', document_id: documentId }).language, 'en')
  assert.equal(typeDescription({ description_ko: '한국어', description_en: 'English explanation' }, 'en'), 'English explanation')
  assert.equal(typeDescription({ description_ko: '한국어' }, 'en'), undefined)
})
