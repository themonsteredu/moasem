import { NextRequest,NextResponse } from 'next/server'
import { portalStudent,operate,uuidInput } from '@/lib/learning-operations'
import { getSupabaseAdmin } from '@/lib/supabase-admin'
import { AccessError,assertSameOrigin,authErrorResponse,privateHeaders } from '@/lib/admin-auth'
export const dynamic='force-dynamic'
export async function POST(req:NextRequest,{params}:{params:{token:string}}){try{
 assertSameOrigin(req);const s=await portalStudent(params.token)
 if(Number(req.headers.get('content-length'))>3500000)throw new AccessError(413,'사진 한 장은 3MB 이하로 올려 주세요.')
 const form=await req.formData(),file=form.get('photo'),id=uuidInput(form.get('id')),homeworkId=uuidInput(form.get('homework_id'))
 if(!(file instanceof File)||file.size>3145728||file.size<12)throw new AccessError(400,'3MB 이하 사진을 선택해 주세요.')
 const bytes=Buffer.from(await file.arrayBuffer());let mime=''
 if(bytes[0]===255&&bytes[1]===216&&bytes[2]===255)mime='image/jpeg'
 else if(bytes.subarray(0,8).equals(Buffer.from([137,80,78,71,13,10,26,10])))mime='image/png'
 else if(bytes.toString('ascii',0,4)==='RIFF'&&bytes.toString('ascii',8,12)==='WEBP')mime='image/webp'
 if(!mime)throw new AccessError(400,'JPG, PNG, WEBP 사진을 선택해 주세요.')
 const db=getSupabaseAdmin(),{data:h,error:he}=await db.from('homework').select('id,status,photos:homework_photos(id)').eq('id',homeworkId).eq('student_id',s.id).eq('program_id',s.program_id).maybeSingle();if(he)throw he
 if(!h||h.status==='checked')throw new AccessError(400,'사진을 올릴 수 없는 과제예요.')
 if(h.photos.some((p:{id:string})=>p.id===id))return NextResponse.json({ok:true},{headers:privateHeaders})
 if(h.photos.length>=5)throw new AccessError(400,'사진은 과제당 5장까지 올릴 수 있어요.')
 const path=`${s.program_id}/${s.id}/${homeworkId}/${id}`
 const {error}=await db.storage.from('moasem-homework').upload(path,bytes,{contentType:mime,upsert:false});if(error&&String((error as {statusCode?:string}).statusCode)!=='409'&&!/already exists/i.test(error.message))throw error
 try { await operate(null,s.id,'photo',{id,homework_id:homeworkId,path},params.token) } catch(e) { const check=await db.from('homework_photos').select('id').eq('id',id).maybeSingle();if(!check.error&&!check.data)await db.storage.from('moasem-homework').remove([path]);throw e }
 return NextResponse.json({ok:true},{headers:privateHeaders})
}catch(e){return authErrorResponse(e)||NextResponse.json({error:'사진 저장 결과를 확인하지 못했어요. 같은 사진으로 다시 눌러 주세요.'},{status:500,headers:privateHeaders})}}
