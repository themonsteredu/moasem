'use client'
import { FormEvent, useEffect, useRef, useState } from 'react'
import { apiFetch, jsonHeaders } from '../../lib/staff-client'
import { languageLabels } from '../../lib/languages'
import { useStaff, useStaffData } from './staff-session'
import { Workspace, Notice } from './workspace'
type Progress = { id: string; lesson_date: string; book: string; unit: string; pages: string; next_assignment: string; learned: string; difficulties: string; teacher_note: string }
type Entry = Partial<Progress> & { id: string; kind: 'progress' | 'result'; lesson_date: string; author?: string; solved_count?: number; wrong_count?: number; wrong_type_summary?: string; weekly_assignment?: string; reports?: { id: string; token: string | null; language: string }[] }
type Data = { student: { name: string; grade: number; program_name: string; institution_name: string; active: boolean }; current: Progress | null; entries: Entry[]; has_more: boolean }
const blank = () => ({ lesson_date: new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Seoul', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date()), book: '', unit: '', pages: '', next_assignment: '', learned: '', difficulties: '', teacher_note: '' })
const fields = { book: '교재명', unit: '단원', pages: '쪽수', learned: '오늘 배운 내용', difficulties: '어려워한 부분', teacher_note: '강사 메모', next_assignment: '다음 과제' } as const
export function StudentProgress({ studentId }: { studentId: string }) {
  const { staff } = useStaff()
  const [data, setData] = useState<Data | null>(null), [form, setForm] = useState(blank)
  const [busy, setBusy] = useState(false), [message, setMessage] = useState(''), [offset, setOffset] = useState(0)
  const [editing, setEditing] = useState(false), [pending, setPending] = useState(false)
  const lock = useRef(false), alive = useRef(true)
  const submission = useRef<{ entry_id: string } & ReturnType<typeof blank> | null>(null)
  useEffect(() => { alive.current = true; return () => { alive.current = false } }, [])
  useStaffData(() => load(0))
  async function load(page: number) {
    setBusy(true)
    try {
      const r = await apiFetch(`/api/admin/students/${studentId}/progress?offset=${page}`), next = await r.json()
      if (!r.ok) throw new Error(next.error)
      if (alive.current) { setData(next); setOffset(page) }
    } catch (error) { if (alive.current) setMessage(error instanceof Error ? error.message : '연결을 확인해 주세요.') }
    finally { if (alive.current) setBusy(false) }
  }
  function start() {
    setForm({ ...blank(), book: data?.current?.book || '', unit: data?.current?.unit || '', pages: data?.current?.pages || '' })
    setMessage(''); setEditing(true)
  }
  async function save(event: FormEvent) {
    event.preventDefault()
    if (lock.current) return
    lock.current = true; setBusy(true); setMessage('')
    const payload = submission.current || { ...form, entry_id: crypto.randomUUID() }
    submission.current = payload; setPending(true)
    try {
      const r = await apiFetch(`/api/admin/students/${studentId}/progress`, { method: 'POST', headers: jsonHeaders, body: JSON.stringify(payload) })
      const result = await r.json()
      if (!r.ok) {
        if (r.status < 500) { submission.current = null; setPending(false) }
        throw new Error(result.error)
      }
      if (!alive.current) return
      submission.current = null; setPending(false); setEditing(false); setForm(blank())
      setMessage('학습기록을 저장했습니다.'); await load(0)
    } catch (error) { if (alive.current) setMessage(submission.current ? '저장 결과를 확인하지 못했습니다. 아래 ‘저장 결과 확인’을 누르면 같은 기록을 중복 없이 확인합니다.' : error instanceof Error ? error.message : '저장하지 못했습니다.') }
    finally { lock.current = false; if (alive.current) setBusy(false) }
  }
  const current = data?.current
  return <Workspace current={staff?.role === 'admin' ? '/' : '/my-students'} title={data ? `${data.student.name} · 개인 학습기록` : '개인 학습기록'} description={data ? `${data.student.grade}학년 · ${data.student.institution_name} · ${data.student.program_name}` : '학생의 학습기록을 불러옵니다.'} action={<a className="button" href={staff?.role === 'admin' ? '/' : '/my-students'}>학생 명단</a>}>
    <Notice>{message}</Notice>
    {!data ? <section className="surface"><p role="status">{busy ? '불러오는 중입니다…' : '학생 정보를 불러오지 못했습니다.'}</p><button className="button" disabled={busy} onClick={() => load(0)}>다시 불러오기</button></section> : <>
      <section className="surface progress-current"><div className="section-heading"><div><span className="eyebrow">현재 진도</span><h2>{current?.book || '첫 진도를 기록해 주세요'}</h2></div><button className="button button-primary" disabled={busy || editing || !data.student.active} onClick={start}>수업 기록 추가</button></div>
        {current ? <><p className="muted">{current.lesson_date} 수업 기준 · {current.unit || '단원 미기록'} · {current.pages ? `${current.pages}쪽` : '쪽수 미기록'}</p><div className="progress-assignment"><strong>다음 과제</strong><p>{current.next_assignment || '등록된 과제가 없습니다.'}</p></div></> : <p>교재와 진도를 기록하면 이곳에 가장 최근 수업 내용이 표시됩니다.</p>}
        {!data.student.active && <p>사용 중지된 학생입니다. 지난 기록만 확인할 수 있습니다.</p>}
      </section>
      {editing && <section className="surface"><h2>수업 기록 추가</h2><p className="muted">강사용 기록입니다. 보호자에게 전달할 내용은 리포트에서 따로 작성합니다. 정정은 새 기록에 남겨 주세요.</p><form onSubmit={save}><fieldset disabled={busy || pending} className="progress-fields"><label className="field"><span>수업 날짜</span><input required type="date" min="2000-01-01" max={blank().lesson_date} value={form.lesson_date} onChange={e => setForm({ ...form, lesson_date: e.target.value })}/></label>{Object.entries(fields).map(([key, label]) => <label className={`field ${['learned','difficulties','teacher_note','next_assignment'].includes(key) ? 'progress-wide' : ''}`} key={key}><span>{label}{key === 'book' ? ' *' : ''}</span>{['book','unit','pages'].includes(key) ? <input required={key === 'book'} maxLength={key === 'pages' ? 100 : 200} value={form[key as keyof typeof fields]} onChange={e => setForm({ ...form, [key]: e.target.value })}/> : <textarea rows={3} maxLength={2000} value={form[key as keyof typeof fields]} onChange={e => setForm({ ...form, [key]: e.target.value })}/>}</label>)}</fieldset><div className="access-controls"><button className="button button-primary" disabled={busy}>{busy ? '처리 중…' : pending ? '저장 결과 확인' : '기록 저장'}</button><button className="button" type="button" disabled={busy || pending} onClick={() => setEditing(false)}>취소</button></div></form></section>}
      <section className="surface"><div className="section-heading"><div><span className="eyebrow">날짜별 기록</span><h2>지난 수업과 학습 결과</h2></div><button className="text-button" disabled={busy} onClick={() => load(0)}>새로고침</button></div><p className="muted">현재 프로그램의 기록을 최신 수업 날짜부터 보여줍니다.</p>
        {!data.entries.length && <p>아직 기록이 없습니다.</p>}
        <div className="progress-history">{data.entries.map(entry => <article key={`${entry.kind}-${entry.id}`}><div className="progress-date"><time>{entry.lesson_date}</time><span className="badge">{entry.kind === 'progress' ? '진도 기록' : '학습 결과'}</span></div><div className="progress-detail">{entry.kind === 'progress' ? <><h3>{entry.book}</h3><p>{[entry.unit, entry.pages ? `${entry.pages}쪽` : ''].filter(Boolean).join(' · ')}</p>{(['learned','difficulties','teacher_note','next_assignment'] as const).map(key => entry[key] && <p key={key}><strong>{fields[key]}</strong>{entry[key]}</p>)}<small>기록: {entry.author}</small></> : <><h3>{entry.solved_count}문제 풀이 · 오답 {entry.wrong_count}개</h3>{entry.wrong_type_summary && <p><strong>오답 유형</strong>{entry.wrong_type_summary}</p>}{entry.weekly_assignment && <p><strong>이번 주 과제</strong>{entry.weekly_assignment}</p>}{entry.teacher_note && <p><strong>강사 메모</strong>{entry.teacher_note}</p>}<div className="access-controls">{entry.reports?.map(report => report.token ? <a key={report.id} className="text-button" target="_blank" rel="noreferrer" href={`/report/${report.token}`}>보호자 리포트 · {languageLabels[report.language as keyof typeof languageLabels] || report.language}</a> : <span key={report.id} className="muted">보호자 리포트 · 링크 사용 종료</span>)}</div></>}</div></article>)}</div>
        <div className="access-controls"><button className="button" disabled={busy || offset === 0} onClick={() => load(Math.max(0, offset - 20))}>이전 기록 페이지</button><span>{Math.floor(offset / 20) + 1}페이지</span><button className="button" disabled={busy || !data.has_more} onClick={() => load(offset + 20)}>다음 기록 페이지</button></div>
      </section>
    </>}
  </Workspace>
}
