import { randomBytes } from 'node:crypto'
import { NextRequest,NextResponse } from 'next/server'
import { assertStaff,authErrorResponse,privateHeaders,AccessError } from '@/lib/admin-auth'
import { getSupabaseAdmin } from '@/lib/supabase-admin'
import { staffStudent,hashToken,operate,textInput,dateInput,uuidInput } from '@/lib/learning-operations'
export const dynamic='force-dynamic'
export async function GET(req:NextRequest,{ params }: { params: Promise<{ id: string }> }){try{
 const staff=await assertStaff(req),s=await staffStudent(staff,(await params).id),db=getSupabaseAdmin()
 const {data,error}=await db.from('homework').select('*,photos:homework_photos(id,storage_path)').eq('student_id',s.id).eq('program_id',s.program_id).order('due_on',{ascending:false}).limit(100);if(error)throw error
 const items=await Promise.all((data??[]).map(async h=>({...h,photos:await Promise.all(h.photos.map(async(photo:{id:string;storage_path:string})=>{const {data,error}=await db.storage.from('moasem-homework').createSignedUrl(photo.storage_path,300);if(error)throw error;return{id:photo.id,url:data.signedUrl}}))})))
 return NextResponse.json({items},{headers:privateHeaders})
}catch(e){return authErrorResponse(e)||NextResponse.json({error:'과제를 불러오지 못했습니다.'},{status:500,headers:privateHeaders})}}
export async function POST(req:NextRequest,{ params }: { params: Promise<{ id: string }> }){try{
 const staff=await assertStaff(req),s=await staffStudent(staff,(await params).id),body=await req.json();let payload:any={}
 if(body.action==='link'){const token=randomBytes(32).toString('hex');await operate(staff.id,s.id,'link',{hash:hashToken(token)});return NextResponse.json({url:`${req.nextUrl.origin}/student/${token}`},{headers:privateHeaders})}
 if(body.action==='assign'){payload={id:uuidInput(body.id),title:textInput(body.title,200),details:textInput(body.details,2000,false),assigned_on:dateInput(body.assigned_on),due_on:dateInput(body.due_on)};if(payload.due_on<payload.assigned_on)throw new AccessError(400,'마감일은 시작일 이후로 선택해 주세요.')}
 else if(body.action==='status'){if(!['assigned','submitted','checked'].includes(body.status))throw new AccessError(400,'과제 상태를 확인하세요.');payload={homework_id:uuidInput(body.homework_id),status:body.status}}
 else if(body.action!=='revoke')throw new AccessError(400,'요청을 확인하세요.')
 await operate(staff.id,s.id,body.action,payload);return NextResponse.json({ok:true},{headers:privateHeaders})
}catch(e){return authErrorResponse(e)||NextResponse.json({error:'저장하지 못했습니다. 목록을 새로고침해 확인하세요.'},{status:500,headers:privateHeaders})}}
