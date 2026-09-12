import { createHmac, randomBytes } from 'node:crypto'

export type DeliveryState = 'sending' | 'accepted' | 'delivered' | 'failed' | 'unknown'
export type DeliveryResult = { status: DeliveryState; provider_message_id?: string | null; provider_group_id?: string | null; provider_status_code?: string | null; error_code?: string | null }
type Config = { apiKey: string; apiSecret: string; pfId: string; templateId: string; origin: string }

export function alimtalkConfig(): Config | null {
  if (process.env.MOASEM_ALIMTALK_ENABLED !== 'true') return null
  const [apiKey, apiSecret, pfId, templateId] = ['SOLAPI_API_KEY', 'SOLAPI_API_SECRET', 'SOLAPI_PF_ID', 'SOLAPI_REPORT_TEMPLATE_ID'].map(key => process.env[key]?.trim() || '')
  if (![apiKey, apiSecret, pfId, templateId].every(Boolean)) return null
  try {
    const url = new URL(process.env.MOASEM_PUBLIC_URL || '')
    if (url.protocol !== 'https:' || url.username || url.password || url.search || url.hash || url.pathname !== '/') return null
    return { apiKey, apiSecret, pfId, templateId, origin: url.origin }
  } catch { return null }
}
export function maskPhone(phone: string | null | undefined) {
  let digits = phone?.replace(/\D/g, '') || ''
  if (digits.startsWith('821')) digits = `0${digits.slice(2)}`
  return digits.length >= 8 ? `${digits.slice(0, 3)}-****-${digits.slice(-4)}` : '연락처 확인 필요'
}
function auth(config: Config) {
  const date = new Date().toISOString(), salt = randomBytes(16).toString('hex')
  const signature = createHmac('sha256', config.apiSecret).update(date + salt).digest('hex')
  return `HMAC-SHA256 apiKey=${config.apiKey}, date=${date}, salt=${salt}, signature=${signature}`
}
function providerId(value: unknown) { return typeof value === 'string' && /^[A-Za-z0-9_-]{1,100}$/.test(value) ? value : null }
function code(value: unknown) { return typeof value === 'string' && /^\d{4}$/.test(value) ? value : null }
export function providerState(value: unknown, complete = false): DeliveryState {
  const c = code(value)
  if (c === '4000') return 'delivered'
  if (!c) return 'unknown'
  if (['2000', '3000'].includes(c)) return complete ? 'unknown' : 'accepted'
  return 'failed'
}
async function providerRequest(config: Config, path: string, body?: unknown) {
  return fetch(`https://api.solapi.com${path}`, {
    method: body ? 'POST' : 'GET', headers: { Authorization: auth(config), 'Content-Type': 'application/json' },
    ...(body ? { body: JSON.stringify(body) } : {}), cache: 'no-store', redirect: 'error', signal: AbortSignal.timeout(12000),
  })
}
export async function sendReportAlimtalk(config: Config, to: string, token: string, attemptId: string): Promise<DeliveryResult> {
  const link = `${config.origin}/report/${token}`
  try {
    const response = await providerRequest(config, '/messages/v4/send-many/detail', {
      messages: [{ to, country: '82', type: 'ATA', kakaoOptions: { pfId: config.pfId, templateId: config.templateId, disableSms: true, variables: { '#{리포트링크}': link } }, customFields: { moasemAttempt: attemptId } }],
      strict: true, allowDuplicates: false, showMessageList: true,
    })
    const data = await response.json().catch(() => null)
    const failed = Array.isArray(data?.failedMessageList) ? data.failedMessageList.find((item: { to?: string }) => item.to === to) : null
    if (failed) return { status: 'failed', provider_status_code: code(failed.statusCode), error_code: 'PROVIDER_REJECTED' }
    // A timeout/5xx or unrecognizable reply may follow an accepted send. Never automatically retry it.
    if (!response.ok) return { status: 'unknown', error_code: 'PROVIDER_RESPONSE_UNCERTAIN' }
    const message = Array.isArray(data?.messageList) && data.messageList.length === 1 ? data.messageList[0] : null
    const messageId = providerId(message?.messageId)
    if (!messageId) return { status: 'unknown', error_code: 'PROVIDER_RESPONSE_UNCERTAIN' }
    return { status: providerState(message.statusCode), provider_message_id: messageId, provider_group_id: providerId(data?.groupInfo?.groupId), provider_status_code: code(message.statusCode), error_code: null }
  } catch { return { status: 'unknown', error_code: 'PROVIDER_RESPONSE_UNCERTAIN' } }
}
export async function checkReportAlimtalk(config: Config, messageId: string): Promise<DeliveryResult | null> {
  if (!providerId(messageId)) return null
  try {
    const query = new URLSearchParams({ criteria: 'messageId', cond: 'eq', value: messageId, limit: '1' })
    const response = await providerRequest(config, `/messages/v4/list?${query}`)
    if (!response.ok) return null
    const data = await response.json()
    const item = data?.messageList?.[messageId]
    if (!item || item.messageId !== messageId || item.type !== 'ATA') return null
    const status = providerState(item.statusCode, item.status === 'COMPLETE')
    return { status, provider_status_code: code(item.statusCode), error_code: status === 'failed' ? 'DELIVERY_FAILED' : null }
  } catch { return null }
}
