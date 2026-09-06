create table moasem.homework (
 id uuid primary key, student_id uuid not null references moasem.students(id), program_id uuid not null references moasem.programs(id),
 title text not null check(length(title) between 1 and 200), details text not null default '' check(length(details)<=2000), assigned_on date not null, due_on date not null check(due_on>=assigned_on),
 status text not null default 'assigned' check(status in ('assigned','submitted','checked')), submitted_at timestamptz, checked_at timestamptz,
 created_by uuid not null references moasem.staff_accounts(id), created_at timestamptz not null default now()
);
create index homework_student_program_idx on moasem.homework(student_id,program_id,due_on);
create index homework_program_idx on moasem.homework(program_id,due_on);
create index homework_staff_idx on moasem.homework(created_by);
create table moasem.homework_photos (
 id uuid primary key, homework_id uuid not null references moasem.homework(id), storage_path text not null unique, created_at timestamptz not null default now()
);
create index homework_photos_homework_idx on moasem.homework_photos(homework_id);
create table moasem.student_portal_links (
 student_id uuid primary key references moasem.students(id), program_id uuid not null references moasem.programs(id), token_hash text not null unique, expires_at timestamptz not null
);
create index student_portal_program_idx on moasem.student_portal_links(program_id);
create table moasem.diagnostic_papers (
 program_id uuid primary key references moasem.programs(id), title text not null check(length(title) between 1 and 200), url text not null check(length(url)<=2000), max_score numeric not null check(max_score>0 and max_score<=1000)
);
create table moasem.diagnostic_scores (
 student_id uuid not null references moasem.students(id), program_id uuid not null references moasem.programs(id), kind text not null check(kind in ('pre','post')), score numeric not null check(score>=0), taken_on date not null,
 primary key(student_id,program_id,kind)
);
create index diagnostic_scores_program_idx on moasem.diagnostic_scores(program_id);
create table moasem.student_video_checks (
 student_id uuid not null references moasem.students(id), program_id uuid not null references moasem.programs(id), video_url text not null check(length(video_url)<=2000), opened_at timestamptz not null default now(), confirmed_at timestamptz,
 primary key(student_id,program_id,video_url)
);
create index student_video_program_idx on moasem.student_video_checks(program_id);
do $$ declare t text; begin foreach t in array array['homework','homework_photos','student_portal_links','diagnostic_papers','diagnostic_scores','student_video_checks'] loop execute format('alter table moasem.%I enable row level security',t); execute format('revoke all on moasem.%I from public, anon, authenticated',t); execute format('grant select, insert, update, delete on moasem.%I to service_role',t); end loop; end $$;
-- All writes authorize current staff or student capability inside a transaction.
create function moasem.learning_operation(p_staff uuid,p_student uuid,p_action text,p_body jsonb,p_hash text default null) returns jsonb language plpgsql security invoker set search_path='' as $$
declare s moasem.students; p moasem.programs; a moasem.staff_accounts; h moasem.homework; d moasem.diagnostic_papers; n integer;
begin
 select * into s from moasem.students where id=p_student for share;
 if s.id is null then raise exception 'ACCESS_DENIED'; end if;
 select * into p from moasem.programs where id=s.program_id for share;
 if p_staff is not null then
  select * into a from moasem.staff_accounts where id=p_staff and active for share;
  if a.id is null or (a.role<>'admin' and (a.role<>'instructor' or a.instructor_id is distinct from p.instructor_id)) then raise exception 'ACCESS_DENIED'; end if;
 else
  perform 1 from moasem.student_portal_links where student_id=s.id and program_id=p.id and token_hash=p_hash and expires_at>now() for share;
  if not found or not s.active or p_action not in ('photo','video') then raise exception 'ACCESS_DENIED'; end if;
 end if;
 if not s.active then raise exception 'INACTIVE_STUDENT'; end if;
 if p_action='link' then
  insert into moasem.student_portal_links values(s.id,p.id,p_body->>'hash',now()+interval '30 days') on conflict(student_id) do update set program_id=excluded.program_id,token_hash=excluded.token_hash,expires_at=excluded.expires_at;
 elsif p_action='revoke' then
  delete from moasem.student_portal_links where student_id=s.id;
 elsif p_action='assign' then
  insert into moasem.homework(id,student_id,program_id,title,details,assigned_on,due_on,created_by) values((p_body->>'id')::uuid,s.id,p.id,p_body->>'title',p_body->>'details',(p_body->>'assigned_on')::date,(p_body->>'due_on')::date,a.id) on conflict(id) do nothing;
  if not exists(select 1 from moasem.homework where id=(p_body->>'id')::uuid and student_id=s.id and program_id=p.id and title=p_body->>'title' and details=p_body->>'details' and assigned_on=(p_body->>'assigned_on')::date and due_on=(p_body->>'due_on')::date) then raise exception 'ID_CONFLICT'; end if;
 elsif p_action in ('status','photo') then
  select * into h from moasem.homework where id=(p_body->>'homework_id')::uuid and student_id=s.id and program_id=p.id for update;
  if h.id is null then raise exception 'ACCESS_DENIED'; end if;
  if p_action='status' then
   if p_body->>'status' not in ('assigned','submitted','checked') then raise exception 'INVALID_STATUS'; end if;
   update moasem.homework set status=p_body->>'status',submitted_at=case when p_body->>'status'='assigned' then null else coalesce(submitted_at,now()) end,checked_at=case when p_body->>'status'='checked' then now() else null end where id=h.id;
  else
   if h.status='checked' then raise exception 'ALREADY_CHECKED'; end if;
   select count(*) into n from moasem.homework_photos where homework_id=h.id;
   if n>=5 and not exists(select 1 from moasem.homework_photos where id=(p_body->>'id')::uuid and homework_id=h.id) then raise exception 'PHOTO_LIMIT'; end if;
   insert into moasem.homework_photos(id,homework_id,storage_path) values((p_body->>'id')::uuid,h.id,p_body->>'path') on conflict(id) do nothing;
   if not exists(select 1 from moasem.homework_photos where id=(p_body->>'id')::uuid and homework_id=h.id and storage_path=p_body->>'path') then raise exception 'ID_CONFLICT'; end if;
   update moasem.homework set status='submitted',submitted_at=coalesce(submitted_at,now()) where id=h.id;
  end if;
 elsif p_action='score' then
  select * into d from moasem.diagnostic_papers where program_id=p.id for share;
  if d.program_id is null or (p_body->>'score')::numeric>d.max_score then raise exception 'INVALID_SCORE'; end if;
  insert into moasem.diagnostic_scores values(s.id,p.id,p_body->>'kind',(p_body->>'score')::numeric,(p_body->>'taken_on')::date) on conflict(student_id,program_id,kind) do update set score=excluded.score,taken_on=excluded.taken_on;
 elsif p_action='video' then
  insert into moasem.student_video_checks(student_id,program_id,video_url,confirmed_at) values(s.id,p.id,p_body->>'url',case when p_body->>'confirmed'='true' then now() else null end) on conflict(student_id,program_id,video_url) do update set confirmed_at=coalesce(excluded.confirmed_at,moasem.student_video_checks.confirmed_at);
 else raise exception 'INVALID_ACTION'; end if;
 return jsonb_build_object('ok',true);
