'use client'

import { useRef, useState } from 'react'
import { adminHeaders, useAdminConnection } from '../../lib/use-admin-connection'
import { AdminAccess, EmptyState, Icon, Notice, Workspace } from '../components/workspace'

type Program={id:string;name:string;institution:{id:string;name:string}|null}
type Student={id:string;name:string;grade:number;student_number:string|null;status:string;note:string}
const statuses=[{value:'present',label:'출석'},{value:'absent',label:'결석'},{value:'late',label:'지각'},{value:'excused',label:'인정결석'}]
function localDateString(){const d=new Date();return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`}

export default function AttendancePage(){
  const {adminKey,setAdminKey,headers,rememberKey,forgetKey,disconnect,storageMessage}=useAdminConnection(loadPrograms)
  const [programs,setPrograms]=useState<Program[]>([])
  const [programId,setProgramId]=useState('')
  const [date,setDate]=useState(localDateString())
  const [loadedSelection,setLoadedSelection]=useState('')
  const [students,setStudents]=useState<Student[]>([])
  const [message,setMessage]=useState('')
  const [connected,setConnected]=useState(false)
  const [busy,setBusy]=useState(false)
  const [saving,setSaving]=useState(false)
  const requestVersion=useRef(0)
  const selection=`${programId}:${date}`
  const hasLoaded=loadedSelection===selection
  async function loadPrograms(key=adminKey){
    if(!key)return setMessage('관리 키를 입력해 주세요.')
    setBusy(true)
    try{const response=await fetch('/api/admin/programs',{headers:adminHeaders(key),cache:'no-store'});if(response.status===401){forgetKey();throw new Error('관리 키가 맞지 않거나 변경되었습니다. 다시 연결해 주세요.')}const data=await response.json();if(!response.ok)throw new Error(data.error||'프로그램을 불러오지 못했습니다.');setPrograms(data.items??[]);setConnected(true);rememberKey(key);setMessage('')}
    catch(error){setConnected(false);setPrograms([]);setProgramId('');clearSelection();setMessage(error instanceof Error?error.message:'연결을 확인하고 다시 시도해 주세요.')}
    finally{setBusy(false)}
  }
  function clearSelection(){requestVersion.current+=1;setLoadedSelection('');setStudents([]);setMessage('')}
  async function loadAttendance(){
    if(!programId||!date)return setMessage('프로그램과 수업일을 선택해 주세요.')
    const version=++requestVersion.current
    setBusy(true);setMessage('')
    try{const response=await fetch(`/api/admin/attendance?program_id=${encodeURIComponent(programId)}&session_date=${date}`,{headers,cache:'no-store'});const data=await response.json();if(!response.ok)throw new Error(data.error||'출석을 불러오지 못했습니다.');if(version!==requestVersion.current)return;setStudents(data.items??[]);setLoadedSelection(selection)}
    catch(error){if(version===requestVersion.current)setMessage(error instanceof Error?error.message:'연결을 확인하고 다시 시도해 주세요.')}
    finally{setBusy(false)}
  }
  async function save(){
    if(!hasLoaded||!students.length||saving)return
    setSaving(true);setMessage('')
    try{const response=await fetch('/api/admin/attendance',{method:'POST',headers,body:JSON.stringify({program_id:programId,session_date:date,records:students.map(student=>({student_id:student.id,status:student.status,note:student.note}))})});const data=await response.json();if(!response.ok)throw new Error(data.error||'저장하지 못했습니다.');setMessage('출석을 저장했습니다.')}
    catch(error){setMessage(error instanceof Error?error.message:'연결을 확인하고 다시 저장해 주세요.')}
    finally{setSaving(false)}
  }
  return <Workspace current="/attendance" title="대면 출석" description="수업일의 학생 명단을 확인하고 출석을 기록하세요.">
    <AdminAccess value={adminKey} onChange={setAdminKey} onLoad={loadPrograms} onDisconnect={disconnect} loaded={connected} busy={busy||saving}/>
    <section className="surface">
      <div className="toolbar">
        <label className="field"><span>프로그램</span><select value={programId} disabled={saving} onChange={event=>{clearSelection();setProgramId(event.target.value)}}><option value="">프로그램 선택</option>{programs.map(program=><option key={program.id} value={program.id}>{program.institution?.name} · {program.name}</option>)}</select></label>
        <label className="field"><span>수업일</span><input type="date" value={date} disabled={saving} onChange={event=>{clearSelection();setDate(event.target.value)}}/></label>
        <button className="button button-dark" disabled={busy||saving||!programId} onClick={loadAttendance}><Icon name="people" size={17}/>{busy?'불러오는 중…':'학생 불러오기'}</button>
      </div>
      <div className="section-heading"><h2>학생 출석부</h2><span className="meta">{hasLoaded?`${students.length}명`:'수업을 선택해 주세요'}</span></div>
      {!hasLoaded?<EmptyState icon="attendance" title="오늘 함께할 학생을 불러오세요" description="프로그램과 수업일을 선택하면 출석을 한 번에 기록할 수 있습니다."/>:!students.length?<EmptyState icon="people" title="등록된 학생이 없습니다" description="기관·학생 관리에서 이 프로그램의 학생을 먼저 등록해 주세요."/>:<div className="table-scroll"><table className="data-table attendance-table"><thead><tr><th>학생</th><th>출석 상태</th><th>수업 메모</th></tr></thead><tbody>{students.map(student=><tr key={student.id}><td><span className="table-name">{student.name}</span><small>{student.grade}학년{student.student_number?` · ${student.student_number}`:''}</small></td><td><div className="attendance-choices" role="group" aria-label={`${student.name} 출석 상태`}>{statuses.map(status=><button key={status.value} aria-pressed={student.status===status.value} disabled={saving} className={student.status===status.value?`selected ${status.value}`:''} onClick={()=>setStudents(items=>items.map(item=>item.id===student.id?{...item,status:status.value}:item))}>{status.label}</button>)}</div></td><td><input className="field-note" aria-label={`${student.name} 수업 메모`} value={student.note} disabled={saving} placeholder="선택 입력" onChange={event=>setStudents(items=>items.map(item=>item.id===student.id?{...item,note:event.target.value}:item))}/></td></tr>)}</tbody></table></div>}
      <div className="save-footer"><div>{hasLoaded&&students.length?<div className="attendance-counts">{statuses.map(status=><span key={status.value}>{status.label}<b>{students.filter(student=>student.status===status.value).length}</b></span>)}</div>:<p>출석 상태를 확인한 뒤 저장해 주세요.</p>}</div><button className="button button-primary" disabled={!hasLoaded||!students.length||saving||busy} onClick={save}><Icon name="check" size={17}/>{saving?'저장 중…':'출석 저장'}</button></div>
    </section>
    <Notice>{storageMessage||message}</Notice>
  </Workspace>
}
