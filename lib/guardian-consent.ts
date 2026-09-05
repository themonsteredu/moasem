import { createHash, randomBytes } from 'node:crypto'
import { NextRequest, NextResponse } from 'next/server'
import { AccessError, assertProgramAccess, privateHeaders } from './admin-auth'
import { getSupabaseAdmin } from './supabase-admin'
import type { Staff } from './staff-types'

export const consentHeaders = { ...privateHeaders, 'Referrer-Policy': 'no-referrer', 'X-Robots-Tag': 'noindex, nofollow, noarchive' }
export const consentLanguages = ['ko', 'vi', 'zh-CN'] as const
export type ConsentLanguage = typeof consentLanguages[number]
type Translation = { title: string; body: string }
export type ConsentDocumentInput = { label: string; translations: Partial<Record<ConsentLanguage, Translation>> }

function object(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new AccessError(400, '입력 내용을 확인해 주세요.')
  return value as Record<string, unknown>
}
function inputText(value: unknown, max: number) {
  if (typeof value !== 'string' || !value.trim() || value.trim().length > max) throw new AccessError(400, '입력한 문구의 길이를 확인해 주세요.')
  return value.trim()
}
export function consentId(value: unknown) {
  if (typeof value !== 'string' || !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value)) throw new AccessError(400, '선택한 항목을 확인해 주세요.')
  return value.toLowerCase()
}
export function consentDocumentInput(value: unknown): ConsentDocumentInput {
  const body = object(value)
  const source = object(body.translations)
  if (!source.ko) throw new AccessError(400, '한국어 동의 문구를 함께 등록해 주세요.')
  const translations: ConsentDocumentInput['translations'] = {}
  for (const [language, value] of Object.entries(source)) {
    if (!consentLanguages.includes(language as ConsentLanguage)) throw new AccessError(400, '지원하는 언어를 선택해 주세요.')
    const translation = object(value)
    translations[language as ConsentLanguage] = { title: inputText(translation.title, 200), body: inputText(translation.body, 20000) }
  }
  return { label: inputText(body.label, 100), translations }
}
export function consentSubmission(value: unknown) {
  const body = object(value)
  if (body.accepted !== true || body.is_legal_representative !== true) throw new AccessError(400, '동의와 법정대리인 확인이 필요합니다.')
  if (!consentLanguages.includes(body.language as ConsentLanguage)) throw new AccessError(400, '동의서 언어를 확인해 주세요.')
  return { accepted: true, is_legal_representative: true, signer_name: inputText(body.signer_name, 100), language: body.language, document_id: consentId(body.document_id) }
}
export function consentTokenHash(token: string) {
  if (!/^[0-9a-f]{64}$/.test(token)) throw new AccessError(404, '동의 링크를 찾지 못했습니다.')
  return createHash('sha256').update(token).digest('hex')
}
export function newConsentToken() {
  const token = randomBytes(32).toString('hex')
  return { token, hash: consentTokenHash(token) }
}
export async function readConsentBody(request: NextRequest) {
  // Bound bytes while reading; Content-Length is not trusted or required.
  const reader = request.body?.getReader()
  if (!reader) throw new AccessError(400, '입력 내용을 확인해 주세요.')
  const chunks: Uint8Array[] = []
  let length = 0
  try {
    while (true) {
      const { value, done } = await reader.read()
      if (done) break
      length += value.byteLength
      if (length > 256000) {
        await reader.cancel()
        throw new AccessError(413, '입력한 문구가 너무 깁니다.')
      }
      chunks.push(value)
    }
    return object(JSON.parse(Buffer.concat(chunks).toString('utf8')))
  } catch (error) {
    if (error instanceof AccessError) throw error
    throw new AccessError(400, '입력 내용을 확인해 주세요.')
  } finally { reader.releaseLock() }
}
export async function consentStudent(staff: Staff, studentId: string) {
  const { data, error } = await getSupabaseAdmin().from('students').select('id,program_id,guardian_id,active').eq('id', consentId(studentId)).maybeSingle()
  if (error) throw error
  if (!data) throw new AccessError(404, '학생을 찾지 못했습니다.')
  await assertProgramAccess(staff, data.program_id)
  return data
}
export function consentError(error: unknown) {
  const messages: Record<string, [number, string]> = {
    STAFF_ACCESS_DENIED: [403, '사용 가능한 계정인지 확인해 주세요.'],
    PROGRAM_ACCESS_DENIED: [403, '담당 프로그램만 사용할 수 있습니다.'],
    STUDENT_NOT_FOUND: [404, '학생을 찾지 못했습니다.'],
    STUDENT_INACTIVE: [400, '사용 중인 학생만 동의를 요청할 수 있습니다.'],
    GUARDIAN_REQUIRED: [400, '보호자를 먼저 등록해 주세요.'],
    DOCUMENT_NOT_FOUND: [404, '동의 문구를 찾지 못했습니다.'],
    TRANSLATION_REQUIRED: [400, '보호자 언어의 동의 문구를 먼저 등록해 주세요.'],
    KOREAN_REQUIRED: [400, '한국어 동의 문구를 함께 등록해 주세요.'],
    INVALID_DOCUMENT: [400, '동의 문구를 확인해 주세요.'],
    CONSENT_NOT_FOUND: [404, '동의 링크를 찾지 못했습니다.'],
    CONSENT_UNAVAILABLE: [410, '사용할 수 없는 동의 링크입니다. 담당자에게 새 링크를 요청해 주세요.'],
    INVALID_CONSENT: [400, '동의서를 다시 열어 입력 내용을 확인해 주세요.'],
    CONSENT_ALREADY_RECORDED: [409, '이미 동의한 기록은 변경할 수 없습니다.'],
  }
  const code = error && typeof error === 'object' && 'message' in error ? String(error.message) : ''
  const [status, message] = error instanceof AccessError ? [error.status, error.message] : messages[code] ?? [500, '동의 정보를 처리하지 못했습니다. 잠시 뒤 다시 시도해 주세요.']
  return NextResponse.json({ error: message }, { status, headers: consentHeaders })
}
