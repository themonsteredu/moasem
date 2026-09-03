create table if not exists public.moasem_learning_logs (
  id uuid primary key default gen_random_uuid(),
  student_id uuid not null references public.moasem_students(id) on delete cascade,
  program_id uuid not null references public.moasem_programs(id) on delete cascade,
  lesson_date date not null,
  solved_count integer not null default 0 check (solved_count >= 0),
  wrong_count integer not null default 0 check (wrong_count >= 0),
  wrong_type_summary text,
  weekly_assignment text,
  video_url text,
  teacher_note text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists moasem_learning_logs_student_date_idx
  on public.moasem_learning_logs(student_id, lesson_date desc);

create table if not exists public.moasem_guardian_reports (
  id uuid primary key default gen_random_uuid(),
  student_id uuid not null references public.moasem_students(id) on delete cascade,
  guardian_id uuid references public.moasem_guardians(id) on delete set null,
  learning_log_id uuid not null references public.moasem_learning_logs(id) on delete cascade,
  language text not null check (language in ('ko','vi','zh-CN')),
  token uuid not null default gen_random_uuid(),
  expires_at timestamptz not null default (now() + interval '14 days'),
  headline text,
  action_line text,
  created_at timestamptz not null default now(),
  unique(token)
);

create index if not exists moasem_guardian_reports_student_idx
  on public.moasem_guardian_reports(student_id, created_at desc);
create unique index if not exists moasem_guardian_reports_token_idx
  on public.moasem_guardian_reports(token);

alter table public.moasem_learning_logs enable row level security;
alter table public.moasem_guardian_reports enable row level security;

comment on table public.moasem_learning_logs is 'MOASEM 자동채점 전에도 강사가 직접 입력할 수 있는 학습 결과';
comment on table public.moasem_guardian_reports is 'MOASEM 보호자 로그인 없는 링크형 학습 리포트';