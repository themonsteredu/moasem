'use client'

import { useEffect, useMemo, useState } from 'react'

type Institution={id:string;name:string;logo_url:string|null;manager_name:string|null}
type Program={id:string;name:string;starts_on:string;ends_on:string;status:string}
type Student={id:string;name:string;grade:number;program_id:string;student_number:string|null}
type Attendance={student_id:string;program_id:string;session_date:string;session_type:string;status:string}

export default function InstitutionPage({params}:{params:{token:string}}){
  const [institution,setInstitution]=useState<Institution|null>(null)
  const [programs,setPrograms]=useState<Program[]>([])
  const [students,setStudents]=useState<Student[]>([])
  const [attendance,setAttendance]=useState<Attendance[]>([])
  const [error,setError]=useState('')

  useEffect(()=>{fetch(`/api/institution/${params.token}/summary`).then(async r=>{const d=await r.json();if(!r.ok)throw new Error(d.error);setInstitution(d.institution);setPrograms(d.programs??[]);setStudents(d.students??[]);setAttendance(d.attendance??[])}).catch(e=>setError(e.message||'불러오기 실패'))},[params.token])

  const attendanceMap=useMemo(()=>{
    const m=new Map<string,Attendance[]>();attendance.forEach(a=>{const arr=m.get(a.student_id)??[];arr.push(a);m.set(a.student_id,arr)});return m
  },[attendance])
  function rate(studentId:string){const rows=(attendanceMap.get(studentId)??[]).filter(a=>a.session_type==='in_person');if(!rows.length)return '-';const present=rows.filter(a=>a.status==='present'||a.status==='late').length;return `${Math.round(present/rows.length*100)}%`}

  if(error)return <main style={{padding:32,fontFamily:'Arial, Apple SD Gothic Neo, sans-serif'}}>{error}</main>
  if(!institution)return <main style={{padding:32,fontFamily:'Arial, Apple SD Gothic Neo, sans-serif'}}>불러오는 중...</main>

  return <main style={{maxWidth:1180,margin:'0 auto',padding:32,fontFamily:'Arial, Apple SD Gothic Neo, sans-serif',color:'#111827'}}>
    <header style={{display:'flex',justifyContent:'space-between',alignItems:'center',borderBottom:'2px solid #111827',paddingBottom:18,marginBottom:24}}>
      <div><div style={{fontSize:13,color:'#6b7280'}}>MOASEM 기관 담당자 전용</div><h1 style={{margin:'6px 0 0',fontSize:26}}>{institution.name}</h1></div>
      <div style={{fontSize:13,color:'#6b7280'}}>읽기 전용</div>
    </header>
    <section style={{marginBottom:26}}><h2 style={{fontSize:18}}>프로그램 현황</h2><table style={{width:'100%',borderCollapse:'collapse',background:'#fff',border:'1px solid #d1d5db'}}><thead><tr style={{background:'#f3f4f6'}}><th style={{padding:12,textAlign:'left'}}>프로그램</th><th>기간</th><th>학생 수</th><th>상태</th></tr></thead><tbody>{programs.map(p=><tr key={p.id} style={{borderTop:'1px solid #e5e7eb'}}><td style={{padding:12,fontWeight:700}}>{p.name}</td><td style={{textAlign:'center'}}>{p.starts_on} ~ {p.ends_on}</td><td style={{textAlign:'center'}}>{students.filter(s=>s.program_id===p.id).length}명</td><td style={{textAlign:'center'}}>{p.status}</td></tr>)}</tbody></table></section>
    <section><h2 style={{fontSize:18}}>학생 현황</h2><table style={{width:'100%',borderCollapse:'collapse',background:'#fff',border:'1px solid #d1d5db'}}><thead><tr style={{background:'#f3f4f6'}}><th style={{padding:12,textAlign:'left'}}>학생</th><th>학년</th><th>프로그램</th><th>대면 출석률</th><th>이번 주 과제</th><th>오답 요약</th></tr></thead><tbody>{students.map(s=>{const p=programs.find(x=>x.id===s.program_id);return <tr key={s.id} style={{borderTop:'1px solid #e5e7eb'}}><td style={{padding:12,fontWeight:700}}>{s.name}</td><td style={{textAlign:'center'}}>{s.grade}학년</td><td style={{textAlign:'center'}}>{p?.name||'-'}</td><td style={{textAlign:'center'}}>{rate(s.id)}</td><td style={{textAlign:'center',color:'#9ca3af'}}>연결 예정</td><td style={{textAlign:'center',color:'#9ca3af'}}>연결 예정</td></tr>})}</tbody></table><p style={{fontSize:12,color:'#6b7280',marginTop:10}}>※ 과제 제출과 오답 요약은 자동채점 기능 연결 후 표시됩니다.</p></section>
  </main>
}
