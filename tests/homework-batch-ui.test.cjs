require('./register.cjs')
const {test,afterEach}=require('node:test'),assert=require('node:assert/strict'),React=require('react'),{create,act}=require('react-test-renderer')
require.cache[require.resolve('next/navigation')]={id:require.resolve('next/navigation'),filename:require.resolve('next/navigation'),loaded:true,exports:{usePathname:()=>'/homework'}}
const {StaffProvider}=require('../app/components/staff-session.tsx'),Page=require('../app/homework/page.tsx').default
const originals={fetch:global.fetch,window:global.window,sessionStorage:global.sessionStorage}
let mounted
const response=(status,data)=>({status,ok:status>=200&&status<300,json:async()=>data})
const students=[{id:'a',name:'학생 A',grade:3},{id:'b',name:'학생 B',grade:4}]
async function setup(handler){
 global.window={location:{replace(){}},addEventListener(){},removeEventListener(){}};global.sessionStorage={removeItem(){}}
 global.fetch=async(url,opts)=>{
  if(url==='/api/auth/session')return response(200,{staff:{id:'staff',name:'강사',role:'instructor',instructor_id:'i'}})
  if(url==='/api/admin/programs')return response(200,{items:[{id:'p',name:'수학',institution:{name:'기관'}},{id:'q',name:'다른 수학'}]})
  return handler(url,opts)
 }
 await act(async()=>{mounted=create(React.createElement(StaffProvider,null,React.createElement(Page)))})
}
afterEach(async()=>{if(mounted)await act(async()=>mounted.unmount());mounted=null;Object.assign(global,originals)})
const selectProgram=async(id)=>act(async()=>mounted.root.findByType('select').props.onChange({target:{value:id}}))
const submit=async()=>act(async()=>mounted.root.findByType('form').props.onSubmit({preventDefault(){}}))
test('Bulk screen posts only selected students and confirms a lost response with identical payload',async()=>{
 const writes=[]
 await setup(async(url,opts)=>{if(opts?.method==='POST'){writes.push(JSON.parse(opts.body));if(writes.length===1)throw Error('연결이 끊겼습니다');return response(200,{batch:{count:1}})}return response(200,{students,recent:[]})})
 await selectProgram('p')
 await act(async()=>mounted.root.findByProps({'aria-label':'학생 A 선택'}).props.onChange({target:{checked:true}}))
 await act(async()=>mounted.root.findByProps({placeholder:'예: 분수의 덧셈 연습'}).props.onChange({target:{value:'분수'}}))
 await submit()
 assert.equal(mounted.root.findByType('fieldset').props.disabled,true)
 assert.match(JSON.stringify(mounted.toJSON()),/저장 결과 확인/)
 await submit()
 assert.deepEqual(writes[0],writes[1]);assert.deepEqual(writes[0].student_ids,['a']);assert.equal(writes[0].program_id,'p')
 assert.equal(mounted.root.findByType('fieldset').props.disabled,false)
 assert.match(JSON.stringify(mounted.toJSON()),/1명에게 과제를 등록했습니다/)
})
test('Changing program clears selected students and ignores a delayed old roster',async()=>{
 let resolveOld
 await setup((url)=>url.endsWith('=p')?new Promise(resolve=>resolveOld=resolve):Promise.resolve(response(200,{students:[students[1]],recent:[]})))
 let old
 await act(async()=>{old=mounted.root.findByType('select').props.onChange({target:{value:'p'}})})
 await selectProgram('q')
 await act(async()=>{resolveOld(response(200,{students:[students[0]],recent:[]}));await old})
 assert.equal(mounted.root.findAllByProps({'aria-label':'학생 A 선택'}).length,0)
 assert.equal(mounted.root.findAllByProps({'aria-label':'학생 B 선택'}).length,1)
 assert.equal(mounted.root.findByProps({'aria-label':'학생 전체 선택'}).props.checked,false)
})
test('Rapid repeated submit sends once, and validation failure unlocks the form',async()=>{
 let posts=0,finish
 await setup(async(url,opts)=>{if(opts?.method==='POST'){posts++;return new Promise(resolve=>finish=()=>resolve(response(409,{error:'명단을 새로고침해 주세요.'})))}return response(200,{students,recent:[]})})
 await selectProgram('p')
 await act(async()=>mounted.root.findByProps({'aria-label':'학생 전체 선택'}).props.onChange({target:{checked:true}}))
 const send=mounted.root.findByType('form').props.onSubmit
 let one,two
 await act(async()=>{one=send({preventDefault(){}});two=send({preventDefault(){}})})
 assert.equal(posts,1)
 await act(async()=>{finish();await Promise.all([one,two])})
 assert.equal(mounted.root.findByType('fieldset').props.disabled,false)
 assert.match(JSON.stringify(mounted.toJSON()),/명단을 새로고침/)
})
test('A saved batch refreshes the overview and the shared program selector locks during an uncertain save',async()=>{
 let reads=0,posts=0
 await setup(async(url,opts)=>{
  if(url.startsWith('/api/admin/homework-review?')){reads++;return response(200,{items:[],counts:{assigned:0,submitted:0,checked:0,overdue:0,all:0},total:0,page:1,page_size:30,today:'2026-09-06'})}
  if(opts?.method==='POST'){posts++;if(posts===1)throw Error('lost response');return response(200,{batch:{count:1}})}
  return response(200,{students,recent:[]})
 })
 await selectProgram('p')
 assert.equal(reads,1)
 await act(async()=>mounted.root.findByProps({'aria-label':'학생 A 선택'}).props.onChange({target:{checked:true}}))
 await submit();assert.equal(mounted.root.findByType('select').props.disabled,true)
 await submit();assert.equal(mounted.root.findByType('select').props.disabled,false)
 assert.equal(reads,2)
})
