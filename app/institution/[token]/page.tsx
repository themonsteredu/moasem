'use client'

import Image from 'next/image'
import { useEffect, useMemo, useState } from 'react'
import { EmptyState } from '../../components/workspace'

type Institution={id:string;name:string;logo_url:string|null;manager_name:string|null}
type Program={id:string;name:string;starts_on:string;ends_on:string;status:string}
type Student={id:string;name:string;grade:number;program_id:string;student_number:string|null}
type Attendance={student_id:string;program_id:string;session_date:string;session_type:string;status:string}
const statusLabel:Record<string,string>={active:'진행 중',planned:'예정',completed:'종료',draft:'준비 중',ended:'종료',paused:'일시 중지'}

export default function InstitutionPage({params}:{params:{token:string}}){
  const [institution,setInstitution]=useState<Institution|null>(null)
  const [programs,setPrograms]=useState<Program[]>([])
  const [students,setStudents]=useState<Student[]>([])
  const [attendance,setAttendance]=useState<Attendance[]>([])
  const [error,setError]=useState('')
  useEffect(()=>{let active=true;fetch(`/api/institution/${params.token}/summary`,{cache:'no-store'}).then(async response=>{const data=await response.json();if(!response.ok)throw new Error(data.error);if(!active)return;setInstitution(data.institution);setPrograms(data.programs??[]);setStudents(data.students??[]);setAttendance(data.attendance??[])}).catch(error=>{if(active)setError(error.message||'불러오지 못했습니다.')});return()=>{active=false}},[params.token])
  const attendanceMap=useMemo(()=>{const map=new Map<string,Attendance[]>();attendance.forEach(item=>{const rows=map.get(item.student_id)??[];rows.push(item);map.set(item.student_id,rows)});return map},[attendance])
  function rate(id:string){const rows=(attendanceMap.get(id)??[]).filter(item=>item.session_type==='in_person');if(!rows.length)return '기록 없음';return `${Math.round(rows.filter(item=>item.status==='present'||item.status==='late').length/rows.length*100)}%`}
  if(error)return <main className="public-state"><span className="eyebrow">MOASEM · 기관 담당자</span><h1>현황을 확인할 수 없습니다</h1><p>{error}</p><p>운영 담당자에게 조회 링크를 확인해 주세요.</p></main>
  if(!institution)return <main className="public-state" role="status"><span className="eyebrow">MOASEM</span><h1>기관 현황을 불러오고 있어요</h1><p>잠시만 기다려 주세요.</p></main>
  return <main className="institution-page">
    <header className="institution-header"><div className="institution-title">{institution.logo_url&&<Image src={institution.logo_url} alt={`${institution.name} 로고`} width={80} height={56} unoptimized/>}<div><span className="eyebrow">MOASEM · 수학 학습관리 운영 현황</span><h1>{institution.name}</h1></div></div><span className="badge">담당자 조회 전용</span></header>
    <div className="institution-summary"><div><small>운영 프로그램</small><strong>{programs.length}</strong></div><div><small>참여 학생</small><strong>{students.length}</strong></div><div><small>담당자</small><span>{institution.manager_name||'미등록'}</span></div></div>
    <section><h2>01. 프로그램 현황</h2>{!programs.length?<EmptyState title="등록된 프로그램이 없습니다" description="프로그램이 등록되면 수업 기간과 참여 학생 수가 표시됩니다."/>:<div className="table-scroll"><table className="data-table"><thead><tr><th>프로그램</th><th>운영 기간</th><th>학생 수</th><th>상태</th></tr></thead><tbody>{programs.map(program=><tr key={program.id}><td><span className="table-name">{program.name}</span></td><td>{program.starts_on} ~ {program.ends_on}</td><td>{students.filter(student=>student.program_id===program.id).length}명</td><td><span className={`badge ${program.status==='active'?'badge-green':''}`}>{statusLabel[program.status]||program.status}</span></td></tr>)}</tbody></table></div>}</section>
    <section><h2>02. 학생별 학습 현황</h2>{!students.length?<EmptyState title="등록된 학생이 없습니다" description="학생이 등록되면 출석 현황을 확인할 수 있습니다." icon="people"/>:<div className="table-scroll"><table className="data-table"><thead><tr><th>학생</th><th>학년</th><th>프로그램</th><th>대면 출석률</th><th>이번 주 과제</th><th>오답 요약</th></tr></thead><tbody>{students.map(student=><tr key={student.id}><td><span className="table-name">{student.name}</span></td><td>{student.grade}학년</td><td>{programs.find(program=>program.id===student.program_id)?.name||'—'}</td><td>{rate(student.id)}</td><td className="meta">연결 예정</td><td className="meta">연결 예정</td></tr>)}</tbody></table></div>}<p className="institution-footnote">대면 출석률은 저장된 출석 기록 기준이며, 지각을 출석에 포함합니다. 과제 제출과 오답 요약은 연결 후 표시됩니다.</p></section>
    <footer className="institution-footnote">모아셈 · 기관 위탁 수학 학습관리</footer>
  </main>
}
