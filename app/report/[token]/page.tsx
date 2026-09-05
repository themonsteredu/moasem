'use client'

import { useEffect, useState } from 'react'

type Report={language:string;headline:string|null;action_line:string|null;expires_at:string;student:{id:string;name:string;grade:number}|null;learning_log:{lesson_date:string;solved_count:number;wrong_count:number;wrong_type_summary:string|null;weekly_assignment:string|null;video_url:string|null}|null}

const labels={
  ko:{today:'오늘 결과',solved:'푼 문제',wrong:'틀린 문제',type:'어려웠던 유형',week:'이번 주 과제',video:'같이 볼 영상',watch:'영상 보기',grade:(n:number)=>`${n}학년`,expires:'이 링크는 다음 날짜까지 볼 수 있습니다.'},
  vi:{today:'Kết quả hôm nay',solved:'Số bài đã làm',wrong:'Số bài sai',type:'Dạng bài cần luyện thêm',week:'Bài tập tuần này',video:'Video cùng xem',watch:'Xem video',grade:(n:number)=>`Lớp ${n}`,expires:'Liên kết này có thể xem đến ngày'},
  'zh-CN':{today:'今天的学习结果',solved:'完成题数',wrong:'错题数',type:'需要加强的类型',week:'本周作业',video:'一起看的视频',watch:'观看视频',grade:(n:number)=>`${n}年级`,expires:'此链接可查看至'}
}

const koLabels=labels.ko

function SectionTitle({primary,korean,language,number}:{primary:string;korean:string;language:string;number:string}){
  return <h2><span className="guardian-section-number" aria-hidden="true">{number}</span><span>{primary}{language!=='ko'&&<small className="guardian-korean" lang="ko">{korean}</small>}</span></h2>
}

function safeVideoUrl(value:string|null|undefined){
  if(!value)return null
  try{const url=new URL(value);return ['http:','https:'].includes(url.protocol)?url.href:null}catch{return null}
}

export default function ReportPage({params}:{params:{token:string}}){
  const [report,setReport]=useState<Report|null>(null)
  const [error,setError]=useState('')
  useEffect(()=>{
    let active=true
    fetch(`/api/report/${params.token}`,{cache:'no-store'}).then(async response=>{const data=await response.json();if(!response.ok)throw new Error(data.error);if(active)setReport(data.report)}).catch(error=>{if(active)setError(error.message||'불러오지 못했습니다.')})
    return()=>{active=false}
  },[params.token])
  if(error)return <main className="public-state"><span className="eyebrow">MOASEM · 보호자 리포트</span><h1>리포트를 확인할 수 없습니다</h1><p>{error}</p><p>선생님께 리포트 링크를 확인해 주세요.</p></main>
  if(!report)return <main className="public-state" role="status"><span className="eyebrow">MOASEM</span><h1>리포트를 불러오고 있어요</h1><p>잠시만 기다려 주세요.</p></main>
  const language=report.language as keyof typeof labels
  const l=labels[language]??labels.ko
  const log=Array.isArray(report.learning_log)?report.learning_log[0]:report.learning_log
  const student=Array.isArray(report.student)?report.student[0]:report.student
  const grade=student?.grade??0
  const expires=new Date(report.expires_at).toLocaleDateString(language==='vi'?'vi-VN':language==='zh-CN'?'zh-CN':'ko-KR')
  const videoUrl=safeVideoUrl(log?.video_url)
  return <main className="guardian-page" lang={language}>
    <div className="guardian-brand"><strong>MOASEM</strong><span>{log?.lesson_date||''}</span></div>
    <header className="guardian-header"><h1>{student?.name} · {l.grade(grade)}</h1>{language!=='ko'&&<small className="guardian-korean" lang="ko">{student?.name} · {koLabels.grade(grade)}</small>}{report.headline&&<p className="guardian-headline">{report.headline}</p>}</header>
    <section className="guardian-section">
      <SectionTitle number="01" primary={l.today} korean={koLabels.today} language={language}/>
      <div className="guardian-results"><div><small>{l.solved}</small>{language!=='ko'&&<span className="guardian-korean" lang="ko">{koLabels.solved}</span>}<strong>{log?.solved_count??0}</strong></div><div><small>{l.wrong}</small>{language!=='ko'&&<span className="guardian-korean" lang="ko">{koLabels.wrong}</span>}<strong className="wrong-count">{log?.wrong_count??0}</strong></div></div>
      {log?.wrong_type_summary&&<p className="guardian-type"><b>{l.type}{language!=='ko'&&<small className="guardian-korean" lang="ko">{koLabels.type}</small>}</b>{log.wrong_type_summary}</p>}
    </section>
    <section className="guardian-section"><SectionTitle number="02" primary={l.week} korean={koLabels.week} language={language}/><p className="guardian-assignment">{log?.weekly_assignment||'—'}</p></section>
    <section className="guardian-section"><SectionTitle number="03" primary={l.video} korean={koLabels.video} language={language}/>{videoUrl?<a className="guardian-video" href={videoUrl} target="_blank" rel="noopener noreferrer"><svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" aria-hidden="true"><circle cx="12" cy="12" r="10"/><path d="m10 8 6 4-6 4z"/></svg><span>{l.watch}</span><span aria-hidden="true" style={{flex:0}}>↗</span></a>:<p className="guardian-assignment">—</p>}{report.action_line&&<div className="guardian-action">{report.action_line}</div>}</section>
    <p className="guardian-expiry">{l.expires} {expires}{language!=='ko'&&<span className="guardian-korean" lang="ko">{koLabels.expires} {new Date(report.expires_at).toLocaleDateString('ko-KR')}</span>}</p>
  </main>
}
