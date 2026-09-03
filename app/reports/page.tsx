'use client'

import { FormEvent, useEffect, useMemo, useState } from 'react'

type Student={id:string;name:string;grade:number;program:{id:string;name:string;institution:{id:string;name:string}|null}|null;guardian:{id:string;name:string|null;phone:string;language:string}|null}

function localDate(){const d=new Date();const y=d.getFullYear();const m=String(d.getMonth()+1).padStart(2,'0');const day=String(d.getDate()).padStart(2,'0');return `${y}-${m}-${day}`}

export default function ReportsPage(){
  const [adminKey,setAdminKey]=useState('')
  const [students,setStudents]=useState<Student[]>([])
  const [message,setMessage]=useState('')
  const [reportUrl,setReportUrl]=useState('')
  useEffect(()=>{const saved=sessionStorage.getItem('moasem-admin-key');if(saved)setAdminKey(saved)},[])
  const headers=useMemo(()=>({'Content-Type':'application/json','x-moasem-admin-key':adminKey}),[adminKey])

  async function loadStudents(){
    if(!adminKey)return setMessage('관리 키를 입력하세요.')
    sessionStorage.setItem('moasem-admin-key',adminKey)
    const r=await fetch('/api/admin/students',{headers});const d=await r.json();if(!r.ok)return setMessage(d.error||'학생을 불러오지 못했습니다.');setStudents(d.items??[]);setMessage('')
  }

  async function submit(e:FormEvent<HTMLFormElement>){
    e.preventDefault();const f=new FormData(e.currentTarget)
    const r=await fetch('/api/admin/learning-reports',{method:'POST',headers,body:JSON.stringify({student_id:f.get('student_id'),lesson_date:f.get('lesson_date'),solved_count:Number(f.get('solved_count')),wrong_count:Number(f.get('wrong_count')),wrong_type_summary:f.get('wrong_type_summary'),weekly_assignment:f.get('weekly_assignment'),video_url:f.get('video_url'),teacher_note:f.get('teacher_note'),headline:f.get('headline'),action_line:f.get('action_line'),language:f.get('language')})})
    const d=await r.json();if(!r.ok)return setMessage(d.error||'리포트 생성 실패')
    const url=`${location.origin}/report/${d.token}`;setReportUrl(url);setMessage('보호자용 리포트 링크를 만들었습니다.')
  }

  return <main style={{maxWidth:920,margin:'0 auto',padding:32,fontFamily:'Arial, Apple SD Gothic Neo, sans-serif',color:'#111827'}}>
    <a href="/" style={{color:'#f26522',textDecoration:'none'}}>← 관리자</a>
    <h1 style={{margin:'10px 0 4px'}}>보호자 리포트 만들기</h1><p style={{color:'#6b7280'}}>자동채점 전에는 강사가 결과를 직접 입력합니다.</p>
    <div style={{display:'flex',gap:8,margin:'20px 0'}}><input type="password" value={adminKey} onChange={e=>setAdminKey(e.target.value)} placeholder="관리 키" style={{padding:10,border:'1px solid #ddd',borderRadius:10,flex:1}}/><button onClick={loadStudents} style={{padding:'10px 14px',border:0,borderRadius:10,background:'#111827',color:'#fff'}}>학생 불러오기</button></div>
    <form onSubmit={submit} style={{background:'#fff',border:'1px solid #e5e7eb',borderRadius:16,padding:22,display:'grid',gap:14}}>
      <label>학생<select name="student_id" required style={{display:'block',width:'100%',padding:11,marginTop:6,border:'1px solid #ddd',borderRadius:10}}><option value="">선택</option>{students.map(s=><option key={s.id} value={s.id}>{s.program?.institution?.name} · {s.program?.name} · {s.name}</option>)}</select></label>
      <div style={{display:'grid',gridTemplateColumns:'1fr 1fr 1fr',gap:10}}><label>수업일<input type="date" name="lesson_date" defaultValue={localDate()} required style={{display:'block',width:'100%',padding:10,marginTop:6}}/></label><label>푼 문제 수<input type="number" min="0" name="solved_count" defaultValue="0" style={{display:'block',width:'100%',padding:10,marginTop:6}}/></label><label>틀린 수<input type="number" min="0" name="wrong_count" defaultValue="0" style={{display:'block',width:'100%',padding:10,marginTop:6}}/></label></div>
      <label>오답 유형 요약<input name="wrong_type_summary" placeholder="예: 받아올림, 분수 크기 비교" style={{display:'block',width:'100%',padding:11,marginTop:6}}/></label>
      <label>이번 주 과제<input name="weekly_assignment" placeholder="예: 교재 24~27쪽" style={{display:'block',width:'100%',padding:11,marginTop:6}}/></label>
      <label>같이 볼 영상 URL<input name="video_url" placeholder="https://..." style={{display:'block',width:'100%',padding:11,marginTop:6}}/></label>
      <label>보호자 언어<select name="language" defaultValue="ko" style={{display:'block',width:'100%',padding:11,marginTop:6}}><option value="ko">한국어</option><option value="vi">베트남어</option><option value="zh-CN">중국어 간체</option></select></label>
      <label>오늘 한 줄<input name="headline" placeholder="예: 오늘은 분수 덧셈을 연습했어요." style={{display:'block',width:'100%',padding:11,marginTop:6}}/></label>
      <label>보호자 행동 안내<input name="action_line" placeholder="예: 아이와 함께 아래 영상을 한 번 봐주세요." style={{display:'block',width:'100%',padding:11,marginTop:6}}/></label>
      <label>강사 메모<textarea name="teacher_note" rows={3} style={{display:'block',width:'100%',padding:11,marginTop:6}}/></label>
      <button style={{padding:'12px 16px',border:0,borderRadius:10,background:'#f26522',color:'#fff',fontWeight:700}}>리포트 링크 만들기</button>
    </form>
    {message&&<p style={{color:'#9a3412'}}>{message}</p>}
    {reportUrl&&<div style={{marginTop:14,padding:14,background:'#fff7ed',borderRadius:12}}><b>보호자 링크</b><div style={{wordBreak:'break-all',marginTop:6}}>{reportUrl}</div><button onClick={()=>navigator.clipboard.writeText(reportUrl)} style={{marginTop:10,padding:'8px 12px'}}>복사</button></div>}
  </main>
}
