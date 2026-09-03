'use client'

import { useEffect, useMemo, useState } from 'react'

type Program={id:string;name:string;institution:{id:string;name:string}|null}
type Student={id:string;name:string;grade:number;student_number:string|null;status:string;note:string}

function localDateString(){
  const d=new Date()
  const y=d.getFullYear()
  const m=String(d.getMonth()+1).padStart(2,'0')
  const day=String(d.getDate()).padStart(2,'0')
  return `${y}-${m}-${day}`
}

export default function AttendancePage(){
  const [adminKey,setAdminKey]=useState('')
  const [programs,setPrograms]=useState<Program[]>([])
  const [programId,setProgramId]=useState('')
  const [loadedProgramId,setLoadedProgramId]=useState('')
  const [date,setDate]=useState(localDateString())
  const [students,setStudents]=useState<Student[]>([])
  const [message,setMessage]=useState('')
  useEffect(()=>{const saved=sessionStorage.getItem('moasem-admin-key');if(saved)setAdminKey(saved)},[])
  const headers=useMemo(()=>({'Content-Type':'application/json','x-moasem-admin-key':adminKey}),[adminKey])

  async function loadPrograms(){
    if(!adminKey)return setMessage('관리 키를 입력하세요.')
    sessionStorage.setItem('moasem-admin-key',adminKey)
    const res=await fetch('/api/admin/programs',{headers})
    const data=await res.json(); if(!res.ok)return setMessage(data.error||'프로그램을 불러오지 못했습니다.')
    setPrograms(data.items??[]); setMessage('')
  }
  function changeProgram(nextId:string){
    setProgramId(nextId)
    setLoadedProgramId('')
    setStudents([])
    setMessage('')
  }
  async function loadAttendance(){
    if(!programId)return setMessage('프로그램을 선택하세요.')
    const res=await fetch(`/api/admin/attendance?program_id=${programId}&session_date=${date}`,{headers})
    const data=await res.json(); if(!res.ok)return setMessage(data.error||'출석을 불러오지 못했습니다.')
    setStudents(data.items??[]); setLoadedProgramId(programId); setMessage('')
  }
  function setStatus(id:string,status:string){setStudents(items=>items.map(x=>x.id===id?{...x,status}:x))}
  async function save(){
    if(!students.length||!loadedProgramId||loadedProgramId!==programId){setMessage('현재 프로그램의 학생을 다시 불러온 뒤 저장하세요.');return}
    const res=await fetch('/api/admin/attendance',{method:'POST',headers,body:JSON.stringify({program_id:loadedProgramId,session_date:date,records:students.map(x=>({student_id:x.id,status:x.status,note:x.note}))})})
    const data=await res.json(); setMessage(res.ok?'출석을 저장했습니다.':data.error||'저장 실패')
  }

  return <main style={{maxWidth:1100,margin:'0 auto',padding:32,fontFamily:'Arial, Apple SD Gothic Neo, sans-serif'}}>
    <div style={{display:'flex',justifyContent:'space-between',gap:16,alignItems:'flex-start',marginBottom:24}}>
      <div><a href="/" style={{color:'#f26522',textDecoration:'none'}}>← 관리자</a><h1 style={{margin:'8px 0 4px'}}>대면 출석</h1><p style={{margin:0,color:'#6b7280'}}>수업일을 선택하고 학생 전체를 한 번에 체크합니다.</p></div>
      <div style={{display:'flex',gap:8}}><input type="password" value={adminKey} onChange={e=>setAdminKey(e.target.value)} placeholder="관리 키" style={{padding:10,border:'1px solid #ddd',borderRadius:10}}/><button onClick={loadPrograms} style={{padding:'10px 14px',border:0,borderRadius:10,background:'#111827',color:'#fff'}}>불러오기</button></div>
    </div>
    <section style={{background:'#fff',border:'1px solid #e5e7eb',borderRadius:16,overflow:'hidden'}}>
      <div style={{display:'flex',gap:10,padding:18,borderBottom:'1px solid #eee',flexWrap:'wrap'}}>
        <select value={programId} onChange={e=>changeProgram(e.target.value)} style={{padding:10,border:'1px solid #ddd',borderRadius:10,minWidth:280}}><option value="">프로그램 선택</option>{programs.map(p=><option key={p.id} value={p.id}>{p.institution?.name} · {p.name}</option>)}</select>
        <input type="date" value={date} onChange={e=>{setDate(e.target.value);setLoadedProgramId('');setStudents([])}} style={{padding:10,border:'1px solid #ddd',borderRadius:10}}/>
        <button onClick={loadAttendance} style={{padding:'10px 14px',border:0,borderRadius:10,background:'#f26522',color:'#fff'}}>학생 불러오기</button>
      </div>
      <div style={{overflowX:'auto'}}><table style={{width:'100%',borderCollapse:'collapse',minWidth:720}}><thead><tr style={{background:'#fafafa'}}><th style={{textAlign:'left',padding:14}}>학생</th><th>학년</th><th>출석</th><th>비고</th></tr></thead><tbody>{students.map(s=><tr key={s.id} style={{borderTop:'1px solid #eee'}}><td style={{padding:14,fontWeight:700}}>{s.name}</td><td style={{textAlign:'center'}}>{s.grade}학년</td><td style={{textAlign:'center'}}>{['present','absent','late','excused'].map(v=><button key={v} onClick={()=>setStatus(s.id,v)} style={{margin:3,padding:'8px 10px',borderRadius:999,border:s.status===v?'1px solid #f26522':'1px solid #ddd',background:s.status===v?'#fff7ed':'#fff'}}>{v==='present'?'출석':v==='absent'?'결석':v==='late'?'지각':'인정결석'}</button>)}</td><td><input value={s.note} onChange={e=>setStudents(items=>items.map(x=>x.id===s.id?{...x,note:e.target.value}:x))} style={{padding:8,border:'1px solid #ddd',borderRadius:8}}/></td></tr>)}</tbody></table></div>
      <div style={{padding:18,textAlign:'right'}}><button onClick={save} disabled={!students.length||loadedProgramId!==programId} style={{padding:'11px 18px',border:0,borderRadius:10,background:'#f26522',color:'#fff',fontWeight:700,opacity:!students.length||loadedProgramId!==programId?.55:1}}>출석 저장</button></div>
    </section>
    {message&&<p style={{marginTop:16,color:'#9a3412'}}>{message}</p>}
  </main>
}
