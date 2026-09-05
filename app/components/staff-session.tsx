'use client'

import { createContext, useContext, useEffect, useRef, useState, ReactNode } from 'react'
import { usePathname } from 'next/navigation'
import { Staff, canOpenWorkspace, staffHome } from '../../lib/staff-types'

const SessionContext = createContext<{ staff: Staff | null; error: string; retry: () => void }>({ staff: null, error: '', retry: () => {} })
const protectedPaths = ['/', '/attendance', '/reports', '/wrong-types', '/instructors', '/my-students']

export function StaffProvider({ children }: { children: ReactNode }) {
  const pathname = usePathname()
  const [staff, setStaff] = useState<Staff | null>(null)
  const [error, setError] = useState('')
  const [attempt, setAttempt] = useState(0)
  useEffect(() => {
    if (!protectedPaths.includes(pathname)) return
    let alive = true
    setStaff(null); setError('')
    try { sessionStorage.removeItem('moasem-admin-key') } catch { /* Optional old key cleanup. */ }
    fetch('/api/auth/session', { cache: 'no-store' }).then(async response => {
      if (response.status === 401 || response.status === 403) { window.location.replace('/login'); return }
      if (!response.ok) throw new Error('로그인 상태를 확인하지 못했습니다. 다시 시도해 주세요.')
      const data = await response.json()
      if (!alive) return
      if (!canOpenWorkspace(data.staff, pathname)) { window.location.replace(staffHome(data.staff)); return }
      setStaff(data.staff)
    }).catch(e => { if (alive) setError(e instanceof Error ? e.message : '연결을 확인해 주세요.') })
    return () => { alive = false }
  }, [pathname, attempt])
  return <SessionContext.Provider value={{ staff, error, retry: () => setAttempt(value => value + 1) }}>{children}</SessionContext.Provider>
}

export function useStaff() { return useContext(SessionContext) }

export function useStaffData(load: () => Promise<void>) {
  const { staff } = useStaff()
  const pathname = usePathname()
  const loader = useRef(load)
  loader.current = load
  useEffect(() => { if (staff && canOpenWorkspace(staff, pathname)) void loader.current() }, [staff, pathname])
}

export function SessionGate({ children }: { children: ReactNode }) {
  const { staff, error, retry } = useStaff()
  if (staff) return <>{children}</>
  return <main className="login-shell"><section className="surface login-card"><h1>모아셈</h1><p role="status">{error || '로그인 상태를 확인하고 있습니다…'}</p>{error && <button className="button button-primary" onClick={retry}>다시 시도</button>}</section></main>
}

export async function logout() {
  const response = await fetch('/api/auth/logout', { method: 'POST' })
  if (!response.ok) throw new Error('로그아웃하지 못했습니다. 다시 시도해 주세요.')
  window.location.replace('/login')
}
