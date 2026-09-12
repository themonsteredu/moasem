-- DB 에만 적용되어 있던 moasem 테이블 13개를 레포에 복원한다 (기준선 스냅샷)
--
-- 배경
--   2026-09-05 ~ 09-06 사이 아래 9건이 이 레포를 거치지 않고 DB 에 직접 적용됐다.
--     moasem_staff_accounts, moasem_report_resources, moasem_report_alimtalk,
--     moasem_guardian_consent, moasem_consent_ui_english, moasem_student_progress,
--     moasem_free_zoom_link, moasem_learning_operations, moasem_bulk_homework
--   그 결과 레포에는 파일이 없고 DB 에만 테이블이 존재하는 상태가 되었다.
--
-- 성격
--   이 파일은 원본 SQL 이 아니라 2026-09-12 시점의 DB 실제 구조를 조회해 재구성한 것이다.
--   컬럼·타입·기본값·제약·인덱스는 실제 값을 그대로 옮겼다.
--   이미 적용된 DB 에 다시 실행해도 아무 일이 없도록 if not exists 로 작성했다.
--   새 환경을 0001 부터 재현할 때 이 파일이 13개 테이블을 만들어 준다.
--
-- 주의
--   9건을 하나로 합쳤으므로 원래의 단계별 이력은 복원되지 않는다.
--   앞으로는 DB 에 직접 적용하지 말고 이 폴더에 파일을 함께 추가할 것.

-- ---------------------------------------------------------------------------
-- 1. staff_accounts — 관리자/강사 권한. 다른 표들이 이 표를 참조하므로 가장 먼저.
--    auth 쪽 role 을 신뢰하지 않고 이 표를 권한 기준으로 삼는다.
-- ---------------------------------------------------------------------------
create table if not exists moasem.staff_accounts (
  id uuid primary key default gen_random_uuid(),
  auth_user_id uuid unique references auth.users(id) on delete set null,
  name text not null check (length(btrim(name)) between 1 and 100),
  email text not null unique
    check (email = lower(btrim(email)) and length(email) between 3 and 254),
  role text not null check (role in ('admin', 'instructor')),
  instructor_id uuid unique references moasem.instructors(id) on delete restrict,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  -- 관리자는 강사 연결이 없고, 강사는 반드시 연결이 있어야 한다.
  check ((role = 'admin' and instructor_id is null)
      or (role = 'instructor' and instructor_id is not null))
);

-- ---------------------------------------------------------------------------
-- 2. 법정대리인 동의
-- ---------------------------------------------------------------------------
create table if not exists moasem.consent_documents (
  id uuid primary key default gen_random_uuid(),
  label text not null check (length(btrim(label)) between 1 and 100),
  translations jsonb not null check (jsonb_typeof(translations) = 'object'),
  created_by uuid references moasem.staff_accounts(id) on delete set null,
  created_at timestamptz not null default now()
);

create index if not exists consent_documents_created_idx
  on moasem.consent_documents (created_at desc);
create index if not exists consent_documents_staff_idx
  on moasem.consent_documents (created_by);

create table if not exists moasem.guardian_consent_requests (
  id uuid primary key default gen_random_uuid(),
  student_id uuid references moasem.students(id) on delete set null,
  guardian_id uuid references moasem.guardians(id) on delete set null,
  program_id uuid references moasem.programs(id) on delete set null,
  document_id uuid not null references moasem.consent_documents(id),
  -- SHA-256 16진수 64자. 원본 토큰은 저장하지 않는다.
  token_hash text not null unique check (token_hash ~ '^[0-9a-f]{64}$'),
  language text not null check (language in ('ko', 'en', 'vi', 'zh-CN')),
  -- 요청 시점의 문서 내용을 그대로 보존한다. 문서가 나중에 바뀌어도 기록은 유지된다.
  document_snapshot jsonb not null,
  student_name text not null,
  program_name text not null,
  institution_name text not null,
  guardian_phone text not null,
  requested_by uuid references moasem.staff_accounts(id) on delete set null,
  created_at timestamptz not null default now(),
  expires_at timestamptz not null default (now() + interval '7 days'),
  revoked_at timestamptz,
  check (expires_at > created_at)
);

create index if not exists guardian_consent_requests_document_idx
  on moasem.guardian_consent_requests (document_id);
create index if not exists guardian_consent_requests_guardian_idx
  on moasem.guardian_consent_requests (guardian_id);
