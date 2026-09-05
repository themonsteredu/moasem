import { StudentProgress } from '../../components/student-progress'
export const metadata = { title: '개인 학습기록 · 모아셈', robots: { index: false, follow: false } }
export default function Page({ params }: { params: { id: string } }) { return <StudentProgress key={params.id} studentId={params.id}/> }
