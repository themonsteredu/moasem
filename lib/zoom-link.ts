// Only participant invitation links are stored; host credentials must never be shared.
export function zoomJoinUrl(value: unknown): string | null {
  if (value === null || value === '') return null
  if (typeof value !== 'string' || value.length > 2048) throw new Error('INVALID_ZOOM_LINK')
  try {
    const url = new URL(value.trim())
    if (url.protocol !== 'https:' || !/^(?:[a-z0-9-]+\.)*zoom\.us$/.test(url.hostname) || url.port || url.username || url.password || url.hash || !/^\/j\/\d{9,11}$/.test(url.pathname)) throw new Error()
    url.searchParams.forEach((_value, key) => { if (key !== 'pwd') throw new Error() })
    if (url.searchParams.getAll('pwd').length > 1) throw new Error()
    return url.toString()
  } catch { throw new Error('INVALID_ZOOM_LINK') }
}
export function attendanceType(value: unknown): 'in_person' | 'zoom' {
  if (value == null || value === 'in_person') return 'in_person'
  if (value === 'zoom') return 'zoom'
  throw new Error('INVALID_SESSION_TYPE')
}
