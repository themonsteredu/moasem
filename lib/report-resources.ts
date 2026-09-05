export type ReportLanguage = import('./languages').SupportedLanguage
export type ReportVideo = { id: string | null; title: string; url: string; language: string }
export type ReportWrongType = { id: string; name: string; description_ko: string | null; description_en?: string | null; description_vi: string | null; description_zh_cn: string | null }
export type ReportResources = { version: 1; wrong_types: ReportWrongType[]; videos: ReportVideo[] }
export type ReportOption = ReportWrongType & { code: string; grade: number; unit: string | null; video: ReportVideo | null }

export function safeVideoUrl(value: unknown): string | null {
  if (typeof value !== 'string' || !value.trim()) return null
  try {
    const url = new URL(value.trim())
    return ['https:', 'http:'].includes(url.protocol) && !url.username && !url.password ? url.href : null
  } catch { return null }
}

export function uniqueVideos(videos: ReportVideo[]): ReportVideo[] {
  const seen = new Set<string>()
  return videos.flatMap(video => {
    const url = safeVideoUrl(video.url)
    if (!url || seen.has(url)) return []
    seen.add(url)
    return [{ ...video, url }]
  })
}

export function typeDescription(type: ReportWrongType, language: string) {
  return language === 'en' ? type.description_en : language === 'vi' ? type.description_vi : language === 'zh-CN' ? type.description_zh_cn : type.description_ko
}

// Also accepts older reports, which only stored one manually entered video URL.
export function reportResources(snapshot: unknown, legacyVideoUrl?: unknown): ReportResources {
  const source = snapshot && typeof snapshot === 'object' ? snapshot as Partial<ReportResources> : null
  const wrongTypes = Array.isArray(source?.wrong_types) ? source.wrong_types.filter(item => item && typeof item.id === 'string' && typeof item.name === 'string') : []
  const videos = Array.isArray(source?.videos) ? source.videos.filter(item => item && typeof item.url === 'string' && typeof item.title === 'string') : []
  const legacy = safeVideoUrl(legacyVideoUrl)
  return { version: 1, wrong_types: wrongTypes, videos: uniqueVideos([...videos, ...(legacy ? [{ id: null, title: '', url: legacy, language: 'ko' }] : [])]) }
}
