'use client'

import { FormEvent, useState } from 'react'
import { apiFetch, jsonHeaders as headers } from '../../lib/staff-client'
import { useStaffData } from '../components/staff-session'
import { StaffAccess, Icon, Notice, Workspace } from '../components/workspace'
import { ReportTypePicker } from '../components/report-type-picker'
import { ReportNotifications } from '../components/report-notifications'
import { notificationMessages } from '../../lib/notification-view'
import type { ReportOption } from '../../lib/report-resources'

type Student={id:string;name:string;grade:number;program:{id:string;name:string;institution:{id:string;name:string}|null}|null;guardian:{id:string;name:string|null;phone:string;language:string}|null}
const languageLabel:Record<string,string>={ko:'한국어',en:'영어',vi:'베트남어','zh-CN':'중국어 간체'}
function localDate(){const d=new Date();return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`}

export default function ReportsPage(){
  useStaffData(loadStudents)
  const [options,setOptions]=useState<ReportOption[]>([])
  const [selectedTypeIds,setSelectedTypeIds]=useState<string[]>([])
  const [students,setStudents]=useState<Student[]>([])
  const [selectedStudentId,setSelectedStudentId]=useState('')
  const [language,setLanguage]=useState('ko')
  const [message,setMessage]=useState('')
  const [reportUrl,setReportUrl]=useState('')
  const [connected,setConnected]=useState(false)
  const [busy,setBusy]=useState(false)
  const [saving,setSaving]=useState(false)
  const [notifying,setNotifying]=useState(false)
  const [alimtalkReady,setAlimtalkReady]=useState(false)
  const [sendNow,setSendNow]=useState(false)
  const [reportRevision,setReportRevision]=useState(0)
  const selectedStudent=students.find(student=>student.id===selectedStudentId)
  async function loadStudents(){
    setBusy(true)
    try{
      const [studentsResponse,optionsResponse]=await Promise.all([apiFetch('/api/admin/students',{headers,cache:'no-store'}),apiFetch('/api/admin/report-options',{cache:'no-store'})])
      const [studentsData,optionsData]=await Promise.all([studentsResponse.json(),optionsResponse.json()])
      if(!studentsResponse.ok)throw new Error(studentsData.error||'학생을 불러오지 못했습니다.')
      if(!optionsResponse.ok)throw new Error(optionsData.error||'오답 유형을 불러오지 못했습니다.')
      setStudents(studentsData.items??[]);setOptions(optionsData.items??[]);setConnected(true);setMessage('')
      const currentIds=new Set((optionsData.items??[]).map((item:ReportOption)=>item.id))
      setSelectedTypeIds(ids=>ids.filter(id=>currentIds.has(id)))
    }
    catch(error){setConnected(false);setStudents([]);setOptions([]);selectStudent('');setMessage(error instanceof Error?error.message:'연결을 확인하고 다시 시도해 주세요.')}
    finally{setBusy(false)}
  }
  function selectStudent(id:string){setSelectedStudentId(id);setSelectedTypeIds([]);setLanguage(students.find(student=>student.id===id)?.guardian?.language||'ko');setReportUrl('');setMessage('');setAlimtalkReady(false);setSendNow(false)}
  async function submit(event:FormEvent<HTMLFormElement>){
    event.preventDefault();if(saving||notifying)return
    const values=new FormData(event.currentTarget)
    const shouldSend=sendNow&&alimtalkReady
    setSaving(true);setMessage('');setReportUrl('')
    try{
      const response=await apiFetch('/api/admin/learning-reports',{method:'POST',headers,body:JSON.stringify({...Object.fromEntries(values.entries()),student_id:selectedStudentId,solved_count:Number(values.get('solved_count')),wrong_count:Number(values.get('wrong_count')),wrong_type_ids:selectedTypeIds,language})})
      const data=await response.json();if(!response.ok)throw new Error(data.error||'리포트를 만들지 못했습니다.')
      setReportUrl(`${location.origin}/report/${data.token}`)
      setMessage('보호자 리포트를 만들었습니다. 링크를 복사해 전달해 주세요.')
      if(shouldSend){
        try{
          const sent=await apiFetch(`/api/admin/learning-reports/${data.token}/notification`,{method:'POST',headers,body:JSON.stringify({action:'send'})})
          const result=await sent.json();if(!sent.ok)throw new Error(result.error||'알림톡을 보내지 못했습니다.')
          setMessage(`리포트는 저장되었습니다. ${result.notice||notificationMessages[result.notification?.status]||'발송 내역을 확인해 주세요.'}`)
        }catch(error){setMessage(`리포트는 저장되었습니다. ${error instanceof Error?error.message:'알림톡 결과를 확인해 주세요.'}`)}
      }
      setReportRevision(value=>value+1)
    }
    catch(error){setMessage(error instanceof Error?error.message:'연결을 확인하고 다시 시도해 주세요.')}
    finally{setSaving(false)}
  }
  async function copyReport(){try{await navigator.clipboard.writeText(reportUrl);setMessage('리포트 링크를 복사했습니다.')}catch{setMessage('자동 복사가 되지 않았습니다. 아래 주소를 선택해 복사해 주세요.')}}
  return <Workspace current="/reports" title="보호자 리포트" description="아이의 학습 결과와 가정에서 함께할 내용을 전달하세요." action={<span className="heading-tag">강사 직접 작성</span>}>
    <StaffAccess onLoad={loadStudents} busy={busy||saving||notifying}/>
    <div className="report-workspace">
      <section className="surface">
        <div className="section-heading"><div><span className="eyebrow">학습 안내</span><h2>리포트 작성</h2></div><Icon name="report"/></div>
        <form key={selectedStudentId} onSubmit={submit} className="report-form">
          <div className="form-section-title"><span>1</span>학생과 수업일</div>
          <label className="field"><span>학생 *</span><select value={selectedStudentId} onChange={event=>selectStudent(event.target.value)} required disabled={saving||notifying}><option value="">학생 선택</option>{students.map(student=><option key={student.id} value={student.id}>{student.program?.institution?.name} · {student.program?.name} · {student.name}</option>)}</select></label>
          {connected&&!students.length&&<p className="field-help">관리자에게 학생 등록과 담당 프로그램을 확인해 주세요.</p>}
          <fieldset disabled={saving||notifying} className="report-form-fields">
            <div className="form-columns three"><label className="field"><span>수업일 *</span><input type="date" name="lesson_date" defaultValue={localDate()} required/></label><label className="field"><span>푼 문제 수 *</span><input type="number" name="solved_count" min="0" defaultValue="0" required/></label><label className="field"><span>틀린 문제 수 *</span><input type="number" name="wrong_count" min="0" defaultValue="0" required/></label></div>
            <div className="form-section-title"><span>2</span>학습 결과와 다음 과제</div>
            <ReportTypePicker options={options} selectedIds={selectedTypeIds} onChange={setSelectedTypeIds} disabled={saving||busy} loaded={connected}/><label className="field"><span>추가로 전할 학습 내용</span><input name="wrong_type_summary" placeholder="유형 목록에 없는 내용은 직접 적어 주세요"/></label>
            <label className="field"><span>이번 주 과제</span><input name="weekly_assignment" placeholder="예: 교재 24~27쪽, 하루 두 쪽씩"/></label>
            <label className="field"><span>추가 영상 주소 · 선택 입력</span><input name="video_url" type="url" placeholder="자동 연결 영상 외에 더 보낼 영상이 있다면 입력하세요"/></label>
            <div className="form-section-title"><span>3</span>보호자에게 전할 말</div>
            <label className="field"><span>보호자 안내 언어</span><select value={language} onChange={event=>setLanguage(event.target.value)}><option value="ko">한국어</option><option value="en">영어</option><option value="vi">베트남어</option><option value="zh-CN">중국어 간체</option></select></label>
            <p className="field-help">아래 안내는 선택한 보호자 언어로 직접 작성해 주세요. 입력한 문장이 그대로 전달됩니다.</p>
            <label className="field"><span>오늘의 한 줄</span><input name="headline" placeholder={`${languageLabel[language]}로 오늘의 성장을 적어 주세요`}/></label>
            <label className="field"><span>가정에서 함께할 일</span><textarea name="action_line" rows={2} placeholder={`${languageLabel[language]}로 보호자가 도와줄 행동 한 가지`}/></label>
            <details className="form-details"><summary>강사 내부 메모 <span className="meta">· 보호자에게 보이지 않아요</span></summary><label className="field"><span className="sr-only">강사 내부 메모</span><textarea name="teacher_note" rows={3} placeholder="다음 수업에 참고할 내용을 기록하세요."/></label></details>
          </fieldset>
          <label className="notification-opt-in"><input type="checkbox" checked={sendNow&&alimtalkReady} disabled={!alimtalkReady||saving||notifying} onChange={event=>setSendNow(event.target.checked)}/><span>리포트 만든 뒤 모아킷 알림톡 바로 보내기<small>{alimtalkReady?'등록된 보호자에게 도착 안내와 링크만 보냅니다.':'모아킷 알림톡 연결 후 사용할 수 있습니다.'}</small></span></label>
          <button className="button button-primary full-width" disabled={!connected||busy||!selectedStudentId||saving||notifying}><Icon name="report" size={18}/>{saving?'처리 중…':sendNow&&alimtalkReady?'리포트 만들고 알림톡 보내기':'리포트 링크 만들기'}</button>
        </form>
      </section>
      <aside>
        <section className="surface report-guide"><span className="empty-icon"><Icon name="report" size={24}/></span><h2>보호자에게는 이렇게 보여요</h2><p>가정에서 필요한 세 가지를 선택한 언어의 화면으로 안내합니다.</p>{selectedStudent&&<div className="language-pill">{selectedStudent.name} · {languageLabel[language]}</div>}<ol><li>오늘 결과<span>푼 문제 수와 어려웠던 유형</span></li><li>이번 주 과제<span>가정에서 이어갈 학습</span></li><li>같이 볼 영상<span>영상과 함께할 행동 한 가지</span></li></ol></section>
        {reportUrl&&<div className="report-link"><strong>리포트가 준비됐어요</strong><p>보호자는 로그인 없이 볼 수 있습니다.</p><code>{reportUrl}</code><button className="button button-dark" onClick={copyReport}>링크 복사</button><a className="button" href={reportUrl} target="_blank" rel="noreferrer">열어보기</a></div>}
        <ReportNotifications studentId={selectedStudentId} revision={reportRevision} onReady={setAlimtalkReady} onBusy={setNotifying} disabled={saving||busy}/>
      </aside>
    </div>
    <Notice>{message}</Notice>
  </Workspace>
}
