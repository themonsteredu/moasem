'use client'
import { FormEvent, useEffect, useRef, useState } from 'react'
import { apiFetch, jsonHeaders } from '@/lib/staff-client'
import { useStaffData } from '../components/staff-session'
import { EmptyState, Notice, StaffAccess, Workspace } from '../components/workspace'
import { HomeworkReview } from '../components/homework-review'

type Program = { id: string; name: string; institution: { name: string } | null }
type Student = { id: string; name: string; grade: number; student_number: string | null }
type Recent = { id: string; title: string; due_on: string; count: number }
const today = () => new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Seoul', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date())
export default function HomeworkPage() {
  const [programs, setPrograms] = useState<Program[]>([]), [programId, setProgramId] = useState('')
  const [students, setStudents] = useState<Student[]>([]), [selected, setSelected] = useState<string[]>([]), [recent, setRecent] = useState<Recent[]>([])
  const [loading, setLoading] = useState(false), [ready, setReady] = useState(false), [busy, setBusy] = useState(false), [uncertain, setUncertain] = useState(false), [message, setMessage] = useState('')
  const [form, setForm] = useState({ title: '', details: '', assigned_on: today(), due_on: today() })
  const [reviewRefresh, setReviewRefresh] = useState(0)
  const revision = useRef(0), pending = useRef<Record<string, unknown> | null>(null), sending = useRef(false)
  useStaffData(loadPrograms)
  useEffect(() => () => { revision.current++ }, [])
  useEffect(() => {
    if (!uncertain) return
    const warn = (e: BeforeUnloadEvent) => { e.preventDefault(); e.returnValue = '' }
    window.addEventListener('beforeunload', warn)
    return () => window.removeEventListener('beforeunload', warn)
  }, [uncertain])
  async function loadPrograms() {
    setLoading(true)
    try { const r = await apiFetch('/api/admin/programs'), d = await r.json(); if (!r.ok) throw Error(d.error); setPrograms(d.items ?? []) }
    catch (e) { setMessage(e instanceof Error ? e.message : '프로그램을 불러오지 못했습니다.') }
    finally { setLoading(false) }
  }
  async function chooseProgram(id: string, clearMessage = true) {
    if (sending.current || pending.current) return
    const seq = ++revision.current
    setReviewRefresh(v => v + 1)
    setProgramId(id); setStudents([]); setSelected([]); setRecent([]); setReady(false)
    if (clearMessage) setMessage('')
    if (!id) { setLoading(false); return }
    setLoading(true)
    try {
      const r = await apiFetch(`/api/admin/homework-batches?program_id=${id}`), d = await r.json()
      if (seq !== revision.current) return
      if (!r.ok) throw Error(d.error)
      setStudents(d.students ?? []); setRecent(d.recent ?? []); setReady(true)
    } catch (e) { if (seq === revision.current) setMessage(e instanceof Error ? e.message : '명단을 불러오지 못했습니다.') }
    finally { if (seq === revision.current) setLoading(false) }
  }
  async function submit(e: FormEvent) {
    e.preventDefault()
    if (sending.current || (!pending.current && (!ready || !selected.length || selected.length > 200))) return
    if (!pending.current) pending.current = { id: crypto.randomUUID(), program_id: programId, student_ids: [...selected].sort(), ...form }
    sending.current = true; setBusy(true); setUncertain(true); setMessage('')
    try {
      const r = await apiFetch('/api/admin/homework-batches', { method: 'POST', headers: jsonHeaders, body: JSON.stringify(pending.current) }), d = await r.json()
      if (!r.ok) {
        if (r.status < 500) { pending.current = null; setUncertain(false) }
        throw Error(d.error || '저장 결과를 확인하지 못했습니다. 같은 내용으로 다시 눌러 주세요.')
      }
      if (!d.batch || !Number.isInteger(d.batch.count)) throw Error('저장 결과를 확인하지 못했습니다. 같은 내용으로 다시 눌러 주세요.')
      pending.current = null; setUncertain(false); setForm(v => ({ ...v, title: '', details: '' }))
      setMessage(`${d.batch.count}명에게 과제를 등록했습니다. 학생 이름을 누르면 개별 과제를 확인할 수 있습니다.`)
      sending.current = false
      await chooseProgram(programId, false)
    } catch (e) { setMessage(e instanceof Error ? e.message : '저장 결과를 확인하지 못했습니다. 같은 내용으로 다시 눌러 주세요.') }
    finally { sending.current = false; setBusy(false) }
  }
  const locked = busy || uncertain
  const allSelected = students.length > 0 && selected.length === students.length
  return <Workspace current="/homework" title="과제 관리" description="제출 현황을 확인하고, 프로그램 학생들에게 과제를 한 번에 내 주세요.">
    <StaffAccess onLoad={() => programId ? chooseProgram(programId) : loadPrograms()} busy={loading || locked}/>
    <section className="surface homework-program"><label className="field"><span>프로그램</span><select disabled={locked} value={programId} onChange={e => void chooseProgram(e.target.value)}><option value="">프로그램 선택</option>{programs.map(p => <option value={p.id} key={p.id}>{p.institution?.name} · {p.name}</option>)}</select></label><p>선택한 프로그램의 과제 확인과 일괄 등록을 이 화면에서 할 수 있습니다.</p></section>
    <HomeworkReview key={programId || 'none'} programId={programId} refresh={reviewRefresh} locked={locked}/>
    <section className="surface bulk-homework">
      <div className="section-heading"><div><span className="eyebrow">새 과제 내기</span><h2>과제 일괄 등록</h2></div><span className="badge">{selected.length}명 선택</span></div>
      <form aria-label="과제 일괄 등록" onSubmit={submit}>
        <fieldset disabled={locked}>
          <div className="bulk-selection-bar"><label><input type="checkbox" aria-label="학생 전체 선택" checked={allSelected} disabled={!ready || !students.length || students.length > 200} onChange={e => setSelected(e.target.checked ? students.map(s => s.id) : [])}/> 전체 선택</label><span>사용 중인 학생만 표시 · 한 번에 최대 200명</span></div>
          {!ready ? <p role="status">{loading ? '명단을 불러오는 중입니다…' : '프로그램을 선택하면 학생이 나타납니다.'}</p> : !students.length ? <EmptyState icon="people" title="과제를 받을 학생이 없습니다" description="학생을 등록하고 사용 상태를 확인해 주세요."/> : <div className="bulk-students">{students.map(s => <label className="bulk-student" key={s.id}><input type="checkbox" aria-label={`${s.name} 선택`} checked={selected.includes(s.id)} disabled={!selected.includes(s.id) && selected.length >= 200} onChange={e => setSelected(v => e.target.checked ? [...v, s.id] : v.filter(id => id !== s.id))}/><span>{s.name}<small>{s.grade}학년{s.student_number ? ` · ${s.student_number}` : ''}</small></span></label>)}</div>}
          <div className="progress-fields"><label className="field"><span>과제명</span><input required maxLength={200} value={form.title} onChange={e => setForm({ ...form, title: e.target.value })} placeholder="예: 분수의 덧셈 연습"/></label><label className="field"><span>시작일</span><input type="date" required value={form.assigned_on} onChange={e => setForm({ ...form, assigned_on: e.target.value })}/></label><label className="field"><span>마감일</span><input type="date" required min={form.assigned_on} value={form.due_on} onChange={e => setForm({ ...form, due_on: e.target.value })}/></label></div>
          <label className="field"><span>교재·쪽수·안내</span><textarea maxLength={2000} value={form.details} onChange={e => setForm({ ...form, details: e.target.value })} placeholder="예: 수학 익힘 20~21쪽을 풀고 사진을 올려 주세요."/></label>
        </fieldset>
        <div className="bulk-save"><p>{uncertain ? '저장 결과를 확인할 때까지 이 화면을 유지해 주세요. 다시 눌러도 같은 요청은 한 번만 등록됩니다.' : `선택한 ${selected.length}명의 학생 화면과 개인 학습기록에 과제가 표시됩니다.`}</p><button className="button button-primary" disabled={busy || (!uncertain && (!ready || !selected.length || loading))}>{busy ? '저장 중…' : uncertain ? '저장 결과 확인' : `${selected.length}명에게 과제 등록`}</button></div>
      </form>
    </section>
    <Notice>{message}</Notice>
    {ready && <section className="surface"><div className="section-heading"><h2>최근 일괄 등록</h2><span className="meta">최근 10건</span></div>{!recent.length ? <p className="bulk-empty">아직 일괄 등록한 과제가 없습니다.</p> : <div className="table-scroll"><table className="data-table"><thead><tr><th>과제</th><th>등록 인원</th><th>마감일</th></tr></thead><tbody>{recent.map(b => <tr key={b.id}><td>{b.title}</td><td>{b.count}명</td><td>{b.due_on}</td></tr>)}</tbody></table></div>}<div className="bulk-student-links">{students.map(s => <a key={s.id} href={`/students/${s.id}`}>{s.name} 과제 확인</a>)}</div></section>}
  </Workspace>
}
