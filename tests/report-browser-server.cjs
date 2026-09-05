// Local browser fixture only. Run `npm run build`, `npm start -- -p 3411`, then this file.
// Serves the actual app pages with in-memory API fixtures; never contacts Supabase or Solapi.
const http = require('node:http')
const { randomUUID } = require('node:crypto')
const video = { id: 'v1', title: '분수의 덧셈과 뺄셈 함께 연습하기', url: 'https://example.com/fractions', language: 'ko' }
const sampleType = { id: '11111111-1111-4111-8111-111111111111', code: 'E3-01', name: '분모가 같은 분수의 덧셈', grade: 3, unit: '분수', description_ko: '분모는 그대로 두고 분자를 더해요.', description_vi: 'Cộng các tử số và giữ nguyên mẫu số.', description_zh_cn: '分母不变，分子相加。', video }
const types = [sampleType, { ...sampleType, id: '22222222-2222-4222-8222-222222222222', code: 'E3-02', name: '분모가 같은 분수의 뺄셈' }, { ...sampleType, id: '33333333-3333-4333-8333-333333333333', code: 'E3-03', name: '분수와 소수의 크기 비교', video: null }]
const program = { id: 'p1', name: '기초수학 함께 배우기', institution: { name: '예시 가족센터' } }
const students = [{ id: 's1', name: '예시 학생 A', grade: 3, program, guardian: { language: 'vi' } }, { id: 's2', name: '예시 학생 B', grade: 3, program, guardian: { language: 'ko' } }]
const reports = new Map()
const expires_at = '2099-01-01T00:00:00Z'
reports.set('sample', { language: 'vi', expires_at, student: students[0], learning_log: { lesson_date: '2026-09-05', solved_count: 10, wrong_count: 2, weekly_assignment: 'Mỗi ngày làm 2 bài tập về phân số.', video_url: video.url }, resources: { version: 1, wrong_types: types.slice(0, 2), videos: [video] }, action_line: 'Hãy cùng con xem video và luyện tập.' })
function json(res, status, data) { res.writeHead(status, { 'content-type': 'application/json', 'cache-control': 'no-store' }); res.end(JSON.stringify(data)) }
http.createServer(async (req, res) => {
  const url = new URL(req.url, 'http://localhost:3410')
  if (url.pathname === '/__screen') {
    const width = ['390', '1280', '1440'].includes(url.searchParams.get('width')) ? url.searchParams.get('width') : '1280'
    const height = width === '390' ? 844 : 800
    const path = url.searchParams.get('page') === 'guardian' ? '/report/sample' : '/reports'
    res.writeHead(200, { 'content-type': 'text/html; charset=utf-8' })
    res.end(`<!doctype html><html><head><title>MOASEM local UI verification</title><style>body{margin:0;background:#e2e8f0}nav{padding:8px;font:13px sans-serif}nav a{margin-right:15px}iframe{display:block;border:0;width:${width}px;height:${height}px}</style></head><body><nav>Local fixture · <a href="/__screen?width=1280">태블릿 1280</a><a href="/__screen?width=390">휴대폰 390</a><a href="/__screen?width=1440">노트북 1440</a><a href="/__screen?width=390&page=guardian">보호자 휴대폰</a></nav><iframe title="MOASEM 검증 화면" src="${path}"></iframe></body></html>`)
    return
  }
  if (url.pathname.startsWith('/api/')) {
    if (url.pathname === '/api/auth/session') return json(res, 200, { staff: { id: 'staff', name: '예시 강사', email: 'test@example.invalid', role: 'instructor', instructor_id: 'i1' } })
    if (url.pathname === '/api/admin/students') return json(res, 200, { items: students })
    if (url.pathname === '/api/admin/report-options') return json(res, 200, { items: types })
    if (url.pathname === '/api/admin/learning-reports' && req.method === 'POST') {
      const chunks = []; for await (const chunk of req) chunks.push(chunk)
      const body = JSON.parse(Buffer.concat(chunks).toString())
      if (!body.wrong_count && body.wrong_type_ids?.length) return json(res, 400, { error: '틀린 문제 수를 확인해 주세요.' })
      const selected = types.filter(type => body.wrong_type_ids.includes(type.id))
      const videos = [...new Map(selected.flatMap(type => type.video ? [[type.video.url, type.video]] : [])).values()]
      const token = randomUUID()
      reports.set(token, { ...body, student: students.find(student => student.id === body.student_id), expires_at, learning_log: body, resources: { version: 1, wrong_types: selected, videos } })
      return json(res, 201, { token, expires_at })
    }
    if (url.pathname.startsWith('/api/report/')) {
      const report = reports.get(url.pathname.split('/').at(-1))
      return json(res, report ? 200 : 404, report ? { report } : { error: '리포트를 찾지 못했습니다.' })
    }
    return json(res, 404, { error: 'No fixture for this endpoint.' })
  }
  const upstream = http.request({ hostname: '127.0.0.1', port: 3411, path: req.url, method: req.method, headers: { ...req.headers, host: 'localhost:3411' } }, incoming => { res.writeHead(incoming.statusCode, incoming.headers); incoming.pipe(res) })
  upstream.on('error', () => { res.writeHead(502); res.end('Start the local app on port 3411 first.') })
  req.pipe(upstream)
}).listen(3410, '0.0.0.0', () => console.log('Local fixture: http://localhost:3410/__screen'))
