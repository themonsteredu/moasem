'use client'

import { useEffect, useMemo, useRef, useState } from 'react'

const storageKey = 'moasem-admin-key'

export function adminHeaders(key: string) {
  return { 'Content-Type': 'application/json', 'x-moasem-admin-key': key }
}

// Keep the existing tab-scoped access key; never persist student data in storage.
export function useAdminConnection(onRestore: (key: string) => Promise<void>) {
  const [adminKey, setAdminKey] = useState('')
  const [storageMessage, setStorageMessage] = useState('')
  const restore = useRef(onRestore)
  const restored = useRef(false)

  useEffect(() => {
    if (restored.current) return
    restored.current = true
    try {
      const saved = sessionStorage.getItem(storageKey)
      if (saved) {
        setAdminKey(saved)
        void restore.current(saved)
      }
    } catch {
      setStorageMessage('브라우저에서 연결 유지를 허용하지 않습니다. 이 화면에서 관리 키로 연결해 주세요.')
    }
  }, [])

  const headers = useMemo(() => adminHeaders(adminKey), [adminKey])

  function rememberKey(key: string) {
    try {
      sessionStorage.setItem(storageKey, key)
      setStorageMessage('')
    } catch {
      setStorageMessage('목록은 불러왔지만 연결을 기억하지 못했습니다. 메뉴를 이동하면 관리 키를 다시 입력해야 합니다.')
    }
  }

  function forgetKey() {
    try { sessionStorage.removeItem(storageKey) } catch { /* Storage may be disabled. */ }
  }

  function disconnect() {
    try {
      sessionStorage.removeItem(storageKey)
    } catch {
      setStorageMessage('연결을 해제하지 못했습니다. 사용을 마치면 이 탭을 닫아 주세요.')
      return
    }
    // A fresh page also clears all loaded lists, report links and unsaved forms.
    window.location.reload()
  }

  return { adminKey, setAdminKey, headers, rememberKey, forgetKey, disconnect, storageMessage }
}
