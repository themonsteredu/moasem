'use client'

import { useEffect, useRef, useState } from 'react'
import { apiFetch, jsonHeaders } from '../../lib/staff-client'
import { consentStatusLabels, ConsentStudent } from '../../lib/consent-view'
import { languageLabels, supportedLanguages } from '../../lib/languages'
import { useStaff } from './staff-session'
import { Notice } from './workspace'

type Document = { id: string; label: string; translations: Record<string, { title: string; body: string }> }
type RequestItem = { id: string; document_snapshot: { label: string }; language: string; created_at: string; expires_at: string; link_status: string; records: { signer_name: string; language: string; consented_at: string }[] }
const linkLabels: Record<string, string> = { active: '사용 가능', expired: '만료', revoked: '사용 중지', unavailable: '다시 발급 필요' }

export function ConsentBadge({ student }: { student: ConsentStudent }) {
  const status = student.consent?.status ?? 'age_unconfirmed'
  return <span className={`badge ${status === 'received' ? 'badge-green' : ''}`}>{consentStatusLabels[status]}</span>
}
export function StudentConsent({ student, onClose, onChanged, onBusy }: { student: ConsentStudent; onClose: () => void; onChanged: () => Promise<void>; onBusy: (busy: boolean) => void }) {
  const { staff } = useStaff()
  const [items, setItems] = useState<RequestItem[]>([])
  const [documents, setDocuments] = useState<Document[]>([])
  const [documentId, setDocumentId] = useState('')
  const [url, setUrl] = useState('')
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState('')
  const [age, setAge] = useState(student.is_under_14 == null ? 'unknown' : String(student.is_under_14))
  const [language, setLanguage] = useState(student.guardian?.language || 'ko')
  const locked = useRef(false)
  const alive = useRef(true)
  const panel = useRef<HTMLElement>(null)
  const nativeLanguage = student.guardian?.language || 'ko'
  const available = documents.filter(document => document.translations[nativeLanguage])
  const selectedId = available.some(document => document.id === documentId) ? documentId : available[0]?.id || ''

  useEffect(() => {
    alive.current = true
    panel.current?.scrollIntoView({ block: 'start', behavior: window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth' })
    void load()
    return () => { alive.current = false }
    // Parent keys the panel by student, so a changed student starts a fresh flow.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [student.id])
  useEffect(() => { setAge(student.is_under_14 == null ? 'unknown' : String(student.is_under_14)); setLanguage(nativeLanguage) }, [student.is_under_14, nativeLanguage])
  async function load() {
    setLoading(true)
    try {
      const responses = await Promise.all([apiFetch(`/api/admin/guardian-consents?student_id=${encodeURIComponent(student.id)}`), apiFetch('/api/admin/consent-documents')])
      const [history, documentData] = await Promise.all(responses.map(response => response.json()))
      if (!responses[0].ok || !responses[1].ok) throw new Error(history.error || documentData.error || '동의 정보를 불러오지 못했습니다.')
      if (alive.current) { setItems(history.items ?? []); setDocuments(documentData.items ?? []) }
    } catch (error) { if (alive.current) { setItems([]); setDocuments([]); setMessage(error instanceof Error ? error.message : '연결을 확인해 주세요.') } }
    finally { if (alive.current) setLoading(false) }
  }
  async function change(action: 'issue' | 'revoke' | 'details', requestId?: string) {
    if (locked.current) return
    locked.current = true; setBusy(true); onBusy(true); setMessage('')
    try {
      const response = await apiFetch(action === 'details' ? '/api/admin/students' : '/api/admin/guardian-consents', {
        method: action === 'details' ? 'PATCH' : action === 'issue' ? 'POST' : 'DELETE', headers: jsonHeaders,
        body: JSON.stringify(action === 'details' ? { student_id: student.id, is_under_14: age === 'unknown' ? null : age === 'true', guardian_language: language } : { student_id: student.id, document_id: selectedId, request_id: requestId }),
      })
      const data = await response.json()
      if (!response.ok) throw new Error(data.error || '처리하지 못했습니다.')
      if (!alive.current) return
      if (action === 'issue') {
        if (typeof data.path !== 'string' || !/^\/consent\/[0-9a-f]{64}\?lang=(ko|en|vi|zh-CN)$/.test(data.path)) throw new Error('링크를 확인하지 못했습니다. 새로 발급해 주세요.')
        setUrl(`${window.location.origin}${data.path}`)
        setMessage('동의 링크를 만들었습니다. 등록된 보호자에게 전달해 주세요.')
      } else { setUrl(''); setMessage(action === 'revoke' ? '링크 사용을 중지했습니다. 접수된 동의 기록은 보관됩니다.' : '연령 확인과 안내 언어를 저장했습니다.') }
      await load(); await onChanged()
    } catch (error) { if (alive.current) setMessage(error instanceof Error ? error.message : '처리하지 못했습니다.') }
    finally { locked.current = false; if (alive.current) setBusy(false); onBusy(false) }
  }
  async function copy() {
    try { await navigator.clipboard.writeText(url); setMessage('동의 링크를 복사했습니다.') }
    catch { setMessage('아래 주소를 길게 누르거나 선택해서 복사해 주세요.') }
  }
  return <section ref={panel} className="surface student-consent" aria-label={`${student.name} 보호자 동의`}>
    <div className="section-heading"><div><span className="eyebrow">학생별 동의 관리</span><h2>{student.name} · 보호자 동의</h2></div><button className="button" disabled={busy} onClick={onClose}>닫기</button></div>
    <div className="consent-panel-body">
      <div className="consent-panel-summary"><ConsentBadge student={student}/><span>보호자 언어 · {languageLabels[nativeLanguage]}</span><button className="text-button" disabled={busy || loading} onClick={async () => { await load(); await onChanged() }}>동의 상태 새로고침</button></div>
      {staff?.role === 'admin' && <details className="form-details"><summary>연령 확인·안내 언어 수정</summary><div className="form-columns"><label className="field"><span>만 14세 미만 여부</span><select value={age} disabled={busy} onChange={event => setAge(event.target.value)}><option value="unknown">확인 필요</option><option value="true">예 · 만 14세 미만</option><option value="false">아니오 · 만 14세 이상</option></select></label><label className="field"><span>편하게 읽는 언어</span><select value={language} disabled={busy} onChange={event => setLanguage(event.target.value)}>{supportedLanguages.map(lang => <option key={lang} value={lang}>{languageLabels[lang]}</option>)}</select></label></div><button className="button" disabled={busy} onClick={() => change('details')}>확인 내용 저장</button></details>}
      <div className="consent-issue"><label className="field"><span>전달할 동의 문구</span><select value={selectedId} onChange={event => setDocumentId(event.target.value)} disabled={busy || loading}><option value="">문구 선택</option>{available.map(document => <option value={document.id} key={document.id}>{document.label}</option>)}</select></label><button className="button button-primary" disabled={busy || loading || !selectedId || !student.guardian} onClick={() => change('issue')}>{busy ? '처리 중…' : items.length ? '새 동의 링크 만들기' : '동의 링크 만들기'}</button></div>
      {!loading && !available.length && <p className="field-help">{languageLabels[nativeLanguage]} 동의 문구가 아직 없습니다. {staff?.role === 'admin' ? <a href="/consents">동의서 관리에서 등록해 주세요.</a> : '관리자에게 문구 등록을 요청해 주세요.'}</p>}
      {items.length > 0 && <p className="field-help">새 링크를 만들면 이전 링크는 사용할 수 없습니다. 이미 접수된 동의는 보관됩니다.</p>}
      {url && <div className="consent-share"><label className="field"><span>보호자에게 전달할 링크</span><input readOnly value={url} onFocus={event => event.currentTarget.select()}/></label><div className="access-controls"><button className="button button-dark" disabled={busy} onClick={copy}>링크 복사</button><a className="button" href={url} target="_blank" rel="noreferrer">동의서 열기</a></div></div>}
      <div className="table-scroll"><table className="data-table"><thead><tr><th>동의 문구·언어</th><th>동의 접수</th><th>링크</th></tr></thead><tbody>{items.map(item => <tr key={item.id}><td>{item.document_snapshot.label}<small>{languageLabels[item.language]}</small></td><td>{item.records?.length ? <><span className="badge badge-green">동의 접수</span><small>{new Date(item.records[0].consented_at).toLocaleString('ko-KR', { timeZone: 'Asia/Seoul' })}</small></> : <span className="meta">대기</span>}</td><td>{linkLabels[item.link_status] || '확인 필요'}<small>만료 {new Date(item.expires_at).toLocaleDateString('ko-KR')}</small>{item.link_status === 'active' && <button className="text-button" disabled={busy} onClick={() => change('revoke', item.id)}>링크 사용 중지</button>}</td></tr>)}</tbody></table></div>
      {!items.length && <p className="field-help">{loading ? '동의 내역을 불러오는 중입니다.' : '아직 동의를 요청하지 않았습니다.'}</p>}
      <Notice>{message}</Notice>
    </div>
  </section>
}
