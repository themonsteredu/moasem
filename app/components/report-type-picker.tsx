'use client'

import { useState } from 'react'
import { ReportOption, uniqueVideos } from '../../lib/report-resources'

type Props = { options: ReportOption[]; selectedIds: string[]; onChange: (ids: string[]) => void; disabled?: boolean; loaded: boolean }
export function ReportTypePicker({ options, selectedIds, onChange, disabled, loaded }: Props) {
  const [search, setSearch] = useState('')
  const [grade, setGrade] = useState('')
  const selected = selectedIds.flatMap(id => options.find(option => option.id === id) ?? [])
  const keyword = search.trim().toLocaleLowerCase('ko')
  const filtered = options.filter(option => (!grade || option.grade === Number(grade)) && `${option.name} ${option.code} ${option.unit || ''}`.toLocaleLowerCase('ko').includes(keyword))
  const videos = uniqueVideos(selected.flatMap(option => option.video ? [option.video] : []))
  const withoutVideo = selected.filter(option => !option.video)
  return <div className="report-type-picker">
    <div className="picker-heading"><span>어려웠던 유형 선택</span><small>{selectedIds.length}개 선택</small></div>
    {!loaded ? <p className="field-help">오답 유형을 불러오는 중입니다.</p> : !options.length ? <p className="field-help">등록된 오답 유형이 없습니다. 아래에 직접 적거나 관리자에게 유형 등록을 요청해 주세요.</p> : <>
      <div className="picker-filters"><input aria-label="오답 유형 검색" placeholder="유형명·코드·단원 검색" value={search} disabled={disabled} onChange={event => setSearch(event.target.value)}/><select aria-label="오답 유형 학년" value={grade} disabled={disabled} onChange={event => setGrade(event.target.value)}><option value="">전체 학년</option>{Array.from({ length: 12 }, (_, index) => index + 1).map(value => <option key={value} value={value}>{value}학년</option>)}</select></div>
      {selected.length > 0 && <div className="picker-selected" aria-label="선택한 오답 유형">{selected.map(option => <button type="button" key={option.id} disabled={disabled} onClick={() => onChange(selectedIds.filter(id => id !== option.id))} aria-label={`${option.name} 선택 해제`}>{option.name}<span aria-hidden="true">×</span></button>)}</div>}
      <div className="picker-options" role="group" aria-label="오답 유형 목록">{filtered.map(option => <label className="picker-option" key={option.id}><input type="checkbox" disabled={disabled} checked={selectedIds.includes(option.id)} onChange={event => onChange(event.target.checked ? [...selectedIds, option.id] : selectedIds.filter(id => id !== option.id))}/><span><strong>{option.name}</strong><small>{option.grade}학년 · {option.code}{option.unit ? ` · ${option.unit}` : ''}</small></span><small className={option.video ? 'picker-linked' : 'meta'}>{option.video ? '영상 연결' : '영상 미등록'}</small></label>)}{!filtered.length && <p className="field-help">조건에 맞는 유형이 없습니다.</p>}</div>
    </>}
    {selected.length > 0 && <div className="picker-video-preview" aria-live="polite"><strong>리포트에 함께 담을 영상 · {videos.length}개</strong>{videos.map(video => <a key={video.url} href={video.url} target="_blank" rel="noopener noreferrer">{video.title || '영상 확인'} ↗</a>)}{withoutVideo.length > 0 && <p className="field-help">{withoutVideo.map(option => option.name).join(', ')}: 연결된 영상이 없습니다. 유형만 리포트에 담깁니다.</p>}<p className="field-help">여러 유형에 같은 영상이 연결되어 있어도 한 번만 표시합니다.</p></div>}
  </div>
}
