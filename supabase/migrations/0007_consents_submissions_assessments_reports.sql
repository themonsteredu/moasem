-- MOASEM 2단계: 동의·과제제출·진단·성과보고서 테이블과 계정 연결 칸 추가
--
-- 모두 moasem 스키마 안에서만 작업한다. public 스키마의 다른 앱 테이블은 건드리지 않는다.
-- 신규 테이블은 RLS 를 켜되 정책은 3단계에서 추가한다. 그때까지는 서버(service_role)만 접근한다.

-- ---------------------------------------------------------------------------
-- 1. 기존 테이블에 계정 연결 칸 추가 (3단계 로그인 전환에 필요)
-- ---------------------------------------------------------------------------

-- 강사 로그인 계정 연결
alter table moasem.instructors
  add column if not exists user_id uuid references auth.users(id) on delete set null;

create unique index if not exists instructors_user_id_idx
  on moasem.instructors(user_id) where user_id is not null;

-- 기관 담당자 로그인 계정 연결
alter table moasem.institutions
  add column if not exists manager_user_id uuid references auth.users(id) on delete set null;

create index if not exists institutions_manager_user_idx
  on moasem.institutions(manager_user_id) where manager_user_id is not null;

-- 학생 입장 코드 (프로그램 코드 + 이름으로 입장)
create or replace function moasem.generate_join_code()
returns text
language sql
volatile
as $$
  -- 헷갈리는 글자(0/O, 1/I) 를 뺀 32자에서 6자리를 뽑는다.
  select string_agg(
           substr('ABCDEFGHJKLMNPQRSTUVWXYZ23456789', (floor(random() * 32)::int) + 1, 1),
           ''
         )
  from generate_series(1, 6);
$$;

alter table moasem.programs
  add column if not exists join_code text default moasem.generate_join_code();

update moasem.programs set join_code = moasem.generate_join_code() where join_code is null;

create unique index if not exists programs_join_code_idx
  on moasem.programs(join_code) where join_code is not null;

-- ---------------------------------------------------------------------------
-- 2. consents — 학생별 법정대리인 동의
-- ---------------------------------------------------------------------------
create table if not exists moasem.consents (
  id uuid primary key default gen_random_uuid(),
  student_id uuid not null references moasem.students(id) on delete cascade,
  guardian_id uuid references moasem.guardians(id) on delete set null,
  consent_type text not null default 'personal_data'
    check (consent_type in ('personal_data', 'photo', 'video', 'third_party', 'marketing')),
  document_version text not null,
  language text not null default 'ko' check (language in ('ko', 'vi', 'zh-CN')),
  consented_at timestamptz not null default now(),
  method text not null default 'online' check (method in ('online', 'paper', 'verbal')),
  -- 동의 당시 서명자 정보를 그대로 남긴다. 보호자 정보가 나중에 바뀌어도 기록은 보존된다.
  guardian_name_snapshot text,
  guardian_relation text,
  revoked_at timestamptz,
  note text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists consents_student_idx
  on moasem.consents(student_id, consent_type, consented_at desc);

-- ---------------------------------------------------------------------------
-- 3. submissions — 과제 사진 제출
--    실제 파일은 비공개 버킷 moasem-submissions 에 두고 여기에는 경로만 저장한다.
-- ---------------------------------------------------------------------------
create table if not exists moasem.submissions (
  id uuid primary key default gen_random_uuid(),
  student_id uuid not null references moasem.students(id) on delete cascade,
  program_id uuid not null references moasem.programs(id) on delete cascade,
  week_no integer not null check (week_no > 0),
  storage_path text not null unique,
  original_filename text,
  content_type text,
  byte_size integer check (byte_size is null or byte_size >= 0),
  submitted_at timestamptz not null default now(),
  status text not null default 'submitted'
    check (status in ('submitted', 'grading', 'graded', 'rejected')),
  graded_at timestamptz,
  -- 자동채점이 붙으면 채점 결과(학습기록)와 연결한다.
  learning_log_id uuid references moasem.learning_logs(id) on delete set null,
  note text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists submissions_student_week_idx
  on moasem.submissions(student_id, week_no, submitted_at desc);
create index if not exists submissions_program_idx
  on moasem.submissions(program_id, submitted_at desc);
create index if not exists submissions_status_idx
  on moasem.submissions(status) where status in ('submitted', 'grading');

-- ---------------------------------------------------------------------------
-- 4. assessments — 사전·사후 진단
-- ---------------------------------------------------------------------------
create table if not exists moasem.assessments (
  id uuid primary key default gen_random_uuid(),
  program_id uuid not null references moasem.programs(id) on delete cascade,
  student_id uuid not null references moasem.students(id) on delete cascade,
  kind text not null check (kind in ('pre', 'post')),
  taken_on date,
  score numeric(6,2) check (score is null or score >= 0),
  max_score numeric(6,2) not null default 100 check (max_score > 0),
  correct_count integer check (correct_count is null or correct_count >= 0),
  total_count integer check (total_count is null or total_count >= 0),
  -- 문항별 채점 결과 등 상세 내용
  result jsonb,
  note text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  -- 학생 한 명당 프로그램별로 사전 1회, 사후 1회
  unique (program_id, student_id, kind)
);

create index if not exists assessments_program_kind_idx
  on moasem.assessments(program_id, kind);

-- ---------------------------------------------------------------------------
-- 5. reports — 프로그램 단위 성과보고서
--    (보호자 개인 리포트는 기존 guardian_reports 를 계속 쓴다.)
-- ---------------------------------------------------------------------------
create table if not exists moasem.reports (
  id uuid primary key default gen_random_uuid(),
  program_id uuid not null references moasem.programs(id) on delete cascade,
  title text,
  period_start date,
  period_end date,
  -- 출석률, 평균 향상도 등 지표 요약
  metrics jsonb,
  storage_path text,
  generated_at timestamptz not null default now(),
  generated_by text,
  created_at timestamptz not null default now()
);

create index if not exists reports_program_idx
  on moasem.reports(program_id, generated_at desc);

-- ---------------------------------------------------------------------------
-- 6. 보안: 신규 4개 테이블도 기존 12개와 동일하게 잠근다.
-- ---------------------------------------------------------------------------
alter table moasem.consents    enable row level security;
alter table moasem.submissions enable row level security;
alter table moasem.assessments enable row level security;
alter table moasem.reports     enable row level security;

revoke all on moasem.consents, moasem.submissions, moasem.assessments, moasem.reports
  from anon, authenticated;

grant select, insert, update, delete
  on moasem.consents, moasem.submissions, moasem.assessments, moasem.reports
  to service_role;

comment on table moasem.consents    is 'MOASEM 학생별 법정대리인 동의 기록';
comment on table moasem.submissions is 'MOASEM 과제 사진 제출 (파일은 moasem-submissions 버킷)';
comment on table moasem.assessments is 'MOASEM 사전·사후 진단 결과';
comment on table moasem.reports     is 'MOASEM 프로그램 단위 성과보고서';
comment on column moasem.programs.join_code        is '학생 입장용 프로그램 코드';
comment on column moasem.instructors.user_id       is '강사 Supabase Auth 계정';
comment on column moasem.institutions.manager_user_id is '기관 담당자 Supabase Auth 계정';
