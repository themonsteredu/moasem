'use client'

import { ChangeEvent, FormEvent, useEffect, useMemo, useState } from 'react'

type Video = {
  id: string
  title: string
  url: string
  duration_seconds: number | null
  language: string
  provider: string
  visibility: string
  active: boolean
}

type VideoLink = {
  is_primary: boolean
  priority: number
  video: Video | null
}

type WrongType = {
  id: string
  code: string
  name: string
  grade: number
  semester: number | null
  domain: string | null
  unit: string | null
  description_ko: string | null
  description_vi: string | null
  description_zh_cn: string | null
  display_order: number
  active: boolean
  video_links: VideoLink[]
}

type WrongTypeDraft = Omit<WrongType, 'video_links'> & { primary_video_id: string }
type Tab = 'types' | 'videos'

const emptyType: WrongTypeDraft = {
  id: '', code: '', name: '', grade: 1, semester: 1, domain: '', unit: '',
  description_ko: '', description_vi: '', description_zh_cn: '', display_order: 0,
  active: true, primary_video_id: '',
}

const emptyVideo: Video = {
  id: '', title: '', url: '', duration_seconds: null, language: 'ko',
  provider: 'youtube', visibility: 'unlisted', active: true,
}

const languageLabel: Record<string, string> = { ko: '한국어', vi: '베트남어', 'zh-CN': '중국어 간체' }
const visibilityLabel: Record<string, string> = { public: '공개', unlisted: '일부 공개', private: '비공개' }
const csvColumns = ['code', 'name', 'grade', 'semester', 'domain', 'unit', 'description_ko', 'description_vi', 'description_zh_cn', 'display_order', 'active']

function parseCsv(text: string) {
  const rows: string[][] = []
  let row: string[] = []
  let cell = ''
  let quoted = false
  const source = text.replace(/^\uFEFF/, '')

  for (let index = 0; index < source.length; index += 1) {
    const char = source[index]
    if (quoted) {
      if (char === '"' && source[index + 1] === '"') {
        cell += '"'
        index += 1
      } else if (char === '"') {
        quoted = false
      } else {
        cell += char
      }
    } else if (char === '"') {
      quoted = true
    } else if (char === ',') {
      row.push(cell.trim())
      cell = ''
    } else if (char === '\n') {
      row.push(cell.trim())
      if (row.some(Boolean)) rows.push(row)
      row = []
      cell = ''
    } else if (char !== '\r') {
      cell += char
    }
  }
  row.push(cell.trim())
  if (row.some(Boolean)) rows.push(row)
  return rows
}

function primaryVideo(item: WrongType) {
  return item.video_links?.find(link => link.is_primary)?.video ?? null
}

function formatDuration(seconds: number | null) {
  if (seconds === null) return '-'
  const minutes = Math.floor(seconds / 60)
  const remain = seconds % 60
  return `${minutes}:${String(remain).padStart(2, '0')}`
}

