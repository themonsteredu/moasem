import { createHash } from 'node:crypto'
import { AccessError, assertProgramAccess } from './admin-auth'
import { getSupabaseAdmin } from './supabase-admin'
import { reportResources, uniqueVideos } from './report-resources'
import type { Staff } from './staff-types'
export const hashToken = (token: string) => createHash('sha256').update(token).digest('hex')
export function textInput(value: unknown, max: number, required = true) { if(typeof value!=='string'||value.trim().length>max||(required&&!value.trim()))throw new AccessError(400,'입력 내용을 확인해 주세요.');return value.trim() }
export function dateInput(value: unknown) { const s=textInput(value,10);if(!/^\d{4}-\d{2}-\d{2}$/.test(s)||!Number.isFinite(Date.parse(s))||new Date(s).toISOString().slice(0,10)!==s)throw new AccessError(400,'날짜를 확인해 주세요.');return s }
export function uuidInput(value: unknown) { if(typeof value!=='string'||!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value))throw new AccessError(400,'항목을 확인해 주세요.');return value }
export async function staffStudent(staff: Staff, id: string) {
 const {data,error}=await getSupabaseAdmin().from('students').select('id,name,grade,program_id,active').eq('id',uuidInput(id)).maybeSingle();if(error)throw error;if(!data)throw new AccessError(404,'학생을 찾지 못했습니다.');await assertProgramAccess(staff,data.program_id);return data
}
export async function portalStudent(token:string){
 if(!/^[a-f0-9]{64}$/.test(token))throw new AccessError(404,'학생 링크를 확인해 주세요.')
 const db=getSupabaseAdmin();const {data:link,error}=await db.from('student_portal_links').select('student_id,program_id,expires_at').eq('token_hash',hashToken(token)).maybeSingle();if(error)throw error
 if(!link||Date.parse(link.expires_at)<=Date.now())throw new AccessError(410,'링크가 만료되었어요. 선생님께 새 링크를 받아 주세요.')
 const {data:student,error:se}=await db.from('students').select('id,name,grade,program_id').eq('id',link.student_id).eq('program_id',link.program_id).eq('active',true).maybeSingle();if(se)throw se;if(!student)throw new AccessError(410,'사용할 수 없는 학생 링크입니다.');return student
}
export async function allRows(table:string,columns:string,programIds:string[]){
 if(!programIds.length)return [];const rows:any[]=[];for(let from=0;;from+=1000){const {data,error}=await getSupabaseAdmin().from(table).select(columns).in('program_id',programIds).order(table==='diagnostic_scores'||table==='student_video_checks'?'student_id':'id').order(table==='diagnostic_scores'?'kind':table==='student_video_checks'?'video_url':'id').range(from,from+999);if(error)throw error;rows.push(...(data??[]));if(!data||data.length<1000)break}return rows
}
export async function studentVideos(studentId:string,programId:string){
 const {data,error}=await getSupabaseAdmin().from('learning_logs').select('resource_snapshot,video_url').eq('student_id',studentId).eq('program_id',programId).order('lesson_date',{ascending:false}).limit(100);if(error)throw error
 return uniqueVideos((data??[]).flatMap(log=>reportResources(log.resource_snapshot,log.video_url).videos)).slice(0,30)
}
export async function operate(staff:string|null,student:string,action:string,body:unknown,token?:string){const {error}=await getSupabaseAdmin().rpc('learning_operation',{p_staff:staff,p_student:student,p_action:action,p_body:body,p_hash:token?hashToken(token):null});if(error){const messages:Record<string,string>={ACCESS_DENIED:'이 항목을 사용할 권한이 없습니다.',INACTIVE_STUDENT:'사용 중지된 학생입니다.',PHOTO_LIMIT:'과제 사진은 최대 5장입니다.',ALREADY_CHECKED:'선생님이 확인한 과제입니다.',INVALID_SCORE:'진단지와 점수를 확인해 주세요.',ID_CONFLICT:'저장 항목이 충돌했습니다. 새로고침해 주세요.'};for(const [code,message]of Object.entries(messages))if(error.message.includes(code))throw new AccessError(400,message);throw error}}
