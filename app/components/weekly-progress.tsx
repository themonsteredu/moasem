'use client'

import { useEffect, useRef, useState } from 'react'
import { apiFetch } from '@/lib/staff-client'
import { attendanceLabels, attendanceSummary, hasWeeklyRecords, homeworkLabels, weeksPerView, type ProgramWeek, type WeeklyDetail, type WeeklyOverview, type WeeklyStudent } from '@/lib/weekly-progress'
import { EmptyState } from './workspace'

type Selection = { student: WeeklyStudent; week: ProgramWeek }
const shortDate = (date: string) => date.slice(5).replace('-', '.')

export function WeeklyProgress({ programId, refresh }: { programId: string; refresh: number }) {
  const [page, setPage] = useState(1), [weekStart, setWeekStart] = useState<number>(), [attempt, setAttempt] = useState(0)
  const [data, setData] = useState<WeeklyOverview | null>(null), [loading, setLoading] = useState(false), [error, setError] = useState('')
  const [selected, setSelected] = useState<Selection | null>(null), [detail, setDetail] = useState<WeeklyDetail | null>(null)
  const [detailLoading, setDetailLoading] = useState(false), [detailError, setDetailError] = useState('')
  const detailRevision = useRef(0), detailPanel = useRef<HTMLElement>(null)
  useEffect(() => { if (selected) { detailPanel.current?.focus({ preventScroll: true }); detailPanel.current?.scrollIntoView({ block: 'start' }) } }, [selected])
  function closeDetail() { detailRevision.current++; setSelected(null); setDetail(null); setDetailLoading(false); setDetailError('') }
  useEffect(() => {
    let alive = true
    setData(null); setError(''); closeDetail()
    if (!programId) { setLoading(false); return }
    setLoading(true)
    void (async () => {
      try {
        const r = await apiFetch(`/api/admin/weekly-progress?program_id=${programId}&page=${page}${weekStart === undefined ? '' : `&week_start=${weekStart}`}`), d = await r.json()
        if (!r.ok) throw Error(d.error || '진도표를 불러오지 못했습니다.')
        if (!Array.isArray(d.rows) || !d.weeks?.length || !Number.isInteger(d.total_students) || d.page_size < 1) throw Error('진도표를 다시 불러와 주세요.')
        if (alive) setData(d)
      } catch (e) { if (alive) setError(e instanceof Error ? e.message : '진도표를 불러오지 못했습니다.') }
      finally { if (alive) setLoading(false) }
    })()
    return () => { alive = false; detailRevision.current++ }
  }, [programId, page, weekStart, refresh, attempt])
  async function openDetail(selection: Selection) {
    const seq = ++detailRevision.current
    setSelected(selection); setDetail(null); setDetailError(''); setDetailLoading(true)
    try {
      const r = await apiFetch(`/api/admin/weekly-progress/${selection.student.id}?program_id=${programId}&week=${selection.week.number}`), d = await r.json()
      if (!r.ok) throw Error(d.error || '상세 기록을 불러오지 못했습니다.')
      if (d.student?.id !== selection.student.id || d.week?.number !== selection.week.number || !Array.isArray(d.progress) || !Array.isArray(d.homework) || !Array.isArray(d.attendance)) throw Error('상세 기록을 다시 불러와 주세요.')
      if (seq === detailRevision.current) setDetail(d)
    } catch (e) { if (seq === detailRevision.current) setDetailError(e instanceof Error ? e.message : '상세 기록을 불러오지 못했습니다.') }
    finally { if (seq === detailRevision.current) setDetailLoading(false) }
  }
  function changeWeek(start?: number) { closeDetail(); setData(null); setWeekStart(start); setAttempt(v => v + 1) }
  function changePage(next: number) { closeDetail(); setData(null); setPage(next) }
  const pages = data ? Math.max(1, Math.ceil(data.total_students / data.page_size)) : 1
  return <section className="surface weekly-progress" aria-labelledby="weekly-title">
    <div className="section-heading"><div><span className="eyebrow">한눈에 보는 학습 기록</span><h2 id="weekly-title">학생 × 주차</h2></div><button type="button" className="button" disabled={!programId || loading} onClick={() => setAttempt(v => v + 1)}>진도표 새로고침</button></div>
    {!programId ? <EmptyState icon="people" title="프로그램을 선택해 주세요" description="사용 중인 학생들의 기록을 4주씩 볼 수 있습니다."/> : loading ? <p className="weekly-feedback" role="status">주차별 기록을 불러오는 중입니다…</p> : error ? <div className="weekly-feedback" role="alert"><p>{error}</p><button type="button" className="button" onClick={() => setAttempt(v => v + 1)}>다시 시도</button></div> : data && <>
      <div className="weekly-context"><strong>{data.program.name}</strong><span>{data.program.starts_on} ~ {data.program.ends_on} · 날짜 기준 {data.total_weeks}주 · 학생 {data.total_students}명</span></div>
      {data.program.week_count !== data.total_weeks && <p className="weekly-warning" role="status">등록 주차는 {data.program.week_count}주, 시작·종료일 기준은 {data.total_weeks}주입니다. 프로그램 기간을 확인해 주세요.</p>}
      <div className="weekly-toolbar"><div className="weekly-week-controls" role="group" aria-label="표시할 주차"><button type="button" className="button" disabled={data.week_start <= 1} onClick={() => changeWeek(Math.max(1, data.week_start - weeksPerView))}>이전 4주</button><strong>{data.week_start}–{data.weeks[data.weeks.length - 1].number}주차</strong><button type="button" className="button" disabled={data.week_start + data.weeks.length > data.total_weeks} onClick={() => changeWeek(data.week_start + weeksPerView)}>다음 4주</button></div><button type="button" className="button" onClick={() => changeWeek()}>{data.today < data.program.starts_on ? '첫 주차로' : data.today > data.program.ends_on ? '마지막 주차로' : '이번 주로'}</button></div>
      <details className="weekly-guide"><summary>표 읽는 방법</summary><p>시작일부터 7일씩 나눕니다. 교재·진도는 그 주의 가장 최근 기록이며, 칸을 누르면 해당 주의 모든 기록을 볼 수 있습니다. 기간 밖의 기록은 학생 개인 페이지에서 확인하세요.</p><p>과제는 마감일이 속한 주에 표시하며, 현재 제출 상태를 보여줍니다. 출석은 ‘출석·지각 / 저장된 출석 기록 수’입니다. 예정된 수업 수를 뜻하지 않으며, ‘—’는 기록이 없다는 뜻입니다.</p></details>
      {!data.rows.length ? <EmptyState icon="people" title={page > 1 ? '이 페이지에 학생이 없습니다' : '표시할 학생이 없습니다'} description={page > 1 ? '첫 학생 페이지로 돌아가 명단을 확인해 주세요.' : '이 프로그램에 학생을 등록하고 사용 상태를 확인해 주세요.'}/> : <div className="weekly-table-scroll" tabIndex={0} role="region" aria-label="학생별 주차 진도표, 좌우로 이동하여 확인">
        <table className="weekly-table"><caption className="sr-only">{data.program.name} 학생별 {data.week_start}주차부터의 학습 기록</caption><thead><tr><th scope="col">학생 <small>이름을 누르면 개인 기록</small></th>{data.weeks.map(week => <th key={week.number} scope="col" className={week.phase === 'current' ? 'weekly-current' : ''}><strong>{week.number}주차</strong>{week.phase === 'current' && <span className="weekly-current-label">이번 주</span>}<small>{shortDate(week.starts_on)}–{shortDate(week.ends_on)}{week.phase === 'upcoming' ? ' · 예정' : ''}</small></th>)}</tr></thead><tbody>{data.rows.map(row => <tr key={row.student.id}><th scope="row"><a href={`/students/${row.student.id}`}>{row.student.name}</a><small>{row.student.grade}학년{row.student.student_number ? ` · ${row.student.student_number}` : ''}</small></th>{row.cells.map((cell, index) => <td key={cell.week}><button type="button" className={`weekly-cell ${hasWeeklyRecords(cell) ? '' : 'weekly-cell-empty'}`} aria-label={`${row.student.name} ${cell.week}주차 기록 보기`} aria-pressed={selected?.student.id === row.student.id && selected.week.number === cell.week} onClick={() => void openDetail({ student: row.student, week: data.weeks[index] })}>
          {cell.latest ? <span className="weekly-latest"><strong>{cell.latest.book || '교재 미입력'}</strong><span>{[cell.latest.unit, cell.latest.pages].filter(Boolean).join(' · ') || '단원·쪽수 미입력'}</span><small>진도 기록 {cell.progress_count}건 · {shortDate(cell.latest.lesson_date)}</small></span> : <span className="weekly-latest"><strong>{hasWeeklyRecords(cell) ? '진도 기록 없음' : '기록 없음'}</strong><small>{data.weeks[index].phase === 'upcoming' ? '수업 예정 주차' : '입력한 기록을 확인해 주세요'}</small></span>}
          <span className="weekly-cell-stats"><span>과제 제출 <b>{cell.homework.total ? `${cell.homework.submitted + cell.homework.checked}/${cell.homework.total}` : '—'}</b></span><span>대면 출석 <b>{attendanceSummary(cell.attendance.in_person)}</b></span><span>줌 출석 <b>{attendanceSummary(cell.attendance.zoom)}</b></span></span>{cell.homework.overdue > 0 && <span className="weekly-overdue">기한 지난 미제출 {cell.homework.overdue}건</span>}
        </button></td>)}</tr>)}</tbody></table>
      </div>}
      <div className="review-pagination" aria-label="학생 페이지"><button type="button" className="button" disabled={page <= 1} onClick={() => changePage(1)}>첫 학생</button><button type="button" className="button" disabled={page <= 1} onClick={() => changePage(page - 1)}>이전 학생</button><span>{page} / {pages}페이지 · {data.page_size}명씩 표시</span><button type="button" className="button" disabled={page >= pages} onClick={() => changePage(page + 1)}>다음 학생</button></div>
    </>}
    {selected && <section className="weekly-detail" ref={detailPanel} tabIndex={-1} aria-labelledby="weekly-detail-title"><div className="review-photo-heading"><div><h3 id="weekly-detail-title">{selected.student.name} · {selected.week.number}주차</h3><p>{selected.week.starts_on} ~ {selected.week.ends_on}</p></div><button type="button" className="button" onClick={closeDetail}>상세 닫기</button></div><div className="weekly-detail-links"><a href={`/students/${selected.student.id}`}>개인 진도 기록하기</a><a href={`/students/${selected.student.id}#student-homework`}>과제 확인·수정</a><button type="button" className="button" disabled={detailLoading} onClick={() => void openDetail(selected)}>상세 새로고침</button></div>
      {detailLoading ? <p role="status">상세 기록을 불러오는 중입니다…</p> : detailError ? <p role="alert">{detailError}</p> : detail && <WeeklyRecords detail={detail}/>}
    </section>}
  </section>
}

