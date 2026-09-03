alter table public.moasem_institutions
  add column if not exists portal_token uuid not null default gen_random_uuid();

create unique index if not exists moasem_institutions_portal_token_idx
  on public.moasem_institutions(portal_token);

create table if not exists public.moasem_attendance (
  id uuid primary key default gen_random_uuid(),
  program_id uuid not null references public.moasem_programs(id) on delete cascade,
  student_id uuid not null references public.moasem_students(id) on delete cascade,
  session_date date not null,
  session_type text not null default 'in_person' check (session_type in ('in_person','zoom')),
  status text not null default 'present' check (status in ('present','absent','late','excused')),
  check_in_at timestamptz,
  check_out_at timestamptz,
  note text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(student_id, session_date, session_type)
);

create index if not exists moasem_attendance_program_date_idx
  on public.moasem_attendance(program_id, session_date desc);
create index if not exists moasem_attendance_student_date_idx
  on public.moasem_attendance(student_id, session_date desc);

alter table public.moasem_attendance enable row level security;

comment on table public.moasem_attendance is 'MOASEM 대면/Zoom 출석 기록';
comment on column public.moasem_institutions.portal_token is '기관 담당자 읽기 전용 포털 접근 토큰';
