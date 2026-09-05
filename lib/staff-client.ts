'use client'

let refreshing: Promise<Response> | null = null
export const jsonHeaders = { 'Content-Type': 'application/json' }

export async function apiFetch(url: string, options: RequestInit = {}) {
  const send = () => fetch(url, { ...options, cache: 'no-store', credentials: 'same-origin' })
  let response = await send()
  if (response.status === 401) {
    if (!refreshing) {
      refreshing = fetch('/api/auth/session', { cache: 'no-store', credentials: 'same-origin' })
        .finally(() => { refreshing = null })
    }
    const session = await refreshing
    if (session.ok) response = await send()
    else if (session.status >= 500) throw new Error('연결이 잠시 끊겼습니다. 다시 시도해 주세요.')
    else window.location.replace('/login')
  }
  return response
}
