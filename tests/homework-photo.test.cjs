require('./register.cjs')
const {test,beforeEach}=require('node:test'),assert=require('node:assert/strict'),{NextRequest}=require('next/server'),{randomUUID}=require('node:crypto')
const learning=require('../lib/learning-operations.ts'),dbModule=require('../lib/supabase-admin.ts')
const {AccessError}=require('../lib/admin-auth.ts')
let calls,h,operationError,denied,record
const db={from(){return {select(){return this},eq(){return this},async maybeSingle(){return {data:record,error:null}}}},storage:{from(bucket){assert.equal(bucket,'moasem-homework');return {async upload(path,bytes,opts){calls.push(['upload',path,bytes.length,opts]);return {error:null}},async remove(paths){calls.push(['remove',paths]);return {error:null}}}}}}
dbModule.getSupabaseAdmin=()=>({...db,from(table){if(table==='homework')return {select(){return this},eq(){return this},async maybeSingle(){return {data:h,error:null}}};return db.from(table)}})
learning.portalStudent=async()=>{if(denied)throw new AccessError(410,'만료된 링크');return {id:'student',program_id:'program'}}
learning.operate=async(...args)=>{calls.push(['operate',...args]);if(operationError)throw new AccessError(400,'저장 차단')}
const {POST}=require('../app/api/student/[token]/photo/route.ts')
const id=randomUUID(),homework=randomUUID(),png=Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jpV8AAAAASUVORK5CYII=','base64')
function request(bytes=png){const form=new FormData();form.set('id',id);form.set('homework_id',homework);form.set('photo',new File([bytes],'photo.png',{type:'image/png'}));return new NextRequest('https://moasem.example/api/student/token/photo',{method:'POST',headers:{origin:'https://moasem.example'},body:form})}
beforeEach(()=>{calls=[];h={status:'assigned',photos:[]};operationError=false;denied=false;record=null})
test('Photo stores privately before linking submission, without exposing storage path',async()=>{const r=await POST(request(),{params:{token:'token'}});assert.equal(r.status,200);assert.deepEqual(await r.json(),{ok:true});assert.deepEqual(calls.map(c=>c[0]),['upload','operate']);assert.equal(calls[0][3].upsert,false);assert.equal(calls[0][3].contentType,'image/png')})
test('Retry of a saved photo succeeds after teacher checks homework, without another upload',async()=>{h={status:'checked',photos:[{id}]};assert.equal((await POST(request(),{params:{token:'token'}})).status,200);assert.equal(calls.length,0)})
test('Expired links, checked homework and false image files do not upload',async()=>{denied=true;assert.equal((await POST(request(),{params:{token:'token'}})).status,410);denied=false;h.status='checked';assert.equal((await POST(request(),{params:{token:'token'}})).status,400);h.status='assigned';assert.equal((await POST(request(Buffer.from('not a real image file')),{params:{token:'token'}})).status,400);assert.equal(calls.length,0)})
test('Photo is removed if linking definitely failed; confirmed saved photo is retained',async()=>{operationError=true;assert.equal((await POST(request(),{params:{token:'token'}})).status,400);assert.deepEqual(calls.map(c=>c[0]),['upload','operate','remove']);calls=[];record={id};await POST(request(),{params:{token:'token'}});assert.deepEqual(calls.map(c=>c[0]),['upload','operate'])})
