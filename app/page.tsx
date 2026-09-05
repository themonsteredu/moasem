'use client'

import { FormEvent, useState, ReactNode } from 'react'
import { apiFetch, jsonHeaders as headers } from '../lib/staff-client'
import { useStaffData } from './components/staff-session'
import { StaffAccess, EmptyState, Icon, Notice, Workspace } from './components/workspace'

type Institution={id:string;name:string;manager_name:string|null;manager_phone:string|null;manager_notifications_enabled:boolean;portal_token:string|null}
type Program={id:string;name:string;starts_on:string;ends_on:string;week_count:number;status:string;institution:{id:string;name:string}|null;instructor:{id:string;name:string}|null}
type Student={id:string;name:string;grade:number;student_number:string|null;program:{id:string;name:string;institution:{id:string;name:string}|null}|null;guardian:{id:string;name:string|null;phone:string;language:string}|null}
type Tab='institutions'|'programs'|'students'
const languageLabel:Record<string,string>={ko:'한국어',vi:'베트남어','zh-CN':'중국어 간체'}
const statusLabel:Record<string,string>={active:'진행 중',planned:'예정',completed:'종료',draft:'준비 중',ended:'종료',paused:'일시 중지'}
const names:Record<Tab,string>={institutions:'기관',programs:'프로그램',students:'학생'}
function Field({title,children}:{title:string;children:ReactNode}){return <label className="field"><span>{title}</span>{children}</label>}

