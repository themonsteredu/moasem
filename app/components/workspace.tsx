'use client'

import { ReactNode, useState } from 'react'
import { SessionGate, useStaff, logout } from './staff-session'
import { staffHome } from '../../lib/staff-types'

type IconName = 'overview' | 'attendance' | 'report' | 'video' | 'arrow' | 'plus' | 'lock' | 'check' | 'people'
const paths: Record<IconName, ReactNode> = {
  overview: <><rect x="3" y="3" width="7" height="7" rx="1.5"/><rect x="14" y="3" width="7" height="7" rx="1.5"/><rect x="3" y="14" width="7" height="7" rx="1.5"/><rect x="14" y="14" width="7" height="7" rx="1.5"/></>,
  attendance: <><rect x="3" y="5" width="18" height="16" rx="2"/><path d="M16 3v4M8 3v4M3 11h18m-14 5 3 3 6-6"/></>,
  report: <><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8zM14 2v6h6M8 13h8M8 17h5"/></>,
  video: <><rect x="3" y="4" width="18" height="16" rx="3"/><path d="m10 8 6 4-6 4z"/></>,
  arrow: <path d="M5 12h14m-6-6 6 6-6 6"/>,
  plus: <path d="M12 5v14M5 12h14"/>,
  lock: <><rect x="5" y="10" width="14" height="11" rx="2"/><path d="M8 10V7a4 4 0 0 1 8 0v3M12 14v3"/></>,
  check: <path d="m5 12 4 4L19 6"/>,
  people: <><circle cx="9" cy="8" r="3"/><path d="M3 21v-2a6 6 0 0 1 12 0v2M16 5a3 3 0 0 1 0 6m2 4a5 5 0 0 1 3 4v2"/></>,
}

export function Icon({ name, size = 20 }: { name: IconName; size?: number }) {
  return <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.65" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">{paths[name]}</svg>
}

const nav = [
  { href: '/', title: '기관·학생 관리', icon: 'overview' as const },
  { href: '/instructors', title: '강사 관리', icon: 'people' as const },
  { href: '/attendance', title: '대면 출석', icon: 'attendance' as const },
  { href: '/reports', title: '보호자 리포트', icon: 'report' as const },
  { href: '/wrong-types', title: '오답·보충영상', icon: 'video' as const },
]

export function Workspace({ current, title, description, action, children }: { current: string; title: string; description: string; action?: ReactNode; children: ReactNode }) {
  const { staff } = useStaff()
  const menu = staff?.role === 'instructor' ? [{ href: '/my-students', title: '내 학생', icon: 'people' as const }, ...nav.filter(item => ['/attendance', '/reports'].includes(item.href))] : nav
  return <SessionGate><div className="workspace">
    <a className="skip-link" href="#workspace-content">본문으로 이동</a>
    <aside className="workspace-sidebar">
      <a href={staff ? staffHome(staff) : "/login"} className="wordmark" aria-label="모아셈 홈"><span className="brand-symbol">m<span>:</span></span><span>MOASEM<small>모아셈</small></span></a>
      <div className="sidebar-label">학습 운영</div>
      <nav data-role={staff?.role} className="workspace-nav" aria-label="학습관리 메뉴">{menu.map(item => <a key={item.href} href={item.href} className={current === item.href ? 'active' : ''} aria-current={current === item.href ? 'page' : undefined}><Icon name={item.icon}/><span>{item.title}</span></a>)}</nav>
      <div className="sidebar-footer"><span className="sidebar-avatar">M</span><div><strong>MOAKIT</strong><small>기관 위탁 수학 학습관리</small></div></div>
    </aside>
    <div className="workspace-body">
      <div className="workspace-topline"><span>모아셈 <span className="breadcrumb-separator">/</span> {menu.find(item => item.href === current)?.title}</span><span className="workspace-role">{staff?.name} · {staff?.role === 'admin' ? '관리자' : '강사'}</span></div>
      <main id="workspace-content" className="workspace-content">
        <header className="page-heading"><div><h1>{title}</h1><p>{description}</p></div>{action}</header>
        {children}
      </main>
    </div>
  </div></SessionGate>
}

export function StaffAccess({ onLoad, busy = false }: { onLoad: () => void; busy?: boolean }) {
  const { staff } = useStaff()
  const [error, setError] = useState('')
  const [leaving, setLeaving] = useState(false)
  async function leave() {
    setLeaving(true); setError('')
    try { await logout() } catch (e) { setError(e instanceof Error ? e.message : '다시 시도해 주세요.'); setLeaving(false) }
  }
  return <div className="access-bar">
    <div className="access-caption" role="status"><Icon name="check" size={17}/><span>{error || (busy ? '목록을 불러오는 중…' : `${staff?.name || ''} 님으로 로그인했습니다`)}</span></div>
    <div className="access-controls"><button className="button button-dark" onClick={onLoad} disabled={busy || leaving}>새로고침</button><button className="button" onClick={leave} disabled={leaving}>{leaving ? '로그아웃 중…' : '로그아웃'}</button></div>
  </div>
}

export function Notice({ children }: { children: ReactNode }) {
  return children ? <div className="notice" role="status" aria-live="polite">{children}</div> : null
}

export function EmptyState({ title, description, icon = 'overview' }: { title: string; description: string; icon?: IconName }) {
  return <div className="empty-state"><span className="empty-icon"><Icon name={icon} size={25}/></span><h3>{title}</h3><p>{description}</p></div>
}
