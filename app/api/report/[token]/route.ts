import { NextRequest, NextResponse } from 'next/server'
import { getSupabaseAdmin } from '@/lib/supabase-admin'
import { reportResources } from '@/lib/report-resources'

export const dynamic = 'force-dynamic'
export const revalidate = 0

const privateHeaders = {
  'Cache-Control': 'private, no-store, max-age=0',
  'X-Robots-Tag': 'noindex, nofollow, noarchive',
}

export async function GET(_request: NextRequest, { params }: { params: { token: string } }) {
  try {
    const supabase = getSupabaseAdmin()
    const { data: report, error } = await supabase
      .from('guardian_reports')
      .select('language,headline,action_line,expires_at,student:students(id,name,grade),learning_log:learning_logs(lesson_date,solved_count,wrong_count,wrong_type_summary,weekly_assignment,video_url,resource_snapshot)')
      .eq('token', params.token)
      .single()

    if (error || !report) {
      return NextResponse.json({ error: '리포트를 찾지 못했습니다.' }, { status: 404, headers: privateHeaders })
    }
    const expiresAt = new Date(report.expires_at).getTime()
    if (!Number.isFinite(expiresAt) || expiresAt <= Date.now()) {
      return NextResponse.json({ error: '리포트 링크가 만료되었습니다.' }, { status: 410, headers: privateHeaders })
    }

    const log = Array.isArray(report.learning_log) ? report.learning_log[0] : report.learning_log
    const resources = reportResources(log?.resource_snapshot, log?.video_url)
    return NextResponse.json({ report: { ...report, resources } }, { headers: privateHeaders })
  } catch {
    return NextResponse.json({ error: '리포트를 불러오지 못했습니다.' }, { status: 500, headers: privateHeaders })
  }
}
