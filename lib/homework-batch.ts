import { AccessError } from './admin-auth'
import { dateInput, textInput, uuidInput } from './learning-operations'
export function homeworkBatchInput(value: unknown) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new AccessError(400, '과제 내용을 확인해 주세요.')
  const b = value as Record<string, unknown>
  if (!Array.isArray(b.student_ids) || b.student_ids.length < 1 || b.student_ids.length > 200) throw new AccessError(400, '학생을 1명 이상, 200명 이하로 선택해 주세요.')
  const students = b.student_ids.map(id => uuidInput(id).toLowerCase()).sort()
  if (new Set(students).size !== students.length) throw new AccessError(400, '학생이 중복 선택되었습니다.')
  const input = { id: uuidInput(b.id), program_id: uuidInput(b.program_id), student_ids: students, title: textInput(b.title, 200), details: textInput(b.details, 2000, false), assigned_on: dateInput(b.assigned_on), due_on: dateInput(b.due_on) }
  if (input.due_on < input.assigned_on) throw new AccessError(400, '마감일은 시작일 이후로 선택해 주세요.')
  return input
}
