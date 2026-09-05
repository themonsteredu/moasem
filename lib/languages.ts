export const supportedLanguages = ['ko', 'en', 'vi', 'zh-CN'] as const
export type SupportedLanguage = typeof supportedLanguages[number]
export const languageLabels: Record<string, string> = { ko: '한국어', en: '영어', vi: '베트남어', 'zh-CN': '중국어 간체' }
export const languageNames: Record<SupportedLanguage, string> = { ko: '한국어', en: 'English', vi: 'Tiếng Việt', 'zh-CN': '简体中文' }
export function isSupportedLanguage(value: unknown): value is SupportedLanguage {
  return typeof value === 'string' && (supportedLanguages as readonly string[]).includes(value)
}
export function languageLocale(language: string) {
  return language === 'en' ? 'en-US' : language === 'vi' ? 'vi-VN' : language === 'zh-CN' ? 'zh-CN' : 'ko-KR'
}
