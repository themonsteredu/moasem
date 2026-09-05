import { NextRequest, NextResponse } from 'next/server'
import { assertAdmin, authErrorResponse } from '@/lib/admin-auth'
import { getSupabaseAdmin } from '@/lib/supabase-admin'

const privateHeaders = { 'Cache-Control': 'private, no-store, max-age=0' }

function optionalText(value: unknown) {
  const text = String(value ?? '').trim()
  return text || null
}

export const dynamic = 'force-dynamic'

export async function POST(request: NextRequest) {
  try {
    await assertAdmin(request)
    const body = await request.json()
    const rows = Array.isArray(body.items) ? body.items : []

    if (!rows.length || rows.length > 500) {
      return NextResponse.json({ error: '한 번에 1~500개 유형을 등록할 수 있습니다.' }, { status: 400, headers: privateHeaders })
    }

    const seen = new Set<string>()
    const items = rows.map((row: Record<string, unknown>, index: number) => {
      const code = String(row.code ?? '').trim()
      const name = String(row.name ?? '').trim()
      const grade = Number(row.grade)
      const semester = row.semester ? Number(row.semester) : null
      if (!code || !name || !Number.isInteger(grade) || grade < 1 || grade > 12) {
        throw new Error(`${index + 2}행의 코드, 유형명 또는 학년을 확인하세요.`)
      }
      if (semester !== null && semester !== 1 && semester !== 2) {
        throw new Error(`${index + 2}행의 학기는 1 또는 2만 가능합니다.`)
      }
      if (seen.has(code)) throw new Error(`${index + 2}행의 유형 코드가 파일 안에서 중복됩니다.`)
      seen.add(code)

      return {
        code,
        name,
        grade,
        semester,
        domain: optionalText(row.domain),
        unit: optionalText(row.unit),
        description_ko: optionalText(row.description_ko),
        description_vi: optionalText(row.description_vi),
        description_zh_cn: optionalText(row.description_zh_cn),
        display_order: Number.isInteger(Number(row.display_order)) ? Number(row.display_order) : index,
        active: row.active !== false && String(row.active).toLowerCase() !== 'false' && String(row.active) !== '0',
        updated_at: new Date().toISOString(),
      }
    })

    const supabase = getSupabaseAdmin()
    const { data, error } = await supabase
      .from('wrong_types')
      .upsert(items, { onConflict: 'code' })
      .select('id')
    if (error) throw error

    return NextResponse.json({ imported: data?.length ?? items.length }, { headers: privateHeaders })
  } catch (error) {
    const denied = authErrorResponse(error)
    if (denied) return denied
    if (error instanceof Error && error.message === 'UNAUTHORIZED') {
      return NextResponse.json({ error: '관리자 인증이 필요합니다.' }, { status: 401, headers: privateHeaders })
    }
    if (error instanceof Error && error.message.includes('행의')) {
      return NextResponse.json({ error: error.message }, { status: 400, headers: privateHeaders })
    }
    return NextResponse.json({ error: 'CSV 유형을 등록하지 못했습니다.' }, { status: 500, headers: privateHeaders })
  }
}
