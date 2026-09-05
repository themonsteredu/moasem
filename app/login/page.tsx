'use client'

import { FormEvent, useEffect, useState } from 'react'
import { staffHome } from '../../lib/staff-types'
import { jsonHeaders } from '../../lib/staff-client'
import { Icon, Notice } from '../components/workspace'

export default function LoginPage() {
  const [setup, setSetup] = useState<boolean | null>(null)
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState('')
  const [attempt, setAttempt] = useState(0)
  useEffect(() => {
    let alive = true
    setMessage('')
    fetch('/api/auth/setup', { cache: 'no-store' }).then(async response => {
      if (!response.ok) throw new Error('로그인을 준비하지 못했습니다. 다시 시도해 주세요.')
      const data = await response.json()
      if (alive) setSetup(data.needs_setup)
    }).catch(error => { if (alive) setMessage(error.message) })
    return () => { alive = false }
  }, [attempt])
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (busy || setup === null) return
    const payload = Object.fromEntries(new FormData(event.currentTarget).entries())
    setBusy(true); setMessage('')
    try {
      const response = await fetch(setup ? '/api/auth/setup' : '/api/auth/login', { method: 'POST', headers: jsonHeaders, body: JSON.stringify(payload) })
      const data = await response.json()
      if (!response.ok) {
        if (setup && response.status === 409) setSetup(false)
        throw new Error(data.error || '로그인하지 못했습니다.')
      }
      try { sessionStorage.removeItem('moasem-admin-key') } catch { /* Storage is optional. */ }
      window.location.replace(staffHome(data.staff))
    } catch (error) { setMessage(error instanceof Error ? error.message : '연결을 확인해 주세요.'); setBusy(false) }
  }
  return <main className="login-shell"><section className="surface login-card">
    <div className="wordmark"><span className="brand-symbol">m<span>:</span></span><span>MOASEM<small>모아셈</small></span></div>
    <span className="eyebrow">기관 위탁 수학 학습관리</span>
    <h1>{setup ? '관리자 계정 만들기' : '다시 만나 반갑습니다'}</h1>
    <p>{setup ? '처음 한 번만 계정을 만들면, 다음부터 이메일로 로그인합니다.' : '관리자 또는 강사 계정으로 로그인해 주세요.'}</p>
    <form className="editor-form" onSubmit={submit}>
      <fieldset disabled={busy || setup === null}>
        {setup && <><label className="field"><span>관리자 이름</span><input name="name" autoComplete="name" maxLength={100} required/></label><label className="field"><span>기존 관리 키</span><input name="setup_key" type="password" autoComplete="off" required/></label></>}
        <label className="field"><span>이메일</span><input name="email" type="email" autoComplete="username" autoCapitalize="none" spellCheck={false} required maxLength={254}/></label>
        <label className="field"><span>비밀번호{setup ? ' · 10자 이상' : ''}</span><input name="password" type="password" autoComplete={setup ? 'new-password' : 'current-password'} minLength={setup ? 10 : 1} maxLength={128} required/></label>
      </fieldset>
      <button className="button button-primary full-width" disabled={busy || setup === null}><Icon name="lock" size={17}/>{busy ? '확인 중…' : setup ? '관리자 계정 만들기' : '로그인'}</button>
    </form>
    {setup === null && message && <button className="text-button" onClick={() => setAttempt(value => value + 1)}>다시 시도</button>}
    <Notice>{message}</Notice>
    {!setup && <p className="field-help">강사 계정은 관리자가 등록합니다. 계정 정보는 관리자에게 확인해 주세요.</p>}
  </section></main>
}
