'use client'

import { FormEvent, useRef, useState } from 'react'
import { apiFetch, jsonHeaders } from '../../lib/staff-client'
import { languageLabels, supportedLanguages, SupportedLanguage } from '../../lib/languages'
import { useStaffData } from '../components/staff-session'
import { EmptyState, Notice, StaffAccess, Workspace } from '../components/workspace'

type Translation = { title: string; body: string }
type Document = { id: string; label: string; translations: Partial<Record<SupportedLanguage, Translation>>; created_at: string }
const blank = (): Record<SupportedLanguage, Translation> => ({ ko: { title: '', body: '' }, en: { title: '', body: '' }, vi: { title: '', body: '' }, 'zh-CN': { title: '', body: '' } })

export default function ConsentDocumentsPage() {
  const [items, setItems] = useState<Document[]>([])
  const [label, setLabel] = useState('')
  const [draft, setDraft] = useState(blank)
  const [language, setLanguage] = useState<SupportedLanguage>('ko')
  const [busy, setBusy] = useState(false)
  const [saving, setSaving] = useState(false)
  const [message, setMessage] = useState('')
  const posting = useRef(false)
  useStaffData(load)
  async function load() {
    setBusy(true)
    try {
      const response = await apiFetch('/api/admin/consent-documents')
      const data = await response.json()
      if (!response.ok) throw new Error(data.error)
      setItems(data.items ?? [])
    } catch (error) { setMessage(error instanceof Error ? error.message : '동의서를 불러오지 못했습니다.') }
    finally { setBusy(false) }
  }
  async function save(event: FormEvent) {
    event.preventDefault()
    if (posting.current) return
    const translations: Document['translations'] = {}
    for (const lang of supportedLanguages) {
      const entry = draft[lang]
      if (lang === 'ko' || entry.title.trim() || entry.body.trim()) {
        if (!entry.title.trim() || !entry.body.trim()) { setLanguage(lang); setMessage(`${languageLabels[lang]} 제목과 본문을 모두 입력해 주세요.`); return }
        translations[lang] = { title: entry.title.trim(), body: entry.body.trim() }
      }
    }
    posting.current = true; setSaving(true); setMessage('')
    try {
      const response = await apiFetch('/api/admin/consent-documents', { method: 'POST', headers: jsonHeaders, body: JSON.stringify({ label, translations }) })
      const data = await response.json()
      if (!response.ok) throw new Error(data.error)
      setItems(current => [data.item, ...current].slice(0, 20)); setLabel(''); setDraft(blank()); setLanguage('ko')
      setMessage('새 동의 문구를 저장했습니다. 학생 명단에서 동의 링크를 만들 수 있습니다.')
    } catch (error) { setMessage(error instanceof Error ? error.message : '저장하지 못했습니다.') }
    finally { posting.current = false; setSaving(false) }
  }
  function reuse(item: Document) {
    const next = blank()
    for (const lang of supportedLanguages) if (item.translations[lang]) next[lang] = { ...item.translations[lang]! }
    setDraft(next); setLabel(`${item.label} 수정본`.slice(0, 100)); setLanguage('ko'); setMessage('이전 문구를 가져왔습니다. 저장하면 새 문구로 추가됩니다.')
  }
  return <Workspace current="/consents" title="보호자 동의서" description="보호자가 읽을 언어별 문구를 등록하세요. 동의 당시 문구는 그대로 보관됩니다.">
    <StaffAccess onLoad={load} busy={busy || saving}/>
    <div className="consent-editor-grid">
      <section className="surface">
        <div className="section-heading"><div><span className="eyebrow">언어별 안내</span><h2>새 동의 문구</h2></div></div>
        <form className="consent-editor" onSubmit={save}>
          <fieldset disabled={saving}>
            <label className="field"><span>문구 이름 *</span><input value={label} onChange={event => setLabel(event.target.value)} maxLength={100} required placeholder="예: 2026년 수학 프로그램 보호자 동의"/></label>
            <div className="consent-language-tabs" role="tablist" aria-label="동의 문구 언어">{supportedLanguages.map(lang => <button key={lang} type="button" role="tab" id={`consent-tab-${lang}`} aria-selected={language === lang} aria-controls="consent-copy-editor" className={language === lang ? 'active' : ''} onClick={() => setLanguage(lang)}>{languageLabels[lang]}<small>{lang === 'ko' ? '필수' : draft[lang].body.trim() ? '입력됨' : '미입력'}</small></button>)}</div>
            <div id="consent-copy-editor" role="tabpanel" aria-labelledby={`consent-tab-${language}`} className="consent-copy-editor">
              <label className="field"><span>{languageLabels[language]} 제목</span><input lang={language} value={draft[language].title} maxLength={200} onChange={event => setDraft(current => ({ ...current, [language]: { ...current[language], title: event.target.value } }))}/></label>
              <label className="field"><span>{languageLabels[language]} 동의 본문</span><textarea lang={language} rows={12} maxLength={20000} value={draft[language].body} onChange={event => setDraft(current => ({ ...current, [language]: { ...current[language], body: event.target.value } }))} placeholder="사용할 동의 문구를 붙여 넣어 주세요."/></label>
            </div>
            <p className="field-help">한국어와 보호자가 읽을 언어의 문구를 함께 넣어 주세요. 입력하지 않은 언어로는 동의 링크를 만들 수 없습니다.</p>
          </fieldset>
          <button className="button button-primary full-width" disabled={saving}>{saving ? '저장 중…' : '새 동의 문구 저장'}</button>
        </form>
      </section>
      <section className="surface">
        <div className="section-heading"><div><span className="eyebrow">보관된 문구</span><h2>작성 내역</h2></div></div>
        {!items.length ? <EmptyState title={busy ? '문구를 불러오는 중입니다' : '아직 등록한 문구가 없습니다'} description="실제로 사용할 문구를 입력하면 여기에 보관됩니다." icon="report"/> : <div className="consent-document-list">{items.map(item => <article key={item.id}><h3>{item.label}</h3><p>{new Date(item.created_at).toLocaleDateString('ko-KR')}</p><div className="consent-document-languages">{supportedLanguages.filter(lang => item.translations[lang]).map(lang => <span className="badge" key={lang}>{languageLabels[lang]}</span>)}</div><details><summary>문구 보기</summary>{supportedLanguages.filter(lang => item.translations[lang]).map(lang => <section key={lang} lang={lang}><h4>{languageLabels[lang]} · {item.translations[lang]?.title}</h4><p className="consent-prose">{item.translations[lang]?.body}</p></section>)}</details><button className="text-button" disabled={saving} onClick={() => reuse(item)}>이 문구로 수정본 만들기</button></article>)}</div>}
      </section>
    </div>
    <Notice>{message}</Notice>
  </Workspace>
}
