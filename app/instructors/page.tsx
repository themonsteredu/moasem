'use client'

import { FormEvent, useState } from 'react'
import { apiFetch, jsonHeaders } from '../../lib/staff-client'
import { useStaffData } from '../components/staff-session'
import { EmptyState, Notice, StaffAccess, Workspace } from '../components/workspace'

type Account = { id: string; name: string; email: string; active: boolean; instructor_id: string }
type Instructor = { id: string; name: string; email: string | null; phone: string | null }
type Program = { id: string; name: string; instructor_id: string | null; institution: { name: string } | null }
type Draft = { id: string; instructor_id: string; name: string; email: string; phone: string; password: string; program_ids: string[]; active: boolean }
const blank: Draft = { id: '', instructor_id: '', name: '', email: '', phone: '', password: '', program_ids: [], active: true }

export default function InstructorsPage() {
  const [accounts, setAccounts] = useState<Account[]>([])
  const [instructors, setInstructors] = useState<Instructor[]>([])
  const [programs, setPrograms] = useState<Program[]>([])
  const [draft, setDraft] = useState<Draft>(blank)
  const [loaded, setLoaded] = useState(false)
  const [busy, setBusy] = useState(false)
  const [saving, setSaving] = useState(false)
  const [message, setMessage] = useState('')
  useStaffData(load)
  async function load() {
    setBusy(true)
    try {
      const response = await apiFetch('/api/admin/instructors')
      const data = await response.json()
      if (!response.ok) throw new Error(data.error || '강사 정보를 불러오지 못했습니다.')
      setAccounts(data.items ?? []); setInstructors(data.instructors ?? []); setPrograms(data.programs ?? []); setLoaded(true)
    } catch (error) { setLoaded(false); setAccounts([]); setPrograms([]); setInstructors([]); setMessage(error instanceof Error ? error.message : '다시 시도해 주세요.') }
    finally { setBusy(false) }
  }
  function selectExisting(id: string) {
    const item = instructors.find(instructor => instructor.id === id)
    setDraft(item ? { ...blank, instructor_id: id, name: item.name, email: item.email || '', phone: item.phone || '', program_ids: programs.filter(program => program.instructor_id === id).map(program => program.id) } : blank)
    setMessage('')
  }
  function edit(account: Account) {
    setDraft({ ...blank, ...account, phone: instructors.find(item => item.id === account.instructor_id)?.phone || '', program_ids: programs.filter(item => item.instructor_id === account.instructor_id).map(item => item.id) })
    setMessage('')
  }
  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (saving) return
    setSaving(true); setMessage('')
    try {
      const response = await apiFetch('/api/admin/instructors', { method: 'POST', headers: jsonHeaders, body: JSON.stringify(draft) })
      const data = await response.json()
      if (!response.ok) throw new Error(data.error || '강사를 저장하지 못했습니다.')
      const isNew = !draft.id
      setDraft(blank); await load()
      setMessage(isNew ? (data.uses_existing_account ? '강사를 연결했습니다. 이 이메일의 기존 비밀번호로 로그인할 수 있습니다.' : '강사를 등록했습니다. 이메일과 초기 비밀번호를 강사에게 직접 전달해 주세요.') : '강사 정보와 담당 프로그램을 저장했습니다.')
    } catch (error) { setMessage(error instanceof Error ? error.message : '다시 시도해 주세요.') }
    finally { setSaving(false) }
  }
  return <Workspace current="/instructors" title="강사 관리" description="강사 계정을 등록하고 함께할 프로그램을 배정하세요.">
    <StaffAccess onLoad={load} busy={busy || saving}/>
    <div className="management-grid">
      <section className="surface list-surface">
        <div className="section-heading"><h2>등록 강사</h2><span className="meta">{loaded ? `${accounts.length}명` : '불러오는 중'}</span></div>
        {!accounts.length ? <EmptyState icon="people" title={loaded ? '첫 강사를 등록해 주세요' : '강사 정보를 불러옵니다'} description="강사는 배정된 프로그램의 학생만 확인할 수 있습니다."/> : <div className="table-scroll"><table className="data-table"><thead><tr><th>강사·이메일</th><th>담당 프로그램</th><th>사용 상태</th><th>관리</th></tr></thead><tbody>{accounts.map(account => <tr key={account.id}><td><span className="table-name">{account.name}</span><small>{account.email}</small></td><td>{programs.filter(program => program.instructor_id === account.instructor_id).map(program => <small key={program.id}>{program.institution?.name} · {program.name}</small>)}{!programs.some(program => program.instructor_id === account.instructor_id) && '미배정'}</td><td><span className={`badge ${account.active ? 'badge-green' : ''}`}>{account.active ? '사용 중' : '중지'}</span></td><td><button className="text-button" disabled={saving || busy} onClick={() => edit(account)}>수정</button></td></tr>)}</tbody></table></div>}
      </section>
      <aside className="surface editor-surface instructor-editor">
        <div className="section-heading"><h2>{draft.id ? '강사 정보 수정' : '강사 등록'}</h2>{draft.id && <button className="text-button" disabled={saving} onClick={() => setDraft(blank)}>새 강사</button>}</div>
        <form className="editor-form" onSubmit={save}><fieldset disabled={saving || busy || !loaded}>
          {!draft.id && <label className="field"><span>기존 강사 연결</span><select value={draft.instructor_id} onChange={event => selectExisting(event.target.value)}><option value="">새 강사로 등록</option>{instructors.filter(item => !accounts.some(account => account.instructor_id === item.id)).map(item => <option key={item.id} value={item.id}>{item.name}</option>)}</select></label>}
          <label className="field"><span>이름 *</span><input required maxLength={100} value={draft.name} onChange={event => setDraft({ ...draft, name: event.target.value })}/></label>
          <label className="field"><span>이메일 *</span><input required type="email" maxLength={254} autoComplete="off" readOnly={!!draft.id} value={draft.email} onChange={event => setDraft({ ...draft, email: event.target.value })}/></label>
          <label className="field"><span>연락처</span><input type="tel" maxLength={50} value={draft.phone} onChange={event => setDraft({ ...draft, phone: event.target.value })}/></label>
          {!draft.id && <><label className="field"><span>초기 비밀번호 * · 10자 이상</span><input type="password" autoComplete="new-password" required minLength={10} maxLength={128} value={draft.password} onChange={event => setDraft({ ...draft, password: event.target.value })}/></label><p className="field-help">이미 가입된 이메일이면 기존 비밀번호를 사용합니다. 이메일은 자동 발송되지 않습니다.</p></>}
          <div className="form-divider">담당 프로그램 · 여러 개 선택 가능</div>
          <div className="program-checks">{programs.map(program => { const assigned = !!program.instructor_id && program.instructor_id !== draft.instructor_id; return <label className="program-check" key={program.id}><input type="checkbox" disabled={assigned} checked={draft.program_ids.includes(program.id)} onChange={event => setDraft({ ...draft, program_ids: event.target.checked ? [...draft.program_ids, program.id] : draft.program_ids.filter(id => id !== program.id) })}/><span>{program.name}<small>{program.institution?.name}{assigned ? ' · 다른 강사 담당' : ''}</small></span></label> })}{!programs.length && <p className="field-help">프로그램 등록 후 배정할 수 있습니다.</p>}</div>
          <label className="program-check"><input type="checkbox" checked={draft.active} onChange={event => setDraft({ ...draft, active: event.target.checked })}/><span>계정 사용 허용</span></label>
          <p className="field-help">사용을 중지하면 로그인과 학생 자료 열람이 차단됩니다.</p>
        </fieldset><button className="button button-primary full-width" disabled={saving || busy || !loaded}>{saving ? '저장 중…' : draft.id ? '변경 내용 저장' : '강사 등록'}</button></form>
      </aside>
    </div>
    <Notice>{message}</Notice>
  </Workspace>
}
