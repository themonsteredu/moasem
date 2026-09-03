'use client'

import { useEffect, useState } from 'react'

type Report={language:string;headline:string|null;action_line:string|null;expires_at:string;student:{id:string;name:string;grade:number}|null;learning_log:{lesson_date:string;solved_count:number;wrong_count:number;wrong_type_summary:string|null;weekly_assignment:string|null;video_url:string|null}|null}

const labels={
  ko:{today:'오늘 결과',solved:'푼 문제',wrong:'틀린 문제',type:'어려웠던 유형',week:'이번 주 과제',video:'같이 볼 영상',watch:'영상 보기',grade:(n:number)=>`${n}학년`,expires:'이 링크는 다음 날짜까지 볼 수 있습니다.'},
  vi:{today:'Kết quả hôm nay',solved:'Số bài đã làm',wrong:'Số bài sai',type:'Dạng bài cần luyện thêm',week:'Bài tập tuần này',video:'Video cùng xem',watch:'Xem video',grade:(n:number)=>`Lớp ${n}`,expires:'Liên kết này có thể xem đến ngày'},
  'zh-CN':{today:'今天的学习结果',solved:'完成题数',wrong:'错题数',type:'需要加强的类型',week:'本周作业',video:'一起看的视频',watch:'观看视频',grade:(n:number)=>`${n}年级`,expires:'此链接可查看至'}
}

const koLabels=labels.ko

function SectionTitle({primary,korean,language}:{primary:string;korean:string;language:string}){
  return <h2 style={{fontSize:18,marginBottom:12}}>{primary}{language!=='ko'&&<small style={{display:'block',fontSize:12,fontWeight:500,color:'#9ca3af',marginTop:4}}>{korean}</small>}</h2>
}

export default function ReportPage({params}:{params:{token:string}}){
  const [report,setReport]=useState<Report|null>(null)
  const [error,setError]=useState('')

  useEffect(()=>{
    fetch(`/api/report/${params.token}`,{cache:'no-store'})
      .then(async r=>{const d=await r.json();if(!r.ok)throw new Error(d.error);setReport(d.report)})
      .catch(e=>setError(e.message||'불러오기 실패'))
  },[params.token])

  if(error)return <main style={{padding:28,fontFamily:'Arial, Apple SD Gothic Neo, sans-serif'}}>{error}</main>
  if(!report)return <main style={{padding:28,fontFamily:'Arial, Apple SD Gothic Neo, sans-serif'}}>불러오는 중...</main>

  const language=report.language as keyof typeof labels
  const l=labels[language]??labels.ko
  const log=Array.isArray(report.learning_log)?report.learning_log[0]:report.learning_log
  const grade=report.student?.grade??0
  const expires=new Date(report.expires_at).toLocaleDateString(language==='vi'?'vi-VN':language==='zh-CN'?'zh-CN':'ko-KR')

  return <main style={{maxWidth:560,margin:'0 auto',padding:'28px 20px',fontFamily:'Arial, Apple SD Gothic Neo, sans-serif',color:'#111827'}}>
    <div style={{fontSize:13,color:'#f26522',fontWeight:700}}>MOASEM</div>
    <h1 style={{fontSize:28,margin:'8px 0'}}>{report.student?.name} · {l.grade(grade)}</h1>
    {language!=='ko'&&<div style={{fontSize:12,color:'#9ca3af'}}>{report.student?.name} · {koLabels.grade(grade)}</div>}
    {report.headline&&<p style={{fontSize:21,lineHeight:1.55,fontWeight:700,margin:'18px 0 28px'}}>{report.headline}</p>}

    <section style={{borderTop:'2px solid #111827',paddingTop:18}}>
      <SectionTitle primary={l.today} korean={koLabels.today} language={language}/>
      <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:10}}>
        <div style={{padding:16,background:'#f7f8fa',borderRadius:12}}><small>{l.solved}{language!=='ko'&&<span style={{display:'block',color:'#9ca3af',marginTop:3}}>{koLabels.solved}</span>}</small><div style={{fontSize:26,fontWeight:800,marginTop:5}}>{log?.solved_count??0}</div></div>
        <div style={{padding:16,background:'#f7f8fa',borderRadius:12}}><small>{l.wrong}{language!=='ko'&&<span style={{display:'block',color:'#9ca3af',marginTop:3}}>{koLabels.wrong}</span>}</small><div style={{fontSize:26,fontWeight:800,marginTop:5}}>{log?.wrong_count??0}</div></div>
      </div>
      {log?.wrong_type_summary&&<p style={{fontSize:17,lineHeight:1.6}}><b>{l.type}</b>{language!=='ko'&&<small style={{display:'block',fontSize:12,color:'#9ca3af'}}>{koLabels.type}</small>}<br/>{log.wrong_type_summary}</p>}
    </section>

    <section style={{borderTop:'1px solid #d1d5db',marginTop:22,paddingTop:18}}><SectionTitle primary={l.week} korean={koLabels.week} language={language}/><p style={{fontSize:18,lineHeight:1.6}}>{log?.weekly_assignment||'-'}</p></section>
    <section style={{borderTop:'1px solid #d1d5db',marginTop:22,paddingTop:18}}><SectionTitle primary={l.video} korean={koLabels.video} language={language}/>{log?.video_url?<a href={log.video_url} target="_blank" rel="noreferrer" style={{display:'block',textAlign:'center',padding:14,borderRadius:12,background:'#f26522',color:'#fff',fontWeight:700,textDecoration:'none'}}>{l.watch}</a>:<p>-</p>}</section>
    {report.action_line&&<div style={{marginTop:26,padding:18,border:'1px solid #f5c7ad',background:'#fff8f3',borderRadius:14,fontSize:18,lineHeight:1.6}}>{report.action_line}</div>}
    <p style={{marginTop:28,fontSize:12,color:'#9ca3af'}}>{l.expires} {expires}{language!=='ko'&&<span style={{display:'block',marginTop:4}}>{koLabels.expires} {new Date(report.expires_at).toLocaleDateString('ko-KR')}</span>}</p>
  </main>
}
