require('./register.cjs')
const { test, afterEach } = require('node:test')
const assert = require('node:assert/strict')
const React = require('react')
const { create, act } = require('react-test-renderer')
const { safeVideoUrl, reportResources, typeDescription } = require('../lib/report-resources.ts')
const { ReportTypePicker } = require('../app/components/report-type-picker.tsx')
const GuardianPage = require('../app/report/[token]/page.tsx').default
const video = { id: 'v1', title: '분수 보충영상', url: 'https://example.com/video', language: 'ko' }
const type = { id: 't1', code: 'E3-01', name: '분모가 같은 분수', grade: 3, unit: '분수', description_ko: '분모를 유지하고 분자를 더해요.', description_vi: 'Cộng các tử số và giữ nguyên mẫu số.', description_zh_cn: '分母不变，分子相加。', video }
const options = [type, { ...type, id: 't2', code: 'E3-02', name: '분수의 뺄셈' }, { ...type, id: 't3', name: '영상 없는 유형', video: null }]
let mounted
const originalFetch = global.fetch
afterEach(async () => { if (mounted) await act(async () => mounted.unmount()); mounted = null; global.fetch = originalFetch })

test('Legacy video links remain available; unsafe links and duplicate URLs are omitted', () => {
  assert.equal(reportResources(null, 'https://example.com/video').videos.length, 1)
  assert.deepEqual(reportResources({ videos: [video, { ...video, id: 'v2', url: 'HTTPS://EXAMPLE.COM/video' }] }, video.url).videos, [video])
  for (const url of ['javascript:alert(1)', 'data:text/html,test', 'https://name:password@example.com/video', '//example.com/video', 'not a url']) assert.equal(safeVideoUrl(url), null)
  assert.equal(reportResources({ videos: [{ ...video, url: 'javascript:alert(1)' }] }).videos.length, 0)
})
test('Each guardian language uses the corresponding catalog description', () => {
  assert.equal(typeDescription(type, 'ko'), type.description_ko)
  assert.equal(typeDescription(type, 'vi'), type.description_vi)
  assert.equal(typeDescription(type, 'zh-CN'), type.description_zh_cn)
  assert.equal(typeDescription({ ...type, description_vi: null }, 'vi'), null)
})
test('Choosing two types with one video previews it once; unlinked types remain selected', async () => {
  function Harness() {
    const [ids, setIds] = React.useState([])
    return React.createElement(ReportTypePicker, { options, selectedIds: ids, onChange: setIds, loaded: true })
  }
  await act(async () => { mounted = create(React.createElement(Harness)) })
  for (let i = 0; i < 3; i++) await act(async () => mounted.root.findAllByProps({ type: 'checkbox' })[i].props.onChange({ target: { checked: true } }))
  assert.equal(mounted.root.findAllByProps({ href: video.url }).length, 1)
  assert.equal(mounted.root.findByProps({ 'aria-label': '선택한 오답 유형' }).findAllByType('button').length, 3)
  assert.match(JSON.stringify(mounted.toJSON()), /연결된 영상이 없습니다/)
  await act(async () => mounted.root.findByProps({ 'aria-label': '오답 유형 검색' }).props.onChange({ target: { value: '없는 검색어' } }))
  assert.equal(mounted.root.findAllByProps({ type: 'checkbox' }).length, 0)
  assert.equal(mounted.root.findByProps({ 'aria-label': '선택한 오답 유형' }).findAllByType('button').length, 3)
  await act(async () => mounted.root.findByProps({ 'aria-label': `${type.name} 선택 해제` }).props.onClick())
  assert.equal(mounted.root.findAllByProps({ href: video.url }).length, 1)
})
test('Guardian sees three sections, native description first and deduplicated video links', async () => {
  global.fetch = async () => ({ ok: true, json: async () => ({ report: { language: 'vi', expires_at: '2099-01-01', student: { name: '예시 학생', grade: 3 }, learning_log: { solved_count: 10, wrong_count: 2, video_url: video.url }, resources: { version: 1, wrong_types: [type], videos: [video, video] } } }) })
  await act(async () => { mounted = create(React.createElement(GuardianPage, { params: { token: 'sample' } })) })
  assert.equal(mounted.root.findAllByType('section').length, 3)
  const description = mounted.root.findByProps({ className: 'guardian-types' }).findByType('li').children
  assert.deepEqual(description[0].children, [type.description_vi])
  assert.deepEqual(description[1].children, [type.name])
  assert.equal(mounted.root.findAllByProps({ href: video.url }).length, 1)
})