export default function WrongTypesPage() {
  const [tab, setTab] = useState<Tab>('types')
  const [adminKey, setAdminKey] = useState('')
  const [items, setItems] = useState<WrongType[]>([])
  const [videos, setVideos] = useState<Video[]>([])
  const [draft, setDraft] = useState<WrongTypeDraft>(emptyType)
  const [videoDraft, setVideoDraft] = useState<Video>(emptyVideo)
  const [search, setSearch] = useState('')
  const [grade, setGrade] = useState('all')
  const [semester, setSemester] = useState('all')
  const [domain, setDomain] = useState('all')
  const [connection, setConnection] = useState('all')
  const [message, setMessage] = useState('관리 키를 입력하고 목록을 불러오세요.')
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    const saved = sessionStorage.getItem('moasem-admin-key')
    if (saved) setAdminKey(saved)
  }, [])

  const headers = useMemo(() => ({ 'Content-Type': 'application/json', 'x-moasem-admin-key': adminKey }), [adminKey])
  const domains = useMemo(() => Array.from(new Set(items.map(item => item.domain).filter(Boolean) as string[])).sort(), [items])
  const connectedCount = items.filter(item => primaryVideo(item)).length
  const linkedCount = (videoId: string) => items.filter(item => item.video_links?.some(link => link.video?.id === videoId)).length

  const filteredItems = useMemo(() => {
    const keyword = search.trim().toLocaleLowerCase('ko')
    return items.filter(item => {
      const video = primaryVideo(item)
      const searchable = `${item.code} ${item.name} ${item.domain ?? ''} ${item.unit ?? ''}`.toLocaleLowerCase('ko')
      return (!keyword || searchable.includes(keyword))
        && (grade === 'all' || item.grade === Number(grade))
        && (semester === 'all' || item.semester === Number(semester))
        && (domain === 'all' || item.domain === domain)
        && (connection === 'all' || (connection === 'connected' ? Boolean(video) : !video))
    }).sort((a, b) => {
      const aConnected = Boolean(primaryVideo(a))
      const bConnected = Boolean(primaryVideo(b))
      if (aConnected !== bConnected) return aConnected ? 1 : -1
      return a.display_order - b.display_order || a.code.localeCompare(b.code)
    })
  }, [items, search, grade, semester, domain, connection])

  async function loadAll() {
    if (!adminKey) return setMessage('관리 키를 먼저 입력하세요.')
    setBusy(true)
    sessionStorage.setItem('moasem-admin-key', adminKey)
    try {
      const [typesResponse, videosResponse] = await Promise.all([
        fetch('/api/admin/wrong-types', { headers, cache: 'no-store' }),
        fetch('/api/admin/videos', { headers, cache: 'no-store' }),
      ])
      const [typesData, videosData] = await Promise.all([typesResponse.json(), videosResponse.json()])
      if (!typesResponse.ok) throw new Error(typesData.error || '오답 유형을 불러오지 못했습니다.')
      if (!videosResponse.ok) throw new Error(videosData.error || '영상을 불러오지 못했습니다.')
      setItems(typesData.items ?? [])
      setVideos(videosData.items ?? [])
      setMessage('')
    } catch (error) {
      setMessage(error instanceof Error ? error.message : '목록을 불러오지 못했습니다.')
    } finally {
      setBusy(false)
    }
  }

  function editType(item: WrongType) {
    setDraft({
      id: item.id, code: item.code, name: item.name, grade: item.grade, semester: item.semester,
      domain: item.domain ?? '', unit: item.unit ?? '', description_ko: item.description_ko ?? '',
      description_vi: item.description_vi ?? '', description_zh_cn: item.description_zh_cn ?? '',
      display_order: item.display_order, active: item.active, primary_video_id: primaryVideo(item)?.id ?? '',
    })
  }

  async function saveType(goNext = false) {
    setBusy(true)
    try {
      const response = await fetch('/api/admin/wrong-types', { method: 'POST', headers, body: JSON.stringify(draft) })
      const data = await response.json()
      if (!response.ok) throw new Error(data.error || '저장하지 못했습니다.')
      await loadAll()
      setMessage('오답 유형을 저장했습니다.')
      if (goNext) {
        const currentIndex = filteredItems.findIndex(item => item.id === draft.id)
        const next = filteredItems.slice(currentIndex + 1).find(item => !primaryVideo(item))
          ?? filteredItems.find(item => !primaryVideo(item) && item.id !== draft.id)
        if (next) editType(next)
      } else if (!draft.id) {
        setDraft({ ...draft, id: data.item.id })
      }
    } catch (error) {
      setMessage(error instanceof Error ? error.message : '저장하지 못했습니다.')
    } finally {
      setBusy(false)
    }
  }

  async function saveVideo(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setBusy(true)
    try {
      const response = await fetch('/api/admin/videos', { method: 'POST', headers, body: JSON.stringify(videoDraft) })
      const data = await response.json()
      if (!response.ok) throw new Error(data.error || '영상을 저장하지 못했습니다.')
      await loadAll()
      setVideoDraft(emptyVideo)
      setMessage('보충영상을 저장했습니다.')
    } catch (error) {
      setMessage(error instanceof Error ? error.message : '영상을 저장하지 못했습니다.')
    } finally {
      setBusy(false)
    }
  }

  function downloadTemplate() {
    const blob = new Blob([`\uFEFF${csvColumns.join(',')}\r\n`], { type: 'text/csv;charset=utf-8' })
    const url = URL.createObjectURL(blob)
    const anchor = document.createElement('a')
    anchor.href = url
    anchor.download = 'moasem_wrong_types_template.csv'
    anchor.click()
    URL.revokeObjectURL(url)
  }

  async function importCsv(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0]
    event.target.value = ''
    if (!file) return
    setBusy(true)
    try {
      const bytes = new Uint8Array(await file.arrayBuffer())
      let csvText = new TextDecoder('utf-8').decode(bytes)
      if (csvText.includes('\uFFFD')) csvText = new TextDecoder('euc-kr').decode(bytes)
      const rows = parseCsv(csvText)
      if (rows.length < 2) throw new Error('CSV에 등록할 유형이 없습니다.')
      const header = rows[0].map(value => value.trim())
      const missing = ['code', 'name', 'grade'].filter(column => !header.includes(column))
      if (missing.length) throw new Error(`필수 열이 없습니다: ${missing.join(', ')}`)
      const csvItems = rows.slice(1).map(row => Object.fromEntries(header.map((key, index) => [key, row[index] ?? ''])))
      const response = await fetch('/api/admin/wrong-types/import', { method: 'POST', headers, body: JSON.stringify({ items: csvItems }) })
      const data = await response.json()
      if (!response.ok) throw new Error(data.error || 'CSV 등록에 실패했습니다.')
      await loadAll()
      setMessage(`${data.imported}개 오답 유형을 등록했습니다.`)
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'CSV 등록에 실패했습니다.')
    } finally {
      setBusy(false)
    }
  }

  return <main className="catalog-page">
    <header className="catalog-header">
      <div>
        <a href="/" className="catalog-back">← 관리자</a>
        <h1>오답 유형 · 보충영상</h1>
        <p>유형을 찾고 대표 영상을 연결합니다. 실제 285개 자료는 CSV로 한 번에 넣을 수 있습니다.</p>
      </div>
      <div className="catalog-keybox">
        <input type="password" value={adminKey} onChange={event => setAdminKey(event.target.value)} placeholder="관리 키" />
        <button onClick={loadAll} disabled={busy}>{busy ? '처리 중' : '목록 불러오기'}</button>
      </div>
    </header>

    <section className="catalog-statusbar">
      <strong>전체 {items.length}</strong><span>영상 연결 {connectedCount}</span><span>미연결 {items.length - connectedCount}</span><span>영상 {videos.length}</span>
      <div className="catalog-actions">
        <button className="catalog-button secondary" onClick={downloadTemplate}>CSV 양식 받기</button>
        <label className="catalog-button primary">CSV 일괄등록<input type="file" accept=".csv,text/csv" onChange={importCsv} hidden /></label>
      </div>
    </section>

    <nav className="catalog-tabs" aria-label="관리 항목">
      <button className={tab === 'types' ? 'active' : ''} onClick={() => setTab('types')}>오답 유형</button>
      <button className={tab === 'videos' ? 'active' : ''} onClick={() => setTab('videos')}>영상 보관함</button>
    </nav>

    {tab === 'types' ? <>
      <section className="catalog-filters">
        <input value={search} onChange={event => setSearch(event.target.value)} placeholder="유형명·코드 검색" />
        <select value={grade} onChange={event => setGrade(event.target.value)}><option value="all">전체 학년</option>{[1,2,3,4,5,6].map(value => <option key={value} value={value}>{value}학년</option>)}</select>
        <select value={semester} onChange={event => setSemester(event.target.value)}><option value="all">전체 학기</option><option value="1">1학기</option><option value="2">2학기</option></select>
        <select value={domain} onChange={event => setDomain(event.target.value)}><option value="all">전체 영역</option>{domains.map(value => <option key={value}>{value}</option>)}</select>
        <select value={connection} onChange={event => setConnection(event.target.value)}><option value="all">전체 연결 상태</option><option value="connected">영상 연결</option><option value="unconnected">영상 미연결</option></select>
        <button className="catalog-button secondary" onClick={() => setDraft(emptyType)}>새 유형</button>
      </section>

      <div className="catalog-workspace">
        <section className="catalog-list-panel">
          <div className="catalog-table-wrap">
            <table className="catalog-table">
              <thead><tr><th>코드</th><th>학년·학기</th><th>영역 · 단원</th><th>오답 유형명</th><th>대표 보충영상</th><th>상태</th><th>수정</th></tr></thead>
              <tbody>{filteredItems.map(item => {
                const video = primaryVideo(item)
                return <tr key={item.id} className={draft.id === item.id ? 'selected' : ''} onClick={() => editType(item)}>
                  <td><b>{item.code}</b></td><td>{item.grade}학년{item.semester ? ` ${item.semester}학기` : ''}</td>
                  <td>{item.domain || '-'}{item.unit ? <small>{item.unit}</small> : null}</td><td><b>{item.name}</b></td>
                  <td>{video ? video.title : <span className="catalog-unlinked">미연결</span>}</td><td>{item.active ? '사용' : '보관'}</td><td><button className="catalog-edit-button" onClick={() => editType(item)}>수정</button></td>
                </tr>
              })}</tbody>
            </table>
            {!filteredItems.length && <div className="catalog-empty">{items.length ? '조건에 맞는 유형이 없습니다.' : '아직 등록된 오답 유형이 없습니다. CSV 양식을 받아 한 번에 등록하세요.'}</div>}
          </div>
        </section>

        <aside className="catalog-editor">
          <div className="catalog-editor-head"><div><span>{draft.id ? '선택 유형 수정' : '새 유형'}</span><h2>{draft.name || '오답 유형 정보'}</h2></div>{draft.id && <button onClick={() => setDraft(emptyType)}>닫기</button>}</div>
          <form onSubmit={event => { event.preventDefault(); saveType(false) }} className="catalog-form">
            <div className="catalog-row2"><label>유형 코드 *<input value={draft.code} onChange={event => setDraft({ ...draft, code: event.target.value })} required placeholder="예: E3-NO-001" /></label><label>표시 순서<input type="number" value={draft.display_order} onChange={event => setDraft({ ...draft, display_order: Number(event.target.value) })} /></label></div>
            <label>오답 유형명 *<input value={draft.name} onChange={event => setDraft({ ...draft, name: event.target.value })} required placeholder="예: 세 자리 수 받아올림" /></label>
            <div className="catalog-row2"><label>학년 *<select value={draft.grade} onChange={event => setDraft({ ...draft, grade: Number(event.target.value) })}>{[1,2,3,4,5,6].map(value => <option key={value} value={value}>{value}학년</option>)}</select></label><label>학기<select value={draft.semester ?? ''} onChange={event => setDraft({ ...draft, semester: event.target.value ? Number(event.target.value) : null })}><option value="">구분 없음</option><option value="1">1학기</option><option value="2">2학기</option></select></label></div>
            <div className="catalog-row2"><label>영역<input value={draft.domain ?? ''} onChange={event => setDraft({ ...draft, domain: event.target.value })} placeholder="수와 연산" /></label><label>단원<input value={draft.unit ?? ''} onChange={event => setDraft({ ...draft, unit: event.target.value })} placeholder="덧셈과 뺄셈" /></label></div>
            <label>보호자용 설명 · 한국어<textarea rows={2} value={draft.description_ko ?? ''} onChange={event => setDraft({ ...draft, description_ko: event.target.value })} /></label>
            <label>베트남어<textarea rows={2} value={draft.description_vi ?? ''} onChange={event => setDraft({ ...draft, description_vi: event.target.value })} /></label>
            <label>중국어 간체<textarea rows={2} value={draft.description_zh_cn ?? ''} onChange={event => setDraft({ ...draft, description_zh_cn: event.target.value })} /></label>
            <label>대표 보충영상<select value={draft.primary_video_id} onChange={event => setDraft({ ...draft, primary_video_id: event.target.value })}><option value="">연결하지 않음</option>{videos.filter(video => video.active).map(video => <option key={video.id} value={video.id}>{video.title} · {languageLabel[video.language]}</option>)}</select></label>
            <label className="catalog-check"><input type="checkbox" checked={draft.active} onChange={event => setDraft({ ...draft, active: event.target.checked })} />현재 사용하는 유형</label>
            <div className="catalog-savebar"><button type="submit" className="catalog-button primary" disabled={busy}>저장</button><button type="button" className="catalog-button dark" disabled={busy || !draft.id} onClick={() => saveType(true)}>저장 후 다음 미연결</button></div>
          </form>
        </aside>
      </div>
    </> : <div className="catalog-workspace videos">
      <section className="catalog-list-panel">
        <div className="catalog-section-title"><h2>영상 보관함</h2><button className="catalog-button secondary" onClick={() => setVideoDraft(emptyVideo)}>새 영상</button></div>
        <div className="catalog-table-wrap"><table className="catalog-table"><thead><tr><th>영상명</th><th>언어</th><th>시간</th><th>공개 방식</th><th>연결 유형</th><th>상태</th></tr></thead><tbody>{videos.map(video => <tr key={video.id} className={videoDraft.id === video.id ? 'selected' : ''} onClick={() => setVideoDraft(video)}><td><b>{video.title}</b><small>{video.provider}</small></td><td>{languageLabel[video.language]}</td><td>{formatDuration(video.duration_seconds)}</td><td>{visibilityLabel[video.visibility]}</td><td>{linkedCount(video.id)}개</td><td>{video.active ? '사용' : '보관'}</td></tr>)}</tbody></table>{!videos.length && <div className="catalog-empty">아직 등록된 영상이 없습니다.</div>}</div>
      </section>
      <aside className="catalog-editor">
        <div className="catalog-editor-head"><div><span>{videoDraft.id ? '영상 수정' : '새 영상'}</span><h2>{videoDraft.title || '보충영상 정보'}</h2></div></div>
        <form onSubmit={saveVideo} className="catalog-form">
          <label>영상 제목 *<input value={videoDraft.title} onChange={event => setVideoDraft({ ...videoDraft, title: event.target.value })} required /></label>
          <label>영상 주소 *<input type="url" value={videoDraft.url} onChange={event => setVideoDraft({ ...videoDraft, url: event.target.value })} required placeholder="https://..." /></label>
          <div className="catalog-row2"><label>재생시간(초)<input type="number" min="0" value={videoDraft.duration_seconds ?? ''} onChange={event => setVideoDraft({ ...videoDraft, duration_seconds: event.target.value ? Number(event.target.value) : null })} /></label><label>언어<select value={videoDraft.language} onChange={event => setVideoDraft({ ...videoDraft, language: event.target.value })}><option value="ko">한국어</option><option value="vi">베트남어</option><option value="zh-CN">중국어 간체</option></select></label></div>
          <div className="catalog-row2"><label>영상 서비스<select value={videoDraft.provider} onChange={event => setVideoDraft({ ...videoDraft, provider: event.target.value })}><option value="youtube">YouTube</option><option value="vimeo">Vimeo</option><option value="direct">직접 영상</option><option value="other">기타</option></select></label><label>공개 방식<select value={videoDraft.visibility} onChange={event => setVideoDraft({ ...videoDraft, visibility: event.target.value })}><option value="unlisted">일부 공개</option><option value="public">공개</option><option value="private">비공개</option></select></label></div>
          <label className="catalog-check"><input type="checkbox" checked={videoDraft.active} onChange={event => setVideoDraft({ ...videoDraft, active: event.target.checked })} />현재 사용하는 영상</label>
          {videoDraft.url && <a href={videoDraft.url} target="_blank" rel="noreferrer" className="catalog-preview-link">새 창에서 영상 확인</a>}
          <button className="catalog-button primary" disabled={busy}>영상 저장</button>
        </form>
      </aside>
    </div>}
    {message && <div className="catalog-message" role="status">{message}</div>}
  </main>
}
