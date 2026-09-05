export type Staff = { id: string; name: string; email: string; role: 'admin' | 'instructor'; instructor_id: string | null }
export function staffHome(staff: Staff) { return staff.role === 'admin' ? '/' : '/my-students' }
export function canOpenWorkspace(staff: Staff, path: string) { return staff.role === 'admin' || ['/my-students', '/attendance', '/reports'].includes(path) }
