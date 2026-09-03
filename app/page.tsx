'use client'

import { FormEvent, useEffect, useMemo, useState } from 'react'

type Institution={id:string;name:string;manager_name:string|null;manager_phone:string|null;manager_notifications_enabled:boolean;portal_token:string|null}
type Program={id:string;name:string;starts_on:string;ends_on:string;week_count:number;status:string;institution:{id:string;name:string}|null;instructor:{id:string;name:string}|null}
type Student={id:string;name:string;grade:number;student_number:string|null;program:{id:string;name:string;institution:{id:string;name:string}|null}|null;guardian:{id:string;name:string|null;phone:string;language:string}|null}

type Tab='institutions'|'programs'|'students'

const langLabel:Record<string,string>={ko:'한국어',vi:'베트남어','zh-CN':'중국어 간체'}

export default function Home(){
  const [tab,setTab]=useState<Tab>('institutions')
  const [adminKey,setAdminKey]=useState('')
  const [institutions,setInstitutions]=useState<Institution[]>([])
  const [programs,setPrograms]=useState<Program[]>([])
  const [students,setStudents]=useState<Student[]>([])
  const [message,setMessage]=useState('관리 키를 입력한 뒤 새로고침 버튼을 눌러주세요.')

  useEffect(()=>{const saved=sessionStorage.getItem('moasem-admin-key');if(saved)setAdminKey(saved)},[])
  const headers=useMemo(()=>({'Content-Type':'application/json','x-moasem-admin-key':adminKey}),[adminKey])

  async function loadAll(){
    if(!adminKey){setMessage('관리 키를 먼저 입력하세요.');return}
    sessionStorage.setItem('moasem-admin-key',adminKey)
    try{
      const [a,b,c]=await Promise.all([
        fetch('/api/admin/institutions',{headers}),fetch('/api/admin/programs',{headers}),fetch('/api/admin/students',{headers})
      ])
      if(!a.ok||!b.ok||!c.ok)throw new Error()
      const [ia,pa,sa]=await Promise.all([a.json(),b.json(),c.json()])
      setInstitutions(ia.items??[]);setPrograms(pa.items??[]);setStudents(sa.items??[]);setMessage('')
    }catch{setMessage('데이터를 불러오지 못했습니다. 관리 키와 환경변수를 확인하세요.')}
  }

  async function post(url:string,payload:unknown){
    const res=await fetch(url,{method:'POST',headers,body:JSON.stringify(payload)})
    const data=await res.json()
    if(!res.ok)throw new Error(data.error||'저장하지 못했습니다.')
    await loadAll()
  }

  async function addInstitution(e:FormEvent<HTMLFormElement>){
    e.preventDefault();const f=new FormData(e.currentTarget)
    try{await post('/api/admin/institutions',{name:f.get('name'),manager_name:f.get('manager_name'),manager_phone:f.get('manager_phone'),manager_notifications_enabled:true});e.currentTarget.reset();setMessage('기관을 등록했습니다.')}catch(err){setMessage(err instanceof Error?err.message:'기관 등록 실패')}
  }

  async function addProgram(e:FormEvent<HTMLFormElement>){
    e.preventDefault();const f=new FormData(e.currentTarget)
    try{await post('/api/admin/programs',{institution_id:f.get('institution_id'),name:f.get('name'),starts_on:f.get('starts_on'),ends_on:f.get('ends_on'),week_count:Number(f.get('week_count')),instructor_name:f.get('instructor_name'),in_person_weekdays:String(f.get('in_person_weekdays')||'').split(',').map(v=>v.trim()).filter(Boolean),zoom_weekdays:String(f.get('zoom_weekdays')||'').split(',').map(v=>v.trim()).filter(Boolean),zoom_meeting_number:f.get('zoom_meeting_number'),zoom_password:f.get('zoom_password')});e.currentTarget.reset();setMessage('프로그램을 만들었습니다.')}catch(err){setMessage(err instanceof Error?err.message:'프로그램 생성 실패')}
  }

  async function addStudent(e:FormEvent<HTMLFormElement>){
    e.preventDefault();const f=new FormData(e.currentTarget)
    try{await post('/api/admin/students',{program_id:f.get('program_id'),name:f.get('name'),grade:Number(f.get('grade')),student_number:f.get('student_number'),guardian_name:f.get('guardian_name'),guardian_phone:f.get('guardian_phone'),guardian_language:f.get('guardian_language')});e.currentTarget.reset();setMessage('학생과 보호자를 등록했습니다.')}catch(err){setMessage(err instanceof Error?err.message:'학생 등록 실패')}
  }

  async function copyPortal(token:string){
    const url=`${window.location.origin}/institution/${token}`
    await navigator.clipboard.writeText(url)
    setMessage('기관 담당자용 링크를 복사했습니다.')
  }

  return <div className="shell">
    <aside className="sidebar">
      <div className="brand">MOASEM<small>기관 위탁 수학 학습관리</small></div>
      <div className="nav">
        <button className="active">대시보드</button>
        <button onClick={()=>setTab('institutions')}>기관</button>
        <button onClick={()=>setTab('programs')}>프로그램</button>
        <button onClick={()=>setTab('students')}>학생</button>
        <button onClick={()=>window.location.href='/attendance'}>출석</button>
        <button onClick={()=>window.location.href='/reports'}>보호자 리포트</button>
        <button>영상</button>
        <button>설정</button>
      </div>
    </aside>
    <main className="main">
      <div className="topbar">
        <div><h1>운영 대시보드</h1><p>기관 → 프로그램 → 학생 → 보호자를 한 곳에서 관리합니다.</p></div>
        <div className="keybox"><input type="password" value={adminKey} onChange={e=>setAdminKey(e.target.value)} placeholder="테스트용 관리자 키"/><button onClick={loadAll}>새로고침</button></div>
      </div>
      <div className="grid">
        <section className="panel">
          <div className="panelhead"><h2>운영 현황</h2><div className="tabs"><button className={tab==='institutions'?'active':''} onClick={()=>setTab('institutions')}>기관 {institutions.length}</button><button className={tab==='programs'?'active':''} onClick={()=>setTab('programs')}>프로그램 {programs.length}</button><button className={tab==='students'?'active':''} onClick={()=>setTab('students')}>학생 {students.length}</button></div></div>
          <div className="tablewrap">
            {tab==='institutions'&&<table className="table"><thead><tr><th>기관</th><th>담당자</th><th>연락처</th><th>알림</th><th>기관 링크</th></tr></thead><tbody>{institutions.map(x=><tr key={x.id}><td><b>{x.name}</b></td><td>{x.manager_name||'-'}</td><td>{x.manager_phone||'-'}</td><td><span className="status">{x.manager_notifications_enabled?'수신':'미수신'}</span></td><td>{x.portal_token?<button className="secondary" onClick={()=>copyPortal(x.portal_token!)}>링크 복사</button>:<span className="muted">DB 적용 후 생성</span>}</td></tr>)}</tbody></table>}
            {tab==='programs'&&<table className="table"><thead><tr><th>기관</th><th>프로그램</th><th>기간</th><th>강사</th><th>상태</th></tr></thead><tbody>{programs.map(x=><tr key={x.id}><td>{x.institution?.name||'-'}</td><td><b>{x.name}</b></td><td>{x.starts_on} ~ {x.ends_on}</td><td>{x.instructor?.name||'-'}</td><td><span className="status">{x.status}</span></td></tr>)}</tbody></table>}
            {tab==='students'&&<table className="table"><thead><tr><th>기관</th><th>프로그램</th><th>학생</th><th>학년</th><th>보호자 언어</th><th>연락처</th></tr></thead><tbody>{students.map(x=><tr key={x.id}><td>{x.program?.institution?.name||'-'}</td><td>{x.program?.name||'-'}</td><td><b>{x.name}</b></td><td>{x.grade}학년</td><td>{langLabel[x.guardian?.language||'ko']}</td><td>{x.guardian?.phone||'-'}</td></tr>)}</tbody></table>}
            {((tab==='institutions'&&!institutions.length)||(tab==='programs'&&!programs.length)||(tab==='students'&&!students.length))&&<div className="empty">아직 등록된 데이터가 없습니다.</div>}
          </div>
        </section>
        <aside className="panel">
          <div className="panelhead"><h2>{tab==='institutions'?'기관 등록':tab==='programs'?'프로그램 만들기':'학생 · 보호자 등록'}</h2></div>
          {tab==='institutions'&&<form className="form" onSubmit={addInstitution}><div className="field"><label>기관명 *</label><input name="name" required placeholder="예: 광주○○가족센터"/></div><div className="field"><label>담당자</label><input name="manager_name" placeholder="담당자 이름"/></div><div className="field"><label>연락처</label><input name="manager_phone" placeholder="010-0000-0000"/></div><button className="primary">기관 등록</button></form>}
          {tab==='programs'&&<form className="form" onSubmit={addProgram}><div className="field"><label>기관 *</label><select name="institution_id" required><option value="">선택</option>{institutions.map(x=><option key={x.id} value={x.id}>{x.name}</option>)}</select></div><div className="field"><label>프로그램명 *</label><input name="name" required placeholder="다문화 초등 수학 1기"/></div><div className="row2"><div className="field"><label>시작일 *</label><input type="date" name="starts_on" required/></div><div className="field"><label>종료일 *</label><input type="date" name="ends_on" required/></div></div><div className="row2"><div className="field"><label>주차 수 *</label><input type="number" name="week_count" min="1" required/></div><div className="field"><label>담당 강사</label><input name="instructor_name"/></div></div><div className="field"><label>대면 요일</label><input name="in_person_weekdays" placeholder="예: 화"/></div><div className="field"><label>Zoom 요일</label><input name="zoom_weekdays" placeholder="예: 목, 토"/></div><div className="field"><label>Zoom 회의 번호</label><input name="zoom_meeting_number"/></div><div className="field"><label>Zoom 암호</label><input name="zoom_password"/></div><button className="primary">프로그램 만들기</button></form>}
          {tab==='students'&&<form className="form" onSubmit={addStudent}><div className="field"><label>프로그램 *</label><select name="program_id" required><option value="">선택</option>{programs.map(x=><option key={x.id} value={x.id}>{x.institution?.name} · {x.name}</option>)}</select></div><div className="row2"><div className="field"><label>학생 이름 *</label><input name="name" required/></div><div className="field"><label>학년 *</label><select name="grade" required>{[1,2,3,4,5,6,7,8,9,10,11,12].map(n=><option key={n} value={n}>{n}학년</option>)}</select></div></div><div className="field"><label>학생 번호</label><input name="student_number" placeholder="선택 입력"/></div><div className="field"><label>보호자 이름</label><input name="guardian_name"/></div><div className="field"><label>보호자 연락처 *</label><input name="guardian_phone" required/></div><div className="field"><label>보호자 언어 *</label><select name="guardian_language" defaultValue="ko"><option value="ko">한국어</option><option value="vi">베트남어</option><option value="zh-CN">중국어 간체</option></select></div><button className="primary">학생 · 보호자 등록</button></form>}
          <p className="help" style={{padding:'0 20px 20px'}}>출석과 보호자 리포트는 왼쪽 메뉴에서 바로 사용할 수 있습니다. 과제 사진 자동채점은 후속 단계에서 연결합니다.</p>
        </aside>
      </div>
      {message&&<div className="message">{message}</div>}
    </main>
  </div>
}
