create table if not exists public.moasem_wrong_types (
  id uuid primary key default gen_random_uuid(),
  code text not null unique,
  name text not null,
  grade smallint not null check (grade between 1 and 12),
  semester smallint check (semester in (1, 2)),
  domain text,
  unit text,
  description_ko text,
  description_vi text,
  description_zh_cn text,
  display_order integer not null default 0,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists moasem_wrong_types_filter_idx
  on public.moasem_wrong_types(active, grade, semester, domain, display_order, code);

create table if not exists public.moasem_supplement_videos (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  url text not null,
  duration_seconds integer check (duration_seconds is null or duration_seconds >= 0),
  language text not null default 'ko' check (language in ('ko', 'vi', 'zh-CN')),
  provider text not null default 'youtube' check (provider in ('youtube', 'vimeo', 'direct', 'other')),
  visibility text not null default 'unlisted' check (visibility in ('public', 'unlisted', 'private')),
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists moasem_supplement_videos_active_title_idx
  on public.moasem_supplement_videos(active, title);

create table if not exists public.moasem_wrong_type_videos (
  wrong_type_id uuid not null references public.moasem_wrong_types(id) on delete cascade,
  video_id uuid not null references public.moasem_supplement_videos(id) on delete cascade,
  is_primary boolean not null default false,
  priority smallint not null default 0 check (priority >= 0),
  created_at timestamptz not null default now(),
  primary key (wrong_type_id, video_id)
);

create unique index if not exists moasem_wrong_type_videos_one_primary_idx
  on public.moasem_wrong_type_videos(wrong_type_id)
  where is_primary;

create index if not exists moasem_wrong_type_videos_video_idx
  on public.moasem_wrong_type_videos(video_id);

create table if not exists public.moasem_learning_log_wrong_types (
  learning_log_id uuid not null references public.moasem_learning_logs(id) on delete cascade,
  wrong_type_id uuid not null references public.moasem_wrong_types(id) on delete restrict,
  display_order smallint not null default 0 check (display_order >= 0),
  created_at timestamptz not null default now(),
  primary key (learning_log_id, wrong_type_id)
);

create index if not exists moasem_learning_log_wrong_types_type_idx
  on public.moasem_learning_log_wrong_types(wrong_type_id);

alter table public.moasem_wrong_types enable row level security;
alter table public.moasem_supplement_videos enable row level security;
alter table public.moasem_wrong_type_videos enable row level security;
alter table public.moasem_learning_log_wrong_types enable row level security;

revoke all on table public.moasem_wrong_types from anon, authenticated;
revoke all on table public.moasem_supplement_videos from anon, authenticated;
revoke all on table public.moasem_wrong_type_videos from anon, authenticated;
revoke all on table public.moasem_learning_log_wrong_types from anon, authenticated;

grant select, insert, update, delete on table public.moasem_wrong_types to service_role;
grant select, insert, update, delete on table public.moasem_supplement_videos to service_role;
grant select, insert, update, delete on table public.moasem_wrong_type_videos to service_role;
grant select, insert, update, delete on table public.moasem_learning_log_wrong_types to service_role;

comment on table public.moasem_wrong_types is 'MOASEM 오답 유형 기준정보';
comment on table public.moasem_supplement_videos is 'MOASEM 오답 유형별 보충영상 보관함';
comment on table public.moasem_wrong_type_videos is 'MOASEM 오답 유형과 보충영상 연결';
comment on table public.moasem_learning_log_wrong_types is 'MOASEM 학습기록과 오답 유형 연결';
