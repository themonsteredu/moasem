import {NextRequest,NextResponse} from 'next/server'
import {assertStaff,assertProgramAccess,authErrorResponse,privateHeaders,AccessError} from '@/lib/admin-auth'
import {getSupabaseAdmin} from '@/lib/supabase-admin'
import {allRows,staffStudent,operate,dateInput,textInput,uuidInput} from '@/lib/learning-operations'
import {performance} from '@/lib/performance'
import {koreaToday} from '@/lib/student-progress'
export const dynamic='force-dynamic'
export async function GET(req:NextRequest){try{
 const staff=await assertStaff(req),id=uuidInput(req.nextUrl.searchParams.get('program_id'));await assertProgramAccess(staff,id);const db=getSupabaseAdmin()
 const [p,s,a,h,l,sc,paper,c]=await Promise.all([db.from('programs').select('id,name,starts_on,ends_on,week_count,institution:institutions(name)').eq('id',id).single(),allRows('students','id,name,grade,active',[id]),allRows('attendance','student_id,session_date,session_type,status',[id]),allRows('homework','student_id,due_on,status',[id]),allRows('learning_logs','student_id,lesson_date,resource_snapshot,video_url',[id]),allRows('diagnostic_scores','*',[id]),db.from('diagnostic_papers').select('*').eq('program_id',id).maybeSingle(),allRows('student_video_checks','*',[id])]);if(p.error||paper.error)throw p.error||paper.error
 return NextResponse.json({report:performance(p.data,s.sort((a,b)=>a.name.localeCompare(b.name)),a,h,l,sc,paper.data,c,koreaToday()),scores:sc},{headers:privateHeaders})
}catch(e){return authErrorResponse(e)||NextResponse.json({error:'성과보고서를 불러오지 못했습니다.'},{status:500,headers:privateHeaders})}}
export async function POST(req:NextRequest){try{
 const staff=await assertStaff(req),b=await req.json(),id=uuidInput(b.program_id);await assertProgramAccess(staff,id)
 if(b.action==='paper'){const title=textInput(b.title,200),url=textInput(b.url,2000),max=Number(b.max_score);let parsed:URL;try{parsed=new URL(url)}catch{throw new AccessError(400,'문제지 링크를 확인해 주세요.')};if(parsed.protocol!=='https:'||parsed.username||parsed.password||!Number.isFinite(max)||max<=0||max>1000)throw new AccessError(400,'HTTPS 문제지 링크와 만점을 확인해 주세요.');const {error}=await getSupabaseAdmin().rpc('save_diagnostic_paper',{p_staff:staff.id,p_program:id,p_title:title,p_url:parsed.href,p_max:max});if(error){if(error.message.includes('PAPER_LOCKED'))throw new AccessError(400,'점수가 등록된 진단지는 변경할 수 없습니다. 사전·사후에 같은 문제지를 사용하세요.');throw error}}
 else if(b.action==='score'){const s=await staffStudent(staff,uuidInput(b.student_id));if(s.program_id!==id)throw new AccessError(400,'학생의 프로그램을 확인하세요.');const score=Number(b.score),taken=dateInput(b.taken_on);if(b.score===''||b.score==null||!Number.isFinite(score)||score<0||!['pre','post'].includes(b.kind)||taken>koreaToday())throw new AccessError(400,'진단 날짜와 점수를 확인해 주세요.');await operate(staff.id,s.id,'score',{score,kind:b.kind,taken_on:taken})}
 else throw new AccessError(400,'요청을 확인해 주세요.')
 return NextResponse.json({ok:true},{headers:privateHeaders})
}catch(e){return authErrorResponse(e)||NextResponse.json({error:'진단을 저장하지 못했습니다.'},{status:500,headers:privateHeaders})}}