create index if not exists guardian_consent_requests_program_idx
  on moasem.guardian_consent_requests (program_id);
create index if not exists guardian_consent_requests_staff_idx
  on moasem.guardian_consent_requests (requested_by);
create index if not exists guardian_consent_requests_student_idx
  on moasem.guardian_consent_requests (student_id, created_at desc);
-- 학생당 살아있는(철회되지 않은) 요청은 하나만 허용한다.
create unique index if not exists guardian_consent_requests_current_idx
  on moasem.guardian_consent_requests (student_id) where revoked_at is null;

create table if not exists moasem.guardian_consent_records (
  id uuid primary key default gen_random_uuid(),
  request_id uuid not null unique references moasem.guardian_consent_requests(id),
  language text not null check (language in ('ko', 'en', 'vi', 'zh-CN')),
  signer_name text not null check (length(btrim(signer_name)) between 1 and 100),
  -- 동의하지 않은 기록은 남기지 않는다. 행이 존재하면 곧 동의다.
  accepted boolean not null check (accepted),
  is_legal_representative boolean not null check (is_legal_representative),
  -- 링크 접속 후 본인 확인 선언. 휴대전화 본인인증이나 자격 증명이 아니다.
  verification_method text not null default 'link_self_declaration'
    check (verification_method = 'link_self_declaration'),
  consented_at timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- 3. 과제 (id 는 앱에서 생성하므로 기본값이 없다)
-- ---------------------------------------------------------------------------
create table if not exists moasem.homework (
  id uuid primary key,
  student_id uuid not null references moasem.students(id),
  program_id uuid not null references moasem.programs(id),
  title text not null check (length(title) between 1 and 200),
  details text not null default '' check (length(details) <= 2000),
  assigned_on date not null,
  due_on date not null,
  status text not null default 'assigned'
    check (status in ('assigned', 'submitted', 'checked')),
  submitted_at timestamptz,
  checked_at timestamptz,
  created_by uuid not null references moasem.staff_accounts(id),
  created_at timestamptz not null default now(),
  check (due_on >= assigned_on)
);

create index if not exists homework_program_idx
  on moasem.homework (program_id, due_on);
create index if not exists homework_staff_idx
  on moasem.homework (created_by);
create index if not exists homework_student_program_idx
  on moasem.homework (student_id, program_id, due_on);

create table if not exists moasem.homework_photos (
  id uuid primary key,
  homework_id uuid not null references moasem.homework(id),
  storage_path text not null unique,
  created_at timestamptz not null default now()
);

create index if not exists homework_photos_homework_idx
  on moasem.homework_photos (homework_id);

create table if not exists moasem.homework_batches (
  id uuid primary key,
  program_id uuid not null references moasem.programs(id),
  created_by uuid not null references moasem.staff_accounts(id),
  payload jsonb not null,
  created_at timestamptz not null default now()
);

create index if not exists homework_batches_program_idx
  on moasem.homework_batches (program_id, created_at desc);
create index if not exists homework_batches_staff_idx
  on moasem.homework_batches (created_by);

-- ---------------------------------------------------------------------------
-- 4. 사전·사후 진단 (프로그램당 문제지 1개, 학생당 사전/사후 각 1회)
-- ---------------------------------------------------------------------------
create table if not exists moasem.diagnostic_papers (
  program_id uuid primary key references moasem.programs(id),
  title text not null check (length(title) between 1 and 200),
  url text not null check (length(url) <= 2000),
  max_score numeric not null check (max_score > 0 and max_score <= 1000)
);

create table if not exists moasem.diagnostic_scores (
  student_id uuid not null references moasem.students(id),
  program_id uuid not null references moasem.programs(id),
  kind text not null check (kind in ('pre', 'post')),
  score numeric not null check (score >= 0),
  taken_on date not null,
  primary key (student_id, program_id, kind)
);

create index if not exists diagnostic_scores_program_idx
  on moasem.diagnostic_scores (program_id);

-- ---------------------------------------------------------------------------
-- 5. 학생 포털·진도·영상 확인
-- ---------------------------------------------------------------------------
create table if not exists moasem.student_portal_links (
  student_id uuid primary key references moasem.students(id),
  program_id uuid not null references moasem.programs(id),
  token_hash text not null unique,
  expires_at timestamptz not null
);

create index if not exists student_portal_program_idx
  on moasem.student_portal_links (program_id);

create table if not exists moasem.student_progress_entries (
  id uuid primary key,
  student_id uuid not null references moasem.students(id),
  program_id uuid not null references moasem.programs(id),
  created_by uuid not null references moasem.staff_accounts(id),
  lesson_date date not null,
  book text not null check (length(btrim(book)) between 1 and 200),
  unit text not null check (length(unit) <= 200),
  pages text not null check (length(pages) <= 100),
  next_assignment text not null check (length(next_assignment) <= 2000),
  learned text not null check (length(learned) <= 2000),
  difficulties text not null check (length(difficulties) <= 2000),
  teacher_note text not null check (length(teacher_note) <= 2000),
  -- 같은 트랜잭션에서 여러 건을 넣어도 순서가 구분되도록 now() 가 아닌 clock_timestamp()
  created_at timestamptz not null default clock_timestamp()
);

create index if not exists student_progress_author
  on moasem.student_progress_entries (created_by);
create index if not exists student_progress_history
  on moasem.student_progress_entries (student_id, program_id, lesson_date desc, created_at desc, id desc);
create index if not exists student_progress_program
  on moasem.student_progress_entries (program_id);

create table if not exists moasem.student_video_checks (
  student_id uuid not null references moasem.students(id),
  program_id uuid not null references moasem.programs(id),
  video_url text not null check (length(video_url) <= 2000),
  opened_at timestamptz not null default now(),
  confirmed_at timestamptz,
  primary key (student_id, program_id, video_url)
);

create index if not exists student_video_program_idx
  on moasem.student_video_checks (program_id);

-- ---------------------------------------------------------------------------
-- 6. 알림톡 발송 시도
--    접수(accepted)와 도착(delivered)을 구분한다.
--    결과가 불명(unknown)이면 자동 재발송하지 않는다. 아래 부분 유니크 인덱스가
--    실패(failed) 가 아닌 시도를 리포트당 1건으로 제한해 중복 발송을 막는다.
-- ---------------------------------------------------------------------------
create table if not exists moasem.report_notification_attempts (
  id uuid primary key default gen_random_uuid(),
  report_id uuid not null references moasem.guardian_reports(id) on delete cascade,
  requested_by uuid references moasem.staff_accounts(id) on delete set null,
  recipient_phone text not null,
  status text not null default 'sending'
    check (status in ('sending', 'accepted', 'delivered', 'failed', 'unknown')),
  provider_message_id text,
  provider_group_id text,
  provider_status_code text,
  error_code text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists report_notification_attempts_report_time_idx
  on moasem.report_notification_attempts (report_id, created_at desc);
create index if not exists report_notification_attempts_staff_idx
  on moasem.report_notification_attempts (requested_by);
create unique index if not exists report_notification_attempts_once_idx
  on moasem.report_notification_attempts (report_id) where status <> 'failed';

-- ---------------------------------------------------------------------------
-- 7. 보안 — 나머지 moasem 테이블과 동일하게 서버 전용으로 잠근다.
-- ---------------------------------------------------------------------------
alter table moasem.staff_accounts               enable row level security;
alter table moasem.consent_documents            enable row level security;
alter table moasem.guardian_consent_requests    enable row level security;
alter table moasem.guardian_consent_records     enable row level security;
alter table moasem.homework                     enable row level security;
alter table moasem.homework_photos              enable row level security;
alter table moasem.homework_batches             enable row level security;
alter table moasem.diagnostic_papers            enable row level security;
alter table moasem.diagnostic_scores            enable row level security;
alter table moasem.student_portal_links         enable row level security;
alter table moasem.student_progress_entries     enable row level security;
alter table moasem.student_video_checks         enable row level security;
alter table moasem.report_notification_attempts enable row level security;

revoke all on all tables in schema moasem from anon, authenticated;
grant select, insert, update, delete on all tables in schema moasem to service_role;

comment on table moasem.staff_accounts is
  'MOASEM 전용 관리자/강사 권한. 서버만 접근하며 auth 사용자 정보의 role은 신뢰하지 않는다.';
comment on table moasem.guardian_consent_records is
  '동의 일시·언어·자기 확인 기록. 휴대전화 본인 인증 또는 법정대리인 자격 증명을 의미하지 않음.';
comment on table moasem.report_notification_attempts is
  'MOAKIT 알림톡 발송 시도와 결과. 접수와 도착을 구분하며 결과 불명 시 자동 재발송 금지.';
