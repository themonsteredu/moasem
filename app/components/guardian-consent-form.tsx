'use client'

import { FormEvent, useEffect, useRef, useState } from 'react'
import { consentCopy } from '../../lib/consent-view'
import { isSupportedLanguage, languageLocale, SupportedLanguage } from '../../lib/languages'

type Consent = { status: 'pending' | 'accepted'; student_name: string; program_name: string; institution_name: string; language: SupportedLanguage; document_id: string; document: { primary: { title: string; body: string }; korean: { title: string; body: string } }; expires_at: string; consented_at: string | null }
function Bilingual({ primary, korean, language }: { primary: string; korean: string; language: string }) {
  return <>{primary}{language !== 'ko' && <small className="guardian-korean" lang="ko">{korean}</small>}</>
}
export function GuardianConsentForm({ token, initialLanguage }: { token: string; initialLanguage: SupportedLanguage }) {
  const [consent, setConsent] = useState<Consent | null>(null)
  const [error, setError] = useState<'unavailable' | 'connection' | ''>('')
  const [message, setMessage] = useState('')
  const [attempt, setAttempt] = useState(0)
  const [saving, setSaving] = useState(false)
  const [name, setName] = useState('')
  const [representative, setRepresentative] = useState(false)
  const [agreed, setAgreed] = useState(false)
  const posting = useRef(false)
  const language = consent?.language ?? initialLanguage
  const l = consentCopy[language], ko = consentCopy.ko
  useEffect(() => {
    let active = true
    setError(''); setMessage(''); setConsent(null)
    fetch(`/api/consent/${encodeURIComponent(token)}`, { cache: 'no-store' }).then(async response => {
      if (!response.ok) { if (active) setError([404, 410].includes(response.status) ? 'unavailable' : 'connection'); return }
      const data = await response.json()
      if (!data.consent || !isSupportedLanguage(data.consent.language)) throw new Error('Invalid response')
      if (active) setConsent(data.consent)
    }).catch(() => { if (active) setError('connection') })
    return () => { active = false }
  }, [token, attempt])
  async function submit(event: FormEvent) {
    event.preventDefault()
    if (posting.current || !consent || consent.status === 'accepted') return
    if (!name.trim() || !representative || !agreed) { setMessage(l.required); return }
    posting.current = true; setSaving(true); setMessage('')
    try {
      const response = await fetch(`/api/consent/${encodeURIComponent(token)}`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, cache: 'no-store', body: JSON.stringify({ signer_name: name.trim(), accepted: agreed, is_legal_representative: representative, language: consent.language, document_id: consent.document_id }) })
      if ([404, 410].includes(response.status)) { setError('unavailable'); return }
      const data = await response.json()
      if (!response.ok || data.consent?.status !== 'accepted' || !isSupportedLanguage(data.consent.language)) throw new Error('Not confirmed')
      setConsent(data.consent)
    } catch { setMessage(l.failure) }
    finally { posting.current = false; setSaving(false) }
  }
  if (error) return <main className="public-state consent-public" lang={language}><span className="eyebrow">MOASEM</span><h1><Bilingual primary={error === 'unavailable' ? l.unavailable : l.problem} korean={error === 'unavailable' ? ko.unavailable : ko.problem} language={language}/></h1><p><Bilingual primary={l.unavailableNote} korean={ko.unavailableNote} language={language}/></p>{error === 'connection' && <button className="button button-primary" onClick={() => setAttempt(value => value + 1)}>{l.retry}</button>}</main>
  if (!consent) return <main className="public-state consent-public" lang={language} role="status"><span className="eyebrow">MOASEM</span><p><Bilingual primary={l.loading} korean={ko.loading} language={language}/></p></main>
  return <main className="guardian-page consent-public" lang={language}>
    <div className="guardian-brand"><strong>MOASEM</strong><span>{consent.institution_name}</span></div>
    <header className="guardian-header"><h1><Bilingual primary={l.title} korean={ko.title} language={language}/></h1><p className="consent-student-name">{consent.student_name}</p><p className="meta">{consent.program_name}</p></header>
    {consent.status === 'accepted' ? <section className="consent-received" role="status"><span className="consent-check" aria-hidden="true">✓</span><h2><Bilingual primary={l.received} korean={ko.received} language={language}/></h2><p><Bilingual primary={l.receivedNote} korean={ko.receivedNote} language={language}/></p><p><Bilingual primary={l.date} korean={ko.date} language={language}/><strong>{consent.consented_at ? new Date(consent.consented_at).toLocaleString(languageLocale(language), { timeZone: 'Asia/Seoul', timeZoneName: 'short' }) : '—'}</strong></p></section> : <>
      <section className="consent-document" aria-label={l.document}><h2>{consent.document.primary.title}</h2><p className="consent-prose">{consent.document.primary.body}</p></section>
      {language !== 'ko' && <section className="consent-korean-copy" lang="ko"><h2>{consent.document.korean.title}</h2><p className="consent-prose">{consent.document.korean.body}</p></section>}
      <form className="consent-signature" onSubmit={submit}><fieldset disabled={saving}>
        <label className="field"><span><Bilingual primary={l.signer} korean={ko.signer} language={language}/></span><input name="signer_name" autoComplete="name" required maxLength={100} value={name} onChange={event => setName(event.target.value)}/></label>
        <label className="consent-confirm"><input type="checkbox" checked={representative} onChange={event => setRepresentative(event.target.checked)} required/><span><Bilingual primary={l.representative} korean={ko.representative} language={language}/></span></label>
        <label className="consent-confirm"><input type="checkbox" checked={agreed} onChange={event => setAgreed(event.target.checked)} required/><span><Bilingual primary={l.agree} korean={ko.agree} language={language}/></span></label>
      </fieldset><button className="button button-primary full-width" disabled={saving || !name.trim() || !representative || !agreed}><Bilingual primary={saving ? l.saving : l.submit} korean={saving ? ko.saving : ko.submit} language={language}/></button>
      {message && <div className="consent-error" role="alert"><p>{message}</p><button type="button" className="button" disabled={saving} onClick={() => setAttempt(value => value + 1)}>{l.retry}</button></div>}</form>
    </>}
    <p className="guardian-expiry"><Bilingual primary={l.expires} korean={ko.expires} language={language}/> {new Date(consent.expires_at).toLocaleString(languageLocale(language), { timeZone: 'Asia/Seoul', timeZoneName: 'short' })}</p>
  </main>
}
