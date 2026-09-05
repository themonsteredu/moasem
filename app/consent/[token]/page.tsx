import type { Metadata } from 'next'
import { isSupportedLanguage } from '../../../lib/languages'
import { GuardianConsentForm } from '../../components/guardian-consent-form'

export const dynamic = 'force-dynamic'
export const metadata: Metadata = { title: 'MOASEM · 보호자 동의', robots: { index: false, follow: false }, referrer: 'no-referrer' }

export default function ConsentPage({ params, searchParams }: { params: { token: string }; searchParams: { lang?: string } }) {
  return <GuardianConsentForm key={params.token} token={params.token} initialLanguage={isSupportedLanguage(searchParams.lang) ? searchParams.lang : 'ko'}/>
}
