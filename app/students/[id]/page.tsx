import { StudentProgress } from '../../components/student-progress'
export const metadata = { title: '개인 학습기록 · 모아셈', robots: { index: false, follow: false } }
export default async function Page({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  return <StudentProgress key={id} studentId={id}/>
}
