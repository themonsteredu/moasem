# MOASEM 작업 규칙

- 서비스명: 모아셈(MOASEM)
- 용도: 기관 위탁형 초등 수학 학습관리 웹서비스
- 기존 themonster.kr 코드 및 DB와 공유하지 않는다.
- GitHub 저장소: themonsteredu/moasem
- Supabase는 aiapp 프로젝트를 사용한다. 프로젝트 ID는 `vypnobpmyadtcvxhtagn` (ap-northeast-2). 다른 Supabase 프로젝트에는 마이그레이션을 적용하지 않는다.
- DB는 aiapp 프로젝트의 `moasem` 스키마를 사용한다. 모든 모아셈 테이블은 `moasem` 스키마 안에 두고 이름에 접두어를 붙이지 않는다. (예: `moasem.students`)
- `public` 스키마에는 모아킷 등 다른 앱의 테이블 126개가 있다 (2026-09-12 기준, 계속 늘어난다). 절대 수정·삭제하지 않는다. `public` 스키마의 RLS 설정도 건드리지 않는다.
- 앱 접속은 `lib/supabase-admin.ts` 한 곳에서 `db: { schema: 'moasem' }` 로 스키마를 고정한다. 코드에서는 `.from('students')` 처럼 접두어 없이 호출한다.
- Supabase 대시보드 Project Settings → API → Exposed schemas 는
  `public, graphql_public, moalab, ai_upcycling, moasem` 이어야 한다.
  aiapp 프로젝트는 이미 스키마를 나눠 쓰고 있다: `public`(126표), `moalab`(57표), `ai_upcycling`(14표), `moasem`(25표).
  이 목록은 반드시 **추가만** 한다. 기존 항목을 하나라도 빼면 해당 앱이 즉시 멈춘다.
- 기준 데이터 구조는 기관 → 프로그램 → 학생 → 보호자다.
- 기능 구현 전 화면 구성을 먼저 설명하고 사용자 확인을 받는다.
- 기능 하나가 끝날 때마다 테스트 방법을 안내하고 멈춘다.
- 수납·결제 기능은 만들지 않는다.
- 화상수업은 Zoom Meeting SDK만 사용한다.
- 학생 화면은 태블릿 가로와 스마트폰 세로를 우선한다.
- 기관 담당자 화면은 읽기 전용으로 설계한다.
- 보호자 리포트는 보호자 언어로 처음부터 생성한다.
- 보호자 알림톡은 MOAKIT 카카오톡 채널을 Solapi로 연동한다.
- 알림톡 본문에는 학습 상세를 넣지 않고 `리포트가 도착했습니다` 안내와 만료되는 웹 리포트 링크만 발송한다.

## 마이그레이션 관리 규칙

`moasem` 스키마 테이블 25개는 모두 `supabase/migrations/` 에 파일이 있다 (0001~0009).

`0008_restore_db_only_tables_baseline.sql` 은 특수한 파일이다. 2026-09-05~06 사이
아래 9건이 이 레포를 거치지 않고 DB 에 직접 적용되어 레포에 파일이 없었는데,
2026-09-12 에 DB 실제 구조를 조회해 13개 테이블을 하나로 재구성한 것이다.

`moasem_staff_accounts`, `moasem_report_resources`, `moasem_report_alimtalk`,
`moasem_guardian_consent`, `moasem_consent_ui_english`, `moasem_student_progress`,
`moasem_free_zoom_link`, `moasem_learning_operations`, `moasem_bulk_homework`

원본 SQL 이 아니라 재구성이므로 단계별 이력은 남아 있지 않다.

**앞으로 지킬 것**
- DB 에 직접 적용하지 않는다. 반드시 `supabase/migrations/` 에 파일을 함께 추가한다.
- 작업 시작 전 DB 실제 상태를 조회해 레포와 맞는지 확인한다.
- 파일은 이미 적용된 DB 에 재실행해도 안전하도록 `if not exists` 로 쓴다.

## moasem 스키마 테이블 (25개, 2026-09-12)

### 기준 정보
- `institutions` — 기관. 담당자 정보, 읽기전용 포털 토큰(`portal_token`), 담당자 계정(`manager_user_id`)
- `instructors` — 강사. 로그인 계정 연결(`user_id`)
- `programs` — 기관별 위탁 프로그램. 기간·주차수·대면/Zoom 요일·학생 입장코드(`join_code`)
- `guardians` — 보호자. 연락처와 기본 언어(ko/vi/zh-CN)
- `students` — 학생. 프로그램·보호자 연결, 학년
- `staff_accounts` — **관리자/강사 권한.** `auth_user_id` 로 Supabase Auth 연결. auth 쪽 role은 신뢰하지 않고 이 표를 기준으로 삼는다

### 출결·학습
- `attendance` — 대면/Zoom 출석. 학생·날짜·유형 조합이 유일
- `learning_logs` — 강사 수동 입력 학습 결과 (푼 문제수·오답수·주간과제·영상)
- `student_progress_entries` — 상세 진도 기록 (교재·단원·쪽수·배운 것·어려운 점·다음 과제)
- `student_video_checks` — 보충영상 열람·확인 기록
- `student_portal_links` — 학생 포털 접근 토큰(해시) 및 만료

### 과제
- `homework` — 과제 배정과 상태 (배정일·기한·제출·확인)
- `homework_photos` — 과제 사진. 실제 파일은 Storage
- `homework_batches` — 과제 일괄 배정 이력