function WeeklyRecords({ detail }: { detail: WeeklyDetail }) {
  return <div className="weekly-records"><section><h4>교재·진도 <span>{detail.progress.length}건</span></h4>{!detail.progress.length ? <p>이 주에 입력한 진도 기록이 없습니다.</p> : detail.progress.map(record => <article key={record.id} className="weekly-progress-record"><time>{record.lesson_date}</time><h5>{record.book || '교재 미입력'}</h5><p>{[record.unit, record.pages].filter(Boolean).join(' · ') || '단원·쪽수 미입력'}</p><dl>{([['배운 내용', record.learned], ['어려웠던 내용', record.difficulties], ['다음 과제', record.next_assignment], ['강사 메모', record.teacher_note]] as const).map(([label, value]) => value ? <div key={label}><dt>{label}</dt><dd>{value}</dd></div> : null)}</dl></article>)}</section>
    <section><h4>이 주 마감 과제 <span>{detail.homework.length}건</span></h4>{!detail.homework.length ? <p>이 주에 마감되는 과제가 없습니다.</p> : <div className="table-scroll"><table className="data-table weekly-detail-table"><thead><tr><th scope="col">과제</th><th scope="col">마감일</th><th scope="col">현재 상태</th></tr></thead><tbody>{detail.homework.map(record => <tr key={record.id}><td><strong>{record.title}</strong>{record.details && <p>{record.details}</p>}</td><td>{record.due_on}</td><td><span className={`review-status review-status-${record.status}`}>{homeworkLabels[record.status]}</span></td></tr>)}</tbody></table></div>}</section>
    <section><h4>출석 기록 <span>{detail.attendance.length}건</span></h4>{!detail.attendance.length ? <p>이 주에 저장된 출석 기록이 없습니다.</p> : <div className="table-scroll"><table className="data-table weekly-detail-table"><thead><tr><th scope="col">수업일</th><th scope="col">수업</th><th scope="col">출석</th><th scope="col">메모</th></tr></thead><tbody>{detail.attendance.map(record => <tr key={record.id}><td>{record.session_date}</td><td>{record.session_type === 'in_person' ? '대면' : '줌'}</td><td>{attendanceLabels[record.status]}</td><td>{record.note || '—'}</td></tr>)}</tbody></table></div>}</section>
  </div>
}