export default function Home(){
  const [tab,setTab]=useState<Tab>('institutions')
  useStaffData(loadAll)
  const [institutions,setInstitutions]=useState<Institution[]>([])
  const [instructors,setInstructors]=useState<{id:string;name:string;active:boolean;instructor_id:string}[]>([])
  const [programs,setPrograms]=useState<Program[]>([])
  const [students,setStudents]=useState<Student[]>([])
  const [message,setMessage]=useState('')
  const [loaded,setLoaded]=useState(false)
  const [busy,setBusy]=useState(false)
  const [saving,setSaving]=useState(false)
  const counts={institutions:institutions.length,programs:programs.length,students:students.length}

  async function loadAll(){
    setBusy(true)
    try{
      const responses=await Promise.all(['/api/admin/institutions','/api/admin/programs','/api/admin/students','/api/admin/instructors'].map(url=>apiFetch(url,{headers,cache:'no-store'})))
      if(responses.some(response=>!response.ok))throw new Error('목록을 불러오지 못했습니다. 다시 시도해 주세요.')
      const [ia,pa,sa,staffData]=await Promise.all(responses.map(response=>response.json()))
      setInstructors(staffData.items??[]);setInstitutions(ia.items??[]);setPrograms(pa.items??[]);setStudents(sa.items??[])
      setLoaded(true);setMessage('')
    }catch(error){setLoaded(false);setInstructors([]);setInstitutions([]);setPrograms([]);setStudents([]);setMessage(error instanceof Error?error.message:'목록을 불러오지 못했습니다.')}
    finally{setBusy(false)}
  }
  async function submit(event:FormEvent<HTMLFormElement>){
    event.preventDefault()
    if(saving)return
    const form=event.currentTarget
    const values=new FormData(form)
    const payload:Record<string,unknown>=Object.fromEntries(values.entries())
    if(tab==='institutions')payload.manager_notifications_enabled=true
    if(tab==='programs'){
      payload.week_count=Number(payload.week_count)
      for(const key of ['in_person_weekdays','zoom_weekdays'])payload[key]=String(payload[key]||'').split(',').map(value=>value.trim()).filter(Boolean)
    }
    if(tab==='students')payload.grade=Number(payload.grade)
    setSaving(true);setMessage('')
    try{
      const response=await apiFetch(`/api/admin/${tab}`,{method:'POST',headers,body:JSON.stringify(payload)})
      const data=await response.json()
      if(!response.ok)throw new Error(data.error||'저장하지 못했습니다.')
      form.reset()
      await loadAll()
      setMessage(`${names[tab]} 등록을 완료했습니다.`)
    }catch(error){setMessage(error instanceof Error?error.message:'저장하지 못했습니다.')}
    finally{setSaving(false)}
  }
  async function copyPortal(token:string){
    try{await navigator.clipboard.writeText(`${window.location.origin}/institution/${token}`);setMessage('기관 담당자용 링크를 복사했습니다.')}
    catch{setMessage('링크를 복사하지 못했습니다. 브라우저의 복사 권한을 확인해 주세요.')}
  }

  return <Workspace current="/" title="기관·학생 관리" description="함께하는 기관과 아이들의 수업을 관리하세요." action={<span className="heading-tag">운영 현황</span>}>
    <StaffAccess onLoad={loadAll} busy={busy||saving}/>
    <section className="summary-strip" aria-label="등록 현황">
      {(['institutions','programs','students'] as Tab[]).map((key,index)=><button key={key} className={tab===key?'summary-item selected':'summary-item'} onClick={()=>setTab(key)} aria-pressed={tab===key} disabled={saving}><span className="summary-label">{['함께하는 기관','운영 프로그램','등록 학생'][index]}<Icon name="arrow" size={17}/></span><strong>{loaded?counts[key]:'—'}<small>{index===2?'명':'개'}</small></strong><span className="summary-note">{loaded?`${names[key]} 목록 보기`:'목록을 불러오면 표시됩니다'}</span></button>)}
    </section>
    <div className="management-grid">
      <section className="surface list-surface">
        <div className="section-heading"><div><span className="eyebrow">기관부터 학생까지</span><h2>등록 현황</h2></div><span className="meta">{loaded?`전체 ${counts[tab]}${tab==='students'?'명':'개'}`:'연결 대기'}</span></div>
        <div className="segmented-tabs" role="tablist" aria-label="등록 항목">{(['institutions','programs','students'] as Tab[]).map(key=><button key={key} role="tab" aria-selected={tab===key} aria-controls="registration-list" id={`tab-${key}`} className={tab===key?'active':''} onClick={()=>setTab(key)} disabled={saving}>{names[key]}<span>{loaded?counts[key]:'—'}</span></button>)}</div>
        <div id="registration-list" role="tabpanel" aria-labelledby={`tab-${tab}`}>
          {!loaded?<EmptyState title="운영 현황을 불러오세요" description="새로고침을 누르면 등록된 기관과 학생을 불러옵니다."/>:counts[tab]===0?<EmptyState title={`아직 등록된 ${names[tab]}이 없습니다`} description={tab==='institutions'?'함께 수업할 기관의 이름과 담당자를 먼저 등록해 주세요.':tab==='programs'?'기관을 선택하고 수업 기간과 담당 강사를 등록해 주세요.':'프로그램을 선택하고 학생과 보호자 정보를 등록해 주세요.'} icon={tab==='students'?'people':'overview'}/>:<div className="table-scroll">
            {tab==='institutions'&&<table className="data-table"><thead><tr><th>기관명</th><th>담당자·연락처</th><th>알림</th><th>담당자 페이지</th></tr></thead><tbody>{institutions.map(item=><tr key={item.id}><td><span className="table-name">{item.name}</span></td><td>{item.manager_name||'미등록'}<small>{item.manager_phone||'연락처 미등록'}</small></td><td><span className={`badge ${item.manager_notifications_enabled?'badge-green':''}`}>{item.manager_notifications_enabled?'수신':'미수신'}</span></td><td>{item.portal_token?<button className="text-button" onClick={()=>copyPortal(item.portal_token!)}>링크 복사 <Icon name="arrow" size={15}/></button>:<span className="meta">링크 없음</span>}</td></tr>)}</tbody></table>}
            {tab==='programs'&&<table className="data-table"><thead><tr><th>프로그램·기관</th><th>수업 기간</th><th>담당 강사</th><th>상태</th></tr></thead><tbody>{programs.map(item=><tr key={item.id}><td><span className="table-name">{item.name}</span><small>{item.institution?.name||'—'}</small></td><td>{item.starts_on}<small>~ {item.ends_on}</small></td><td>{item.instructor?.name||'미지정'}</td><td><span className="badge">{statusLabel[item.status]||item.status}</span></td></tr>)}</tbody></table>}
            {tab==='students'&&<table className="data-table"><thead><tr><th>학생</th><th>프로그램·기관</th><th>보호자</th><th>안내 언어</th></tr></thead><tbody>{students.map(item=><tr key={item.id}><td><span className="table-name">{item.name}</span><small>{item.grade}학년{item.student_number?` · ${item.student_number}`:''}</small></td><td>{item.program?.name||'—'}<small>{item.program?.institution?.name||'—'}</small></td><td>{item.guardian?.name||'보호자'}<small>{item.guardian?.phone||'—'}</small></td><td><span className="badge">{languageLabel[item.guardian?.language||'ko']}</span></td></tr>)}</tbody></table>}
          </div>}
        </div>
        <div className="list-footer"><Icon name="lock" size={15}/><span>기관 담당자는 전달받은 링크로 소속 기관 현황을 확인합니다.</span></div>
      </section>
      <aside className="surface editor-surface">
        <div className="section-heading"><div><span className="eyebrow">새로 등록하기</span><h2>{tab==='institutions'?'기관 정보':tab==='programs'?'프로그램 정보':'학생·보호자 정보'}</h2></div><span className="form-step">{tab==='institutions'?'01':tab==='programs'?'02':'03'}</span></div>
        <form className="editor-form" key={tab} onSubmit={submit}>
          <fieldset disabled={saving}>
          {tab==='institutions'&&<><Field title="기관명 *"><input name="name" required placeholder="예: 광주○○가족센터"/></Field><Field title="담당자"><input name="manager_name" placeholder="담당자 이름"/></Field><Field title="연락처"><input name="manager_phone" type="tel" placeholder="010-0000-0000"/></Field><p className="field-help">등록 후 기관 담당자용 조회 링크를 복사할 수 있습니다.</p></>}
          {tab==='programs'&&<><Field title="기관 *"><select name="institution_id" required><option value="">기관 선택</option>{institutions.map(item=><option key={item.id} value={item.id}>{item.name}</option>)}</select></Field><Field title="프로그램명 *"><input name="name" required placeholder="예: 초등 수학 1기"/></Field><div className="form-columns"><Field title="시작일 *"><input type="date" name="starts_on" required/></Field><Field title="종료일 *"><input type="date" name="ends_on" required/></Field></div><div className="form-columns"><Field title="주차 수 *"><input name="week_count" type="number" min="1" required placeholder="12"/></Field><Field title="담당 강사"><select name="instructor_id"><option value="">나중에 배정</option>{instructors.filter(item=>item.active).map(item=><option key={item.id} value={item.instructor_id}>{item.name}</option>)}</select></Field></div><div className="form-columns"><Field title="대면 요일"><input name="in_person_weekdays" placeholder="예: 화"/></Field><Field title="줌 요일"><input name="zoom_weekdays" placeholder="예: 목, 토"/></Field></div><details className="form-details"><summary>줌 회의 정보</summary><Field title="회의 번호"><input name="zoom_meeting_number" inputMode="numeric"/></Field><Field title="회의 암호"><input name="zoom_password" autoComplete="off"/></Field></details></>}
          {tab==='students'&&<><Field title="프로그램 *"><select name="program_id" required><option value="">프로그램 선택</option>{programs.map(item=><option key={item.id} value={item.id}>{item.institution?.name} · {item.name}</option>)}</select></Field><div className="form-columns"><Field title="학생 이름 *"><input name="name" required/></Field><Field title="학년 *"><select name="grade" required>{Array.from({length:12},(_,index)=>index+1).map(grade=><option key={grade} value={grade}>{grade}학년</option>)}</select></Field></div><Field title="학생 번호"><input name="student_number" placeholder="선택 입력"/></Field><div className="form-divider">보호자 안내 정보</div><Field title="보호자 이름"><input name="guardian_name"/></Field><Field title="보호자 연락처 *"><input name="guardian_phone" type="tel" required placeholder="010-0000-0000"/></Field><Field title="안내 언어 *"><select name="guardian_language" defaultValue="ko"><option value="ko">한국어</option><option value="vi">베트남어</option><option value="zh-CN">중국어 간체</option></select></Field></>}
          </fieldset>
          <button className="button button-primary full-width" disabled={saving||busy||!loaded}><Icon name="plus" size={17}/>{saving?'저장 중…':`${names[tab]} 등록`}</button>
        </form>
      </aside>
    </div>
    <Notice>{message}</Notice>
  </Workspace>
}
