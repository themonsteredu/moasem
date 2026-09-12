'use client'

import { useEffect, useRef, useState } from 'react'
import { apiFetch } from '@/lib/staff-client'
import type { WeeklyProgram } from '@/lib/weekly-progress'
import { useStaffData } from '../components/staff-session'
import { Notice, StaffAccess, Workspace } from '../components/workspace'
import { WeeklyProgress } from '../components/weekly-progress'

export default function WeeklyProgressPage() {
  const [programs, setPrograms] = useState<WeeklyProgram[]>([]), [programId, setProgramId] = useState('')
  const [loading, setLoading] = useState(false), [error, setError] = useState(''), [refresh, setRefresh] = useState(0)
  const revision = useRef(0)
  useStaffData(loadPrograms)
  useEffect(() => () => { revision.current++ }, [])
  async function loadPrograms() {
    const seq = ++revision.current
    setLoading(true); setError('')
    try {
      const r = await apiFetch('/api/admin/programs'), d = await r.json()
      if (!r.ok || !Array.isArray(d.items)) throw Error(d.error || '프로그램을 불러오지 못했습니다.')
      if (seq !== revision.current) return
      setPrograms(d.items); setProgramId(id => d.items.some((p: WeeklyProgram) => p.id === id) ? id : '')
      setRefresh(v => v + 1)
    } catch (e) {
      if (seq === revision.current) { setPrograms([]); setProgramId(''); setError(e instanceof Error ? e.message : '프로그램을 불러오지 못했습니다.') }
    } finally { if (seq === revision.current) setLoading(false) }
  }
  return <Workspace current="/weekly-progress" title="주차별 진도표" description="학생별 진도·과제·출석을 주차별로 확인하세요. 칸을 누르면 자세한 기록이 열립니다.">
    <StaffAccess onLoad={loadPrograms} busy={loading}/>
    <section className="surface homework-program"><label className="field"><span>프로그램</span><select aria-label="진도표 프로그램" value={programId} disabled={loading} onChange={e => setProgramId(e.target.value)}><option value="">프로그램 선택</option>{programs.map(p => <option key={p.id} value={p.id}>{p.institution?.name} · {p.name}</option>)}</select></label><p>개인 학습기록에 입력한 내용을 모아 보여줍니다.</p></section>
    <Notice>{error}</Notice>
    <WeeklyProgress key={programId || 'none'} programId={programId} refresh={refresh}/>
  </Workspace>
}
