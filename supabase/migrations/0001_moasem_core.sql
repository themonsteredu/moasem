create extension if not exists pgcrypto;

create table if not exists public.moasem_institutions (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  logo_url text,
  manager_name text,
  manager_phone text,
  manager_notifications_enabled boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.moasem_instructors (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  phone text,
  email text,
  created_at timestamptz not null default now()
);

create table if not exists public.moasem_programs (
  id uuid primary key default gen_random_uuid(),
  institution_id uuid not null references public.moasem_institutions(id) on delete cascade,
  name text not null,
  starts_on date not null,
  ends_on date not null,
  week_count integer not null check (week_count > 0),
  instructor_id uuid references public.moasem_instructors(id) on delete set null,
  in_person_weekdays text[] not null default '{}',
  zoom_weekdays text[] not null default '{}',
  zoom_meeting_number text,
  zoom_password text,
  status text not null default 'active' check (status in ('planned','active','completed','archived')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.moasem_guardians (
  id uuid primary key default gen_random_uuid(),
  name text,
  phone text not null,
  language text not null default 'ko' check (language in ('ko','vi','zh-CN')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.moasem_students (
  id uuid primary key default gen_random_uuid(),
  program_id uuid not null references public.moasem_programs(id) on delete cascade,
  guardian_id uuid references public.moasem_guardians(id) on delete set null,
  name text not null,
  grade integer not null check (grade between 1 and 12),
  student_number text,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists moasem_programs_institution_idx on public.moasem_programs(institution_id);
create index if not exists moasem_students_program_idx on public.moasem_students(program_id);
create index if not exists moasem_students_guardian_idx on public.moasem_students(guardian_id);

alter table public.moasem_institutions enable row level security;
alter table public.moasem_instructors enable row level security;
alter table public.moasem_programs enable row level security;
alter table public.moasem_guardians enable row level security;
alter table public.moasem_students enable row level security;

comment on table public.moasem_institutions is 'MOASEM 기관';
comment on table public.moasem_programs is 'MOASEM 기관별 위탁 프로그램';
comment on table public.moasem_students is 'MOASEM 프로그램 학생';
comment on table public.moasem_guardians is 'MOASEM 학생 보호자 및 기본 언어';
