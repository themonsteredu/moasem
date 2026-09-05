import { NextRequest, NextResponse } from 'next/server'
import { AccessError, assertAdmin, authErrorResponse, privateHeaders } from '@/lib/admin-auth'
import { createIdentity } from '@/lib/staff-identity'
import { getSupabaseAdmin } from '@/lib/supabase-admin'
export const dynamic = 'force-dynamic'
export async function GET(request: NextRequest) {
  try {
    await assertAdmin(request)
    const db = getSupabaseAdmin()
    const [accounts, instructors, programs] = await Promise.all([
      db.from('staff_accounts').select('id,name,email,active,instructor_id,created_at').eq('role','instructor').order('created_at'),
      db.from('instructors').select('id,name,email,phone').order('name'),
      db.from('programs').select('id,name,instructor_id,institution:institutions(name)').order('created_at'),
    ])
    if (accounts.error || instructors.error || programs.error) throw accounts.error || instructors.error || programs.error
    return NextResponse.json({ items: accounts.data, instructors: instructors.data, programs: programs.data }, { headers: privateHeaders })
  } catch(error) { return authErrorResponse(error) || NextResponse.json({error:'강사 정보를 불러오지 못했습니다.'},{status:500,headers:privateHeaders}) }
}
export async function POST(request: NextRequest) {
  let createdUser: string | null = null
  try {
    await assertAdmin(request)
    const body = await request.json()
    const name = String(body.name || '').trim()
    const email = String(body.email || '').trim().toLowerCase()
    const accountId = body.id || null
    if ((accountId && (typeof accountId !== 'string' || !/^[0-9a-f-]{36}$/i.test(accountId))) || (body.instructor_id && (typeof body.instructor_id !== 'string' || !/^[0-9a-f-]{36}$/i.test(body.instructor_id))) || String(body.phone || '').length > 50) throw new AccessError(400, '강사 정보를 확인해 주세요.')
    const programIds = body.program_ids
    if (!name || name.length>100 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || email.length>254 || !Array.isArray(programIds) || programIds.length>100 || programIds.some(id=>typeof id!=='string'||!/^[0-9a-f-]{36}$/i.test(id)) || typeof body.active!=='boolean') throw new AccessError(400,'강사 정보와 담당 프로그램을 확인해 주세요.')
    const db = getSupabaseAdmin()
    if (!accountId) {
      const {data:existing,error} = await db.from('staff_accounts').select('id').eq('email',email).maybeSingle()
      if(error)throw error
      if(existing)throw new AccessError(409,'이미 등록된 이메일입니다. 목록에서 강사를 선택해 주세요.')
      createdUser = await createIdentity(email,typeof body.password==='string'?body.password:'')
    }
    const {data,error} = await db.rpc('save_staff_instructor',{
      p_account_id:accountId,p_instructor_id:body.instructor_id||null,p_auth_user_id:createdUser,
      p_name:name,p_email:email,p_phone:String(body.phone||''),p_program_ids:programIds,p_active:body.active,
    })
    if(error) {
      if(error.message.includes('PROGRAM_ALREADY_ASSIGNED')) throw new AccessError(409,'다른 강사가 담당 중인 프로그램입니다. 기존 배정을 해제한 뒤 연결해 주세요.')
      throw new AccessError(400,'저장하지 못했습니다. 중복 이메일과 담당 프로그램을 확인해 주세요.')
    }
    return NextResponse.json({id:data,uses_existing_account:!accountId&&!createdUser},{status:accountId?200:201,headers:privateHeaders})
  } catch(error) {
    // Do not delete Auth identities: a concurrent request may already have linked one.
    return authErrorResponse(error)||NextResponse.json({error:'강사 계정을 저장하지 못했습니다.'},{status:500,headers:privateHeaders})
  }
}
