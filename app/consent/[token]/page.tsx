import type { Metadata } from 'next'
import { isSupportedLanguage } from '../../../lib/languages'
import { GuardianConsentForm } from '../../components/guardian-consent-form'

export const dynamic = 'force-dynamic'
export const metadata: Metadata = { title: 'MOASEM · 보호자 동의', robots: { index: false, follow: false }, referrer: 'no-referrer' }

export default async function ConsentPage(
  { params, searchParams }: { params: Promise<{ token: string }>; searchParams: Promise<{ lang?: string }> }
) {
  const { token } = await params
  const { lang } = await searchParams
  return <GuardianConsentForm key={token} token={token} initialLanguage={isSupportedLanguage(lang) ? lang : 'ko'}/>
}