### 진단
- `diagnostic_papers` — 프로그램별 사전/사후 진단 문제지 (URL·만점)
- `diagnostic_scores` — 학생별 진단 점수 (사전/사후)

### 오답·보충영상
- `wrong_types` — 오답 유형 기준정보 (학년·학기·영역·단원, 3개 언어 설명)
- `supplement_videos` — 보충영상 보관함
- `wrong_type_videos` — 오답 유형 ↔ 보충영상 연결 (유형별 대표영상 1개)
- `learning_log_wrong_types` — 학습기록 ↔ 오답 유형 연결

### 보호자 리포트·알림
- `guardian_reports` — 로그인 없는 링크형 학습 리포트. 토큰과 만료 시각
- `report_notification_attempts` — 알림톡 발송 시도와 결과. 접수와 도착을 구분하고, 결과 불명 시 자동 재발송하지 않는다

### 법정대리인 동의
- `consent_documents` — 동의 문서 원문과 번역
- `guardian_consent_requests` — 동의 요청. 토큰 해시·문서 스냅샷·만료·철회
- `guardian_consent_records` — 동의 결과. 서명자명·언어·법정대리인 여부. **본인인증이나 자격증명을 의미하지 않는다**

### Storage
- `moasem-submissions` — 비공개 버킷. 10MB, 사진·PDF만. 서버가 발급한 한시적 링크로만 열린다

## 진행 기록
- 2026-09-03: 신규 독립 서비스 구조 확정. 기존 학원 시스템과 분리, `moasem_` 전용 데이터 구조 설계 시작.
- 2026-09-03: aiapp Supabase에 기관·강사·프로그램·보호자·학생 핵심 테이블 적용.
- 2026-09-03: 관리자 1차 화면 구현. 기관 등록 → 프로그램 생성 → 학생·보호자 등록 → 목록 확인 흐름과 테스트용 관리자 키 보호 API 추가.
- 2026-09-03: 대면 출석 일괄 체크 화면과 기관 담당자 읽기 전용 현황 화면 추가. 기관별 포털 토큰과 출석 테이블 마이그레이션 파일을 추가했으며, 과제/오답 칸은 자동채점 연결 전까지 준비중 상태로 둔다.
- 2026-09-03: 자동채점 전에도 운영 가능한 보호자 리포트 1차 기능 추가. 강사 수동 입력 → 만료형 공개 리포트 링크 생성 구조를 만들고, 향후 MOAKIT 카카오톡 채널 Solapi 알림톡 연동 환경변수 자리를 예약함.
- 2026-09-03: DB 스키마 분리 완료. `public` 의 `moasem_` 테이블 12개를 `moasem` 스키마로 이동(set schema)하고 접두어 제거. 데이터 0건 상태에서 수행했고 drop 문은 사용하지 않았다. 외래키 15개·인덱스 29개·RLS 설정 모두 보존. 앱 코드 42곳을 새 이름으로 수정.
- 2026-09-04: Exposed schemas 에 `moasem` 을 추가했다. 대시보드 저장이 반영되지 않아 `alter role authenticator set pgrst.db_schemas` 로 직접 적용했고 값은 `public, graphql_public, moalab, ai_upcycling, moasem` 이다. 플랫폼 설정과 어긋날 수 있으므로 대시보드에서도 한 번 저장해 확인한다.
- 2026-09-05: 동의·과제제출·진단·성과보고서 테이블 4개와 계정 연결 칸 3개(`instructors.user_id`, `institutions.manager_user_id`, `programs.join_code`) 추가. 비공개 버킷 `moasem-submissions` 생성.
- 2026-09-12: `public` 스키마 RLS 미적용 테이블 29개 점검 보고서(`SECURITY_RLS_REPORT.md`) 작성. 설정은 변경하지 않았다. `users`(비밀번호 해시·TOTP 비밀키), `sessions`(세션 토큰)이 anon 키로 읽고 쓸 수 있는 상태로 확인됐다.
- 2026-09-12: 레포와 DB 불일치 확인. `moasem` 테이블이 29개인데 레포에는 16개분만 있다. 위 경고 절 참조.
- 2026-09-12: DB 에만 있던 테이블 13개를 `0008_restore_db_only_tables_baseline.sql` 로 복원해 레포와 DB 를 맞췄다. 적용해도 기존 DB 는 변하지 않음을 확인했다 (표 29개·데이터·RLS 전부 유지).
- 2026-09-12: Next.js 14.2.15 -> 15.5.25, React 18 -> 19.3.0 업그레이드. 인증 없는 원격 코드 실행 2건(critical) 등 취약점 24건을 해소했다. 14 계열에는 패치가 없어 주요 버전을 올려야 했다. Next 15 변경에 맞춰 동적 경로 4곳을 수정했다 (라우트 핸들러는 `await params`, 화면은 `useParams()`). postcss 는 overrides 로 8.5.28 고정. `npm audit` 취약점 0건, 빌드 통과.
- 2026-09-12: 0007 로 만들었던 `consents`·`submissions`·`assessments`·`reports` 4개를 삭제했다 (`0009`). 각각 `guardian_consent_*`, `homework*`, `diagnostic_*` 로 대체되어 쓰이지 않았고 데이터 0건·참조 0건을 확인한 뒤 cascade 없이 지웠다. 0007 에서 함께 추가한 칸 3개(`instructors.user_id`, `institutions.manager_user_id`, `programs.join_code`)는 아직 쓰이지 않지만 그대로 두었다.
