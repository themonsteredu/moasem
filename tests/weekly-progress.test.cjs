require('./register.cjs')
const { test } = require('node:test'), assert = require('node:assert/strict')
const { programWeekCount, programWeek, weekWindow, summarizeWeeks, attendanceSummary, hasWeeklyRecords } = require('../lib/weekly-progress.ts')
const program = { id: 'p', name: '수학', starts_on: '2026-09-30', ends_on: '2026-10-21', week_count: 12 }
const student = { id: 's', name: '학생', grade: 3 }

test('Weeks follow the real start date and inclusive end, not a conflicting registered count', () => {
  assert.equal(programWeekCount(program), 4)
  assert.deepEqual(programWeek(program, 1, '2026-10-06'), { number: 1, starts_on: '2026-09-30', ends_on: '2026-10-06', phase: 'current' })
  assert.deepEqual(programWeek(program, 4, '2026-10-22'), { number: 4, starts_on: '2026-10-21', ends_on: '2026-10-21', phase: 'past' })
  assert.equal(programWeekCount({ starts_on: '2024-02-28', ends_on: '2024-03-05' }), 1)
  for (const dates of [{ starts_on: '2026-02-30', ends_on: '2026-03-10' }, { starts_on: '2026-10-01', ends_on: '2026-09-30' }]) assert.throws(() => programWeekCount(dates))
  for (const number of [0, 5, 1.2]) assert.throws(() => programWeek(program, number, '2026-10-01'))
})
test('Default windows contain today, clamp before/after the program, and contain at most four weeks', () => {
  const long = { ...program, ends_on: '2026-12-22' }
  assert.equal(weekWindow(long, '2026-09-01').week_start, 1)
  assert.equal(weekWindow(long, '2026-11-02').week_start, 5)
  assert.equal(weekWindow(long, '2027-01-01').week_start, 9)
  assert.equal(weekWindow(long, '2026-11-02', 11).weeks.length, 2)
  assert.equal(weekWindow(long, '2026-11-02', 1).weeks.length, 4)
})
test('Progress stays in its week, latest record breaks date ties by save time and ID, inputs are unchanged', () => {
  const entry = { student_id: 's', lesson_date: '2026-10-01', created_at: '2026-10-01T01:00:00Z', book: '교재', unit: '분수', pages: '1' }
  const records = [{ ...entry, id: 'a', created_at: '2026-10-02T00:00:00Z' }, { ...entry, id: 'c', created_at: '2026-10-02T00:00:00Z', pages: '3' }, { ...entry, id: 'b' }, { ...entry, id: 'foreign', student_id: 'other' }, { ...entry, id: 'outside', lesson_date: '2026-09-29' }]
  const before = JSON.stringify(records)
  const cells = summarizeWeeks([student], weekWindow(program, '2026-10-06').weeks, records, [], [], '2026-10-06')[0].cells
  assert.equal(cells[0].progress_count, 3); assert.equal(cells[0].latest.pages, '3')
  assert.equal(cells[1].latest, null); assert.equal(hasWeeklyRecords(cells[1]), false)
  assert.equal(JSON.stringify(records), before)
})
test('Homework uses due dates and current status; no saved attendance is not an absence', () => {
  const homework = [
    { student_id: 's', due_on: '2026-10-05', status: 'assigned' },
    { student_id: 's', due_on: '2026-10-06', status: 'assigned' },
    { student_id: 's', due_on: '2026-10-01', status: 'submitted' },
    { student_id: 's', due_on: '2026-10-01', status: 'checked' },
    { student_id: 's', assigned_on: '2026-10-01', due_on: '2026-10-07', status: 'assigned' },
  ]
  const attendance = ['present', 'late', 'absent', 'excused'].map(status => ({ student_id: 's', session_date: '2026-10-01', session_type: 'in_person', status }))
  const cells = summarizeWeeks([student], weekWindow(program, '2026-10-06').weeks, [], homework, attendance, '2026-10-06')[0].cells
  assert.deepEqual(cells[0].homework, { total: 4, submitted: 1, checked: 1, assigned: 2, overdue: 1 })
  assert.equal(cells[1].homework.total, 1); assert.equal(cells[1].homework.overdue, 0)
  assert.equal(attendanceSummary(cells[0].attendance.in_person), '2/4')
  assert.equal(attendanceSummary(cells[0].attendance.zoom), '—')
  assert.equal(cells[2].attendance.in_person.absent, 0); assert.equal(hasWeeklyRecords(cells[2]), false)
})
