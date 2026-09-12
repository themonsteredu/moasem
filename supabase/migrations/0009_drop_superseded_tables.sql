-- 0007 로 만들었으나 이후 더 완전한 테이블로 대체된 4개를 정리한다.
--
-- 대체 관계
--   consents    -> consent_documents + guardian_consent_requests + guardian_consent_records
--   submissions -> homework + homework_photos (+ homework_batches)
--   assessments -> diagnostic_papers + diagnostic_scores
--   reports     -> 사용하는 화면이 없다. 보호자 리포트는 guardian_reports 가 담당한다.
--
-- 삭제 전 확인 (2026-09-12)
--   * 네 표 모두 데이터 0건
--   * 네 표를 가리키는 외래키 없음
--   * 앱 코드에서 참조 0곳
--
-- cascade 를 쓰지 않는다. 의존 객체가 있으면 삭제가 실패하고 멈추는 것이 맞다.
-- 0007 에서 함께 추가한 칸 3개(instructors.user_id, institutions.manager_user_id,
-- programs.join_code)는 이번 정리 범위가 아니므로 그대로 둔다.

drop table if exists moasem.consents;
drop table if exists moasem.submissions;
drop table if exists moasem.assessments;
drop table if exists moasem.reports;
