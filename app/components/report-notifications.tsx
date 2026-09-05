'use client'

import { useEffect, useState } from 'react'
import { apiFetch, jsonHeaders } from '../../lib/staff-client'
import { notificationLabels, notificationMessages, NotificationView } from '../../lib/notification-view'

type Item = { token: string; lesson_date: string; expires_at: string; language: string; recipient: string; recipient_changed: boolean; attempts: number; notification: NotificationView | null }
type Props = { studentId: string; revision: number; onReady: (ready: boolean) => void; onBusy: (busy: boolean) => void; disabled: boolean }
export function ReportNotifications({ studentId, revision, onReady, onBusy, disabled }: Props) {
  const [items, setItems] = useState<Item[]>([])
  const [configured, setConfigured] = useState(false)
  const [busy, setBusy] = useState(false)
  const [loading, setLoading] = useState(false)
  const [reload, setReload] = useState(0)
  const [notice, setNotice] = useState('')
  useEffect(() => {
    let alive = true
    setItems([]); setConfigured(false); onReady(false); setNotice('')
    if (!studentId) { setLoading(false); return }
    setLoading(true)
    apiFetch(`/api/admin/report-notifications?student_id=${encodeURIComponent(studentId)}`).then(async response => {
      const data = await response.json()
      if (!response.ok) throw new Error(data.error || '발송 내역을 불러오지 못했습니다.')
      if (alive) { setItems(data.items || []); setConfigured(Boolean(data.configured)); onReady(Boolean(data.configured)) }
    }).catch(error => { if (alive) setNotice(error.message || '발송 내역을 불러오지 못했습니다.') }).finally(() => { if (alive) setLoading(false) })
    return () => { alive = false }
  }, [studentId, revision, reload, onReady])
  async function act(item: Item, action: 'send' | 'refresh') {
    if (busy || disabled) return
    setBusy(true); onBusy(true); setNotice('')
    try {
      const response = await apiFetch(`/api/admin/learning-reports/${item.token}/notification`, { method: 'POST', headers: jsonHeaders, body: JSON.stringify({ action, retry: item.notification?.status === 'failed' }) })
      const data = await response.json()
      if (!response.ok) throw new Error(data.error || '알림톡 요청을 처리하지 못했습니다.')
      setItems(current => current.map(row => row.token === item.token ? { ...row, notification: data.notification, attempts: row.attempts + (action === 'send' && !data.duplicate ? 1 : 0) } : row))
      setNotice(data.notice || notificationMessages[data.notification?.status] || '발송 내역을 확인했습니다.')
    } catch (error) { setNotice(error instanceof Error ? error.message : '잠시 후 다시 확인해 주세요.') }
    finally { setBusy(false); onBusy(false) }
  }
  return <section className="surface notification-panel">
    <div className="notification-heading"><h2>최근 리포트·알림톡</h2><span>MOAKIT</span></div>
    {!studentId ? <p className="field-help">학생을 선택하면 최근 리포트와 발송 내역을 볼 수 있어요.</p> : <>
      {loading ? <p className="field-help" role="status">발송 내역을 불러오고 있습니다.</p> : <>
        {!configured && <p className="field-help">모아킷 알림톡 연결 후 발송할 수 있어요. 지금은 리포트 링크를 직접 전달해 주세요.</p>}
        {!items.length && <p className="field-help">아직 만든 리포트가 없습니다.</p>}
        <div className="notification-list">{items.map(item => {
          const status = item.notification?.status
          const expiry = new Date(item.expires_at).getTime()
          const expired = !Number.isFinite(expiry) || expiry <= Date.now()
          const canSend = configured && !expired && !item.recipient_changed && (!status || (status === 'failed' && item.attempts < 3))
          return <article className="notification-row" key={item.token}>
            <div><strong>{item.lesson_date || '학습 리포트'}</strong><small>{item.recipient}</small></div>
            <p className={`notification-state notification-${status || 'unsent'}`}>{expired ? '링크 만료' : status ? notificationLabels[status] || '결과 확인 필요' : '아직 보내지 않음'}</p>
            {item.recipient_changed && <p className="field-help">보호자 정보가 달라 발송할 수 없습니다.</p>}
            <div className="notification-actions">{!expired && <a className="button button-small" href={`/report/${item.token}`} target="_blank" rel="noreferrer">리포트 보기</a>}
              {canSend && <button type="button" className="button button-small button-dark" disabled={busy || disabled} onClick={() => act(item, 'send')}>{status === 'failed' ? '알림톡 다시 보내기' : '알림톡 보내기'}</button>}
              {status && !['delivered', 'failed'].includes(status) && <button type="button" className="button button-small" disabled={busy || disabled} onClick={() => act(item, 'refresh')}>도착 여부 확인</button>}
            </div>
          </article>
        })}</div>
      </>}
      <button className="button button-small" type="button" disabled={busy || disabled || loading} onClick={() => setReload(value => value + 1)}>내역 새로고침</button>
    </>}
    {notice && <p className="field-help" role="status">{notice}</p>}
  </section>
}
