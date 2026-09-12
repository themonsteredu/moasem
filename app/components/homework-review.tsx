'use client'
import { useEffect, useRef, useState } from 'react'
import Image from 'next/image'
import { apiFetch } from '@/lib/staff-client'
import { deadlineLabel, reviewFilters, reviewLabels, type ReviewDetail, type ReviewFilter, type ReviewItem, type ReviewList } from '@/lib/homework-review'
import { EmptyState } from './workspace'

export function HomeworkReview({ programId, refresh, locked = false }: { programId: string; refresh: number; locked?: boolean }) {
  const [filter, setFilter] = useState<ReviewFilter>('submitted'), [page, setPage] = useState(1), [attempt, setAttempt] = useState(0)
  const [data, setData] = useState<ReviewList | null>(null), [loading, setLoading] = useState(false), [error, setError] = useState('')
  const [selected, setSelected] = useState<ReviewItem | null>(null), [detail, setDetail] = useState<ReviewDetail | null>(null)
  const [photoLoading, setPhotoLoading] = useState(false), [photoError, setPhotoError] = useState('')
  const photoRevision = useRef(0)
  const photoPanel = useRef<HTMLElement>(null)
  useEffect(() => { if (selected) { photoPanel.current?.focus({ preventScroll: true }); photoPanel.current?.scrollIntoView({ block: 'nearest' }) } }, [selected])
  function closePhotos() { photoRevision.current++; setSelected(null); setDetail(null); setPhotoLoading(false); setPhotoError('') }
  useEffect(() => {
    let alive = true
    setData(null); setError(''); closePhotos()
    if (!programId) { setLoading(false); return }
    setLoading(true)
    void (async () => {
      try {
        const r = await apiFetch(`/api/admin/homework-review?program_id=${programId}&filter=${filter}&page=${page}`), d = await r.json()
        if (!r.ok) throw Error(d.error || '과제 현황을 불러오지 못했습니다.')
        if (!Array.isArray(d.items) || !d.counts || !Number.isInteger(d.total)) throw Error('과제 현황을 다시 불러와 주세요.')
        if (alive) setData(d)
      } catch (e) { if (alive) setError(e instanceof Error ? e.message : '과제 현황을 불러오지 못했습니다.') }
      finally { if (alive) setLoading(false) }
    })()
    return () => { alive = false; photoRevision.current++ }
  }, [programId, filter, page, refresh, attempt])

  async function openPhotos(item: ReviewItem) {
    const seq = ++photoRevision.current
    setSelected(item); setDetail(null); setPhotoError(''); setPhotoLoading(true)
    try {
      const r = await apiFetch(`/api/admin/homework-review/${item.id}?program_id=${programId}`), d = await r.json()
      if (!r.ok) throw Error(d.error || '사진을 불러오지 못했습니다.')
      if (seq !== photoRevision.current) return
      setDetail(d)
    } catch (e) { if (seq === photoRevision.current) setPhotoError(e instanceof Error ? e.message : '사진을 불러오지 못했습니다.') }
    finally { if (seq === photoRevision.current) setPhotoLoading(false) }
  }
  const pages = data ? Math.max(1, Math.ceil(data.total / data.page_size)) : 1
  const switchFilter = (next: ReviewFilter) => { closePhotos(); setData(null); setFilter(next); setPage(1) }
  return <section className="surface homework-review" aria-labelledby="homework-review-title">
    <div className="section-heading"><div><span className="eyebrow">먼저 확인할 과제</span><h2 id="homework-review-title">제출 현황 모아보기</h2></div><button type="button" className="button" disabled={!programId || loading || locked} onClick={() => setAttempt(v => v + 1)}>현황 새로고침</button></div>
    {!programId ? <EmptyState icon="report" title="프로그램을 선택해 주세요" description="미제출 과제와 강사 확인이 필요한 과제를 함께 볼 수 있습니다."/> : <>
      <div className="review-filters" role="group" aria-label="과제 상태 선택">{reviewFilters.map(f => <button type="button" key={f} className={`review-filter ${filter === f ? 'active' : ''}`} aria-pressed={filter === f} disabled={locked} onClick={() => { if (f !== filter) switchFilter(f) }}><span>{reviewLabels[f]}</span><strong>{data ? `${data.counts[f]}건` : '—'}</strong></button>)}</div>
      <p className="review-help">현재 소속·사용 중인 학생의 과제 건수입니다. 기한 초과는 미제출에 포함됩니다.<br/>확인 완료는 강사가 확인한 상태이며, 자동채점 결과가 아닙니다.</p>
      {loading ? <p className="review-feedback" role="status">과제 현황을 불러오는 중입니다…</p> : error ? <div className="review-feedback" role="alert"><p>{error}</p><button type="button" className="button" disabled={locked} onClick={() => setAttempt(v => v + 1)}>다시 불러오기</button></div> : data && <>
        <div className="review-result-heading"><h3>{reviewLabels[filter]} <span>{data.total}건</span></h3><span>{filter === 'submitted' ? '먼저 제출한 순' : filter === 'checked' ? '최근 확인한 순' : '마감일이 빠른 순'} · 한국시간 기준</span></div>
        {!data.items.length ? <EmptyState icon="check" title={page > 1 ? '이 페이지의 과제가 변경되었습니다' : `${reviewLabels[filter]} 과제가 없습니다`} description={page > 1 ? '이전 페이지 또는 첫 페이지에서 다시 확인해 주세요.' : '다른 상태를 선택하거나 아래에서 새 과제를 등록해 주세요.'}/> : <div className="table-scroll"><table className="data-table review-table"><caption className="sr-only">{reviewLabels[filter]} 과제 목록</caption><thead><tr><th scope="col">학생</th><th scope="col">과제</th><th scope="col">마감일</th><th scope="col">상태</th><th scope="col">확인하기</th></tr></thead><tbody>{data.items.map(item => <tr key={item.id}>
          <td><a className="student-record-link" href={`/students/${item.student.id}#student-homework`}>{item.student.name}</a><small>{item.student.grade}학년</small></td>
          <td><strong>{item.title}</strong>{item.details && <p className="review-assignment">{item.details}</p>}</td>
          <td>{item.due_on}{deadlineLabel(item, data.today) && <small className={item.due_on < data.today ? 'review-overdue' : ''}>{deadlineLabel(item, data.today)}</small>}</td>
          <td><span className={`review-status review-status-${item.status}`}>{reviewLabels[item.status]}</span></td>
          <td><div className="review-actions"><button type="button" className="button" aria-label={`${item.student.name} ${item.title} 사진 보기`} disabled={locked || !item.photo_count} onClick={() => void openPhotos(item)}>{item.photo_count ? `사진 ${item.photo_count}장 보기` : '등록된 사진 없음'}</button><a href={`/students/${item.student.id}#student-homework`}>학생 기록·상태 변경</a></div></td>
        </tr>)}</tbody></table></div>}
        {(pages > 1 || page > 1) && <nav className="review-pagination" aria-label="과제 목록 페이지"><button type="button" className="button" disabled={page === 1 || locked} onClick={() => setPage(1)}>처음</button><button type="button" className="button" disabled={page === 1 || locked} onClick={() => setPage(v => v - 1)}>이전</button><span>{page} / {Math.max(page, pages)} 페이지 · 한 번에 {data.page_size}건</span><button type="button" className="button" disabled={page >= pages || locked} onClick={() => setPage(v => v + 1)}>다음</button></nav>}
      </>}
      {selected && <section ref={photoPanel} tabIndex={-1} className="review-photos" aria-label={`${selected.student.name} 과제 사진`}>
        <div className="review-photo-heading"><div><h3>{selected.student.name} · {selected.title}</h3><p>사진 링크는 5분간 유효합니다. 만료되면 사진 새로고침을 눌러 주세요.</p></div><button type="button" className="button" onClick={closePhotos}>사진 닫기</button></div>
        <div className="review-photo-controls"><button type="button" className="button" disabled={photoLoading || locked} onClick={() => void openPhotos(selected)}>사진 새로고침</button><a href={`/students/${selected.student.id}#student-homework`}>학생 기록에서 상태 변경</a></div>
        {photoLoading && <p role="status">사진을 불러오는 중입니다…</p>}{photoError && <p role="alert">{photoError}</p>}
        {detail && <>{!detail.photos.length ? <p>등록된 사진이 없습니다. 직접 받은 과제는 사진 없이 제출로 표시할 수 있습니다.</p> : <div className="review-photo-grid">{detail.photos.map((photo, index) => <figure key={photo.id}><a href={photo.url} target="_blank" rel="noreferrer"><Image unoptimized src={photo.url} width={900} height={1200} alt={`${detail.item.student.name}의 ${detail.item.title} 과제 사진 ${index + 1}`} referrerPolicy="no-referrer" onError={() => setPhotoError('사진을 열 수 없습니다. 사진 새로고침을 눌러 주세요.')}/><figcaption>사진 {index + 1} · 크게 열기</figcaption></a></figure>)}</div>}</>}
      </section>}
    </>}
  </section>
}
