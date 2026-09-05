import type { Metadata } from 'next'
import './globals.css'
import { StaffProvider } from './components/staff-session'

export const metadata: Metadata = {
  title: '모아셈 | 기관 위탁 수학 학습관리',
  description: '기관 위탁형 초등 수학 학습관리 서비스',
}

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="ko">
      <body><StaffProvider>{children}</StaffProvider></body>
    </html>
  )
}
