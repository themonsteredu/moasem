import {NextRequest,NextResponse} from 'next/server'
import {portalStudent,studentVideos,operate,textInput} from '@/lib/learning-operations'
import {getSupabaseAdmin} from '@/lib/supabase-admin'
import {authErrorResponse,privateHeaders,assertSameOrigin,AccessError} from '@/lib/admin-auth'
export const dynamic='force-dynamic'
export async function GET(_req:NextRequest,{ params }: { params: Promise<{ token: string }> }){try{
 const s=await portalStudent((await params).token),db=getSupabaseAdmin()
 const [p,h,v,c]=await Promise.all([db.from('programs').select('name,zoom_join_url').eq('id',s.program_id).single(),db.from('homework').select('id,title,details,due_on,status,photos:homework_photos(id)').eq('student_id',s.id).eq('program_id',s.program_id).order('due_on',{ascending:false}).limit(100),studentVideos(s.id,s.program_id),db.from('student_video_checks').select('video_url,confirmed_at').eq('student_id',s.id).eq('program_id',s.program_id)])
 if(p.error||h.error||c.error)throw p.error||h.error||c.error
 return NextResponse.json({student:{name:s.name,grade:s.grade},program:p.data,homework:h.data,videos:v,checks:c.data},{headers:privateHeaders})
}catch(e){return authErrorResponse(e)||NextResponse.json({error:'불러오지 못했어요. 다시 눌러 주세요.'},{status:500,headers:privateHeaders})}}
export async function POST(req:NextRequest,{ params }: { params: Promise<{ token: string }> }){try{
 assertSameOrigin(req);const s=await portalStudent((await params).token),b=await req.json(),url=textInput(b.url,2000);const videos=await studentVideos(s.id,s.program_id);if(!videos.some(v=>v.url===url))throw new AccessError(400,'등록된 영상만 확인할 수 있어요.')
 await operate(null,s.id,'video',{url,confirmed:b.confirmed===true},(await params).token);return NextResponse.json({ok:true},{headers:privateHeaders})
}catch(e){return authErrorResponse(e)||NextResponse.json({error:'영상 기록을 저장하지 못했어요.'},{status:500,headers:privateHeaders})}}
