export const reviewFilters = ['submitted', 'assigned', 'overdue', 'checked', 'all'] as const
export type ReviewFilter = typeof reviewFilters[number]
export const reviewLabels: Record<ReviewFilter, string> = {
  submitted: '확인 대기', assigned: '미제출', overdue: '기한 초과', checked: '확인 완료', all: '전체',
}
export const reviewPageSize = 30
export type ReviewItem = {
  id: string; title: string; details: string; assigned_on: string; due_on: string
  status: 'assigned' | 'submitted' | 'checked'; submitted_at: string | null; checked_at: string | null
  student: { id: string; name: string; grade: number }; photo_count: number
}
export type ReviewList = {
  items: ReviewItem[]; counts: Record<ReviewFilter, number>; total: number
  page: number; page_size: number; today: string
}
export type ReviewDetail = { item: ReviewItem; photos: { id: string; url: string }[]; expires_in: number }

export function koreaToday(now = new Date()) {
  const parts = new Intl.DateTimeFormat('en', { timeZone: 'Asia/Seoul', year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(now)
  return ['year', 'month', 'day'].map(type => parts.find(p => p.type === type)!.value).join('-')
}
export function deadlineLabel(item: Pick<ReviewItem, 'status' | 'assigned_on' | 'due_on'>, today: string) {
  if (item.status !== 'assigned') return ''
  if (item.due_on < today) return '기한 초과'
  if (item.due_on === today) return '오늘 마감'
  return item.assigned_on > today ? '시작 전' : '마감 전'
}
