import { AccessError } from './admin-auth'
import { getSupabaseAdmin } from './supabase-admin'
import type { Staff } from './staff-types'
import { reviewFilters, type ReviewFilter, type ReviewItem } from './homework-review'

export const reviewColumns = 'id,title,details,assigned_on,due_on,status,submitted_at,checked_at'
export type ReviewRow = Omit<ReviewItem, 'photo_count'> & { photos: { id: string; storage_path?: string }[] }

export function reviewInput(params: URLSearchParams) {
  const filter = params.get('filter') ?? 'submitted', rawPage = params.get('page') ?? '1'
  if (!reviewFilters.includes(filter as ReviewFilter) || !/^[1-9]\d{0,5}$/.test(rawPage)) throw new AccessError(400, '과제 구분과 페이지를 확인해 주세요.')
  return { filter: filter as ReviewFilter, page: Number(rawPage) }
}

// Service-role reads must all carry the same current student/program scope.
// Keep both joins inner: filtering an embedded child alone does not filter parents.
export function scopedHomework(staff: Staff, programId: string, columns: string, head = false) {
  let query = getSupabaseAdmin().from('homework')
    .select(`${columns},student:students!inner(id,name,grade,program_id,active),program:programs!inner(instructor_id)`, { count: 'exact', head })
    .eq('program_id', programId).eq('student.program_id', programId).eq('student.active', true)
  if (staff.role === 'instructor') query = query.eq('program.instructor_id', staff.instructor_id!)
  return query
}
export function filteredHomework(staff: Staff, programId: string, columns: string, filter: ReviewFilter, today: string, head = false) {
  let query = scopedHomework(staff, programId, columns, head)
  if (filter === 'overdue') query = query.eq('status', 'assigned').lt('due_on', today)
  else if (filter !== 'all') query = query.eq('status', filter)
  return query
}
export function publicReviewItem(row: ReviewRow): ReviewItem {
  return {
    id: row.id, title: row.title, details: row.details, assigned_on: row.assigned_on, due_on: row.due_on,
    status: row.status, submitted_at: row.submitted_at, checked_at: row.checked_at,
    student: { id: row.student.id, name: row.student.name, grade: row.student.grade }, photo_count: row.photos.length,
  }
}
