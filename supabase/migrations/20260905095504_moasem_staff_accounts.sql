create table moasem.staff_accounts (
  id uuid primary key default gen_random_uuid(),
  auth_user_id uuid unique references auth.users(id) on delete set null,
  name text not null check (length(btrim(name)) between 1 and 100),
  email text not null unique check (email = lower(btrim(email)) and length(email) between 3 and 254),
  role text not null check (role in ('admin','instructor')),
  instructor_id uuid unique references moasem.instructors(id) on delete restrict,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  check ((role='admin' and instructor_id is null) or (role='instructor' and instructor_id is not null))
);
alter table moasem.staff_accounts enable row level security;
revoke all on moasem.staff_accounts from public, anon, authenticated;
grant select,insert,update,delete on moasem.staff_accounts to service_role;
create index if not exists programs_instructor_idx on moasem.programs(instructor_id);

create function moasem.bootstrap_staff_admin(p_user_id uuid,p_email text,p_name text)
returns uuid language plpgsql security invoker set search_path='' as $$
declare account_id uuid;
begin
  perform pg_advisory_xact_lock(hashtext('moasem.bootstrap_staff_admin'));
  if exists(select 1 from moasem.staff_accounts where role='admin') then raise exception 'ADMIN_ALREADY_EXISTS'; end if;
  if p_user_id is null then raise exception 'USER_REQUIRED'; end if;
  insert into moasem.staff_accounts(auth_user_id,email,name,role)
  values(p_user_id,lower(btrim(p_email)),btrim(p_name),'admin') returning id into account_id;
  return account_id;
end;
$$;
revoke all on function moasem.bootstrap_staff_admin(uuid,text,text) from public,anon,authenticated;
grant execute on function moasem.bootstrap_staff_admin(uuid,text,text) to service_role;

create function moasem.save_staff_instructor(p_account_id uuid,p_instructor_id uuid,p_auth_user_id uuid,p_name text,p_email text,p_phone text,p_program_ids uuid[],p_active boolean)
returns uuid language plpgsql security invoker set search_path='' as $$
declare account_row moasem.staff_accounts; instructor_id_value uuid; account_id_value uuid; ids uuid[] := coalesce(p_program_ids,'{}'::uuid[]);
begin
  -- Serializes assignments so two administrators cannot silently overwrite one another.
  perform pg_advisory_xact_lock(hashtext('moasem.save_staff_instructor'));
  if p_account_id is not null then
    select * into account_row from moasem.staff_accounts where id=p_account_id and role='instructor' for update;
    if not found then raise exception 'ACCOUNT_NOT_FOUND'; end if;
    if account_row.email <> lower(btrim(p_email)) then raise exception 'EMAIL_CHANGE_NOT_ALLOWED'; end if;
    instructor_id_value := account_row.instructor_id;
    account_id_value := account_row.id;
    update moasem.staff_accounts set name=btrim(p_name),active=p_active where id=account_id_value;
  else
    if p_instructor_id is not null then
      perform 1 from moasem.instructors where id=p_instructor_id for update;
      if not found then raise exception 'INSTRUCTOR_NOT_FOUND'; end if;
      if exists(select 1 from moasem.staff_accounts where instructor_id=p_instructor_id) then raise exception 'INSTRUCTOR_ALREADY_LINKED'; end if;
      instructor_id_value := p_instructor_id;
    else
      insert into moasem.instructors(name,phone,email) values(btrim(p_name),nullif(btrim(p_phone),''),lower(btrim(p_email))) returning id into instructor_id_value;
    end if;
    insert into moasem.staff_accounts(auth_user_id,name,email,role,instructor_id,active)
    values(p_auth_user_id,btrim(p_name),lower(btrim(p_email)),'instructor',instructor_id_value,p_active) returning id into account_id_value;
  end if;
  if exists(select 1 from unnest(ids) as selected(id) where not exists(select 1 from moasem.programs p where p.id=selected.id)) then raise exception 'PROGRAM_NOT_FOUND'; end if;
  perform 1 from moasem.programs where instructor_id=instructor_id_value or id=any(ids) order by id for update;
  if exists(select 1 from moasem.programs where id=any(ids) and instructor_id is not null and instructor_id<>instructor_id_value) then raise exception 'PROGRAM_ALREADY_ASSIGNED'; end if;
  update moasem.instructors set name=btrim(p_name),phone=nullif(btrim(p_phone),''),email=lower(btrim(p_email)) where id=instructor_id_value;
  update moasem.programs set instructor_id=null,updated_at=now() where instructor_id=instructor_id_value and not (id=any(ids));
  update moasem.programs set instructor_id=instructor_id_value,updated_at=now() where id=any(ids);
  return account_id_value;
end;
$$;
revoke all on function moasem.save_staff_instructor(uuid,uuid,uuid,text,text,text,uuid[],boolean) from public,anon,authenticated;
grant execute on function moasem.save_staff_instructor(uuid,uuid,uuid,text,text,text,uuid[],boolean) to service_role;
comment on table moasem.staff_accounts is 'MOASEM 전용 관리자/강사 권한. 서버만 접근하며 auth 사용자 정보의 role은 신뢰하지 않는다.';