end $$;
revoke all on function moasem.learning_operation(uuid,uuid,text,jsonb,text) from public,anon,authenticated;
grant execute on function moasem.learning_operation(uuid,uuid,text,jsonb,text) to service_role;
create function moasem.save_diagnostic_paper(p_staff uuid,p_program uuid,p_title text,p_url text,p_max numeric) returns void language plpgsql security invoker set search_path='' as $$
declare p moasem.programs; a moasem.staff_accounts;
begin
 select * into a from moasem.staff_accounts where id=p_staff and active for share;
 select * into p from moasem.programs where id=p_program for update;
 if a.id is null or p.id is null or (a.role<>'admin' and (a.role<>'instructor' or a.instructor_id is distinct from p.instructor_id)) then raise exception 'ACCESS_DENIED'; end if;
 if exists(select 1 from moasem.diagnostic_scores where program_id=p.id) then raise exception 'PAPER_LOCKED'; end if;
 insert into moasem.diagnostic_papers values(p.id,p_title,p_url,p_max) on conflict(program_id) do update set title=excluded.title,url=excluded.url,max_score=excluded.max_score;
end $$;
revoke all on function moasem.save_diagnostic_paper(uuid,uuid,text,text,numeric) from public,anon,authenticated;
grant execute on function moasem.save_diagnostic_paper(uuid,uuid,text,text,numeric) to service_role;
insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types) values('moasem-homework','moasem-homework',false,3145728,array['image/jpeg','image/png','image/webp']);
