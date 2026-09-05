require('./register.cjs')
const { test } = require('node:test')
const assert = require('node:assert/strict')
const { zoomJoinUrl, attendanceType } = require('../lib/zoom-link.ts')
test('Zoom accepts participant links and clearing; rejects host tokens and unsafe destinations', () => {
  assert.equal(zoomJoinUrl(' https://us02web.zoom.us/j/12345678901?pwd=abc '), 'https://us02web.zoom.us/j/12345678901?pwd=abc')
  assert.equal(zoomJoinUrl(''), null)
  for (const url of ['https://zoom.us.evil.test/j/123456789', 'http://zoom.us/j/123456789', 'https://zoom.us/s/123456789?zak=secret', 'https://zoom.us/j/123456789?zak=secret', 'https://user@zoom.us/j/123456789', 'javascript:alert(1)', 'https://zoom.us/j/123456789#secret', 'https://zoom.us/j/123456789?pwd=a&pwd=b']) assert.throws(() => zoomJoinUrl(url), /INVALID_ZOOM_LINK/)
})
test('Attendance types remain distinct and old callers default to in-person', () => {
  assert.equal(attendanceType(null), 'in_person')
  assert.equal(attendanceType('zoom'), 'zoom')
  assert.throws(() => attendanceType('other'), /INVALID_SESSION_TYPE/)
})
