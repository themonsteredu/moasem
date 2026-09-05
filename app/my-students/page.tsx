'use client'

import { useState } from 'react'
import { apiFetch } from '../../lib/staff-client'
import { useStaffData } from '../components/staff-session'
import { EmptyState, Notice, StaffAccess, Workspace } from '../components/workspace'

type Program = { id: string; name: string; institution: { name: string } | null }
type Student = { id: string; name: string; grade: number; student_number: string | null; program: Program; guardian: { language: string } | null }
const languages: Record<string, string> = { ko: '한국어', vi: '베트남어', 'zh-CN': '중국어 간체' }
export default function MyStudentsPage() {
  const [programs, setPrograms] = useState<Program[]>([])
  const [students, setStudents] = useState<Student[]>([])
  const [programId, setProgramId] = useState('')
  const [busy, setBusy] = useState(false)
  const [loaded, setLoaded] = useState(false)
  const [message, setMessage] = useState('')
  useStaffData(load)
  async function load() {
    setBusy(true); setMessage('')
    try {
      const responses = await Promise.all([apiFetch('/api/admin/programs'), apiFetch('/api/admin/students')])
      if (responses.some(response => !response.ok)) throw new Error('담당 학생을 불러오지 못했습니다. 다시 시도해 주세요.')
      const [p, s] = await Promise.all(responses.map(response => response.json()))
      setPrograms(p.items ?? []); setStudents(s.items ?? []); setLoaded(true)
    } catch (error) { setPrograms([]); setStudents([]); setLoaded(false); setMessage(error instanceof Error ? error.message : '연결을 확인해 주세요.') }
    finally { setBusy(false) }
  }
  const visible = students.filter(student => !programId || student.program?.id === programId)
  return <Workspace current="/my-students" title="내 학생" description="담당 프로그램의 학생을 확인하고 수업을 준비하세요." action={<div className="access-controls"><a className="button" href="/attendance">대면 출석</a><a className="button button-primary" href="/reports">리포트 작성</a></div>}>
    <StaffAccess onLoad={load} busy={busy}/>
    <section className="surface">
      <div className="section-heading"><div><span className="eyebrow">함께하는 수업</span><h2>{loaded ? `담당 프로그램 ${programs.length}개 · 학생 ${students.length}명` : '담당 학생을 불러옵니다'}</h2></div></div>
      <div className="toolbar"><label className="field"><span>프로그램</span><select value={programId} onChange={event => setProgramId(event.target.value)}><option value="">전체 담당 프로그램</option>{programs.map(program => <option key={program.id} value={program.id}>{program.institution?.name} · {program.name}</option>)}</select></label></div>
      {!visible.length ? <EmptyState icon="people" title={loaded ? '아직 담당 학생이 없습니다' : '명단을 불러오는 중입니다'} description="관리자가 프로그램을 배정하고 학생을 등록하면 여기에 표시됩니다."/> : <div className="table-scroll"><table className="data-table"><thead><tr><th>학생</th><th>프로그램·기관</th><th>보호자 안내 언어</th></tr></thead><tbody>{visible.map(student => <tr key={student.id}><td><span className="table-name">{student.name}</span><small>{student.grade}학년{student.student_number ? ` · ${student.student_number}` : ''}</small></td><td>{student.program?.name}<small>{student.program?.institution?.name}</small></td><td><span className="badge">{languages[student.guardian?.language || 'ko']}</span></td></tr>)}</tbody></table></div>}
    </section><Notice>{message}</Notice>
  </Workspace>
}
