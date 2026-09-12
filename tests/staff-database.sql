-- Run against the MOASEM schema. Every sample record is rolled back.
begin;
do $$
declare
  institution uuid;
  p1 uuid;
  p2 uuid;
  p3 uuid;
  teacher uuid;
  other_teacher uuid;
  account uuid;
  other_account uuid;
  blocked boolean := false;
begin
  insert into moasem.institutions(name) values ('__staff_test__') returning id into institution;
  insert into moasem.programs(institution_id,name,starts_on,ends_on,week_count) values (institution,'__p1__','2026-01-01','2026-03-31',12) returning id into p1;
  insert into moasem.programs(institution_id,name,starts_on,ends_on,week_count) values (institution,'__p2__','2026-01-01','2026-03-31',12) returning id into p2;
  insert into moasem.programs(institution_id,name,starts_on,ends_on,week_count) values (institution,'__p3__','2026-01-01','2026-03-31',12) returning id into p3;
  insert into moasem.instructors(name) values ('__existing_teacher__') returning id into teacher;
  update moasem.programs set instructor_id=teacher where id=p1;
  account := moasem.save_staff_instructor(null,teacher,null,'__teacher__','test-'||gen_random_uuid()::text||'@example.invalid','',array[p1,p2],true);
  if (select count(*) from moasem.programs where id=any(array[p1,p2]) and instructor_id=teacher) <> 2 then raise exception 'Multiple assignment failed'; end if;
  if (select count(*) from moasem.instructors where id=teacher) <> 1 then raise exception 'Existing teacher duplicated'; end if;
  if (select auth_user_id from moasem.staff_accounts where id=account) is not null then raise exception 'Pending identity must stay unbound'; end if;
  other_account := moasem.save_staff_instructor(null,null,null,'__other__','test-'||gen_random_uuid()::text||'@example.invalid','',array[p3],true);
  select instructor_id into other_teacher from moasem.staff_accounts where id=other_account;
  begin
    perform moasem.save_staff_instructor(account,null,null,'changed',(select email from moasem.staff_accounts where id=account),'',array[p3],false);
  exception when others then
    if sqlerrm <> 'PROGRAM_ALREADY_ASSIGNED' then raise; end if;
    blocked := true;
  end;
  if not blocked then raise exception 'Foreign assignment not rejected'; end if;
  if (select name from moasem.staff_accounts where id=account) <> '__teacher__' then raise exception 'Failed save partially updated account'; end if;
  if (select count(*) from moasem.programs where id=any(array[p1,p2]) and instructor_id=teacher) <> 2 then raise exception 'Failed save partially unassigned programs'; end if;
  perform moasem.save_staff_instructor(account,null,null,'__teacher__',(select email from moasem.staff_accounts where id=account),'',array[p2],false);
  if (select active from moasem.staff_accounts where id=account) then raise exception 'Disable failed'; end if;
  if (select instructor_id from moasem.programs where id=p1) is not null then raise exception 'Unassign failed'; end if;
  if (select instructor_id from moasem.programs where id=p2) <> teacher then raise exception 'Retained assignment failed'; end if;
  if has_table_privilege('anon','moasem.staff_accounts','SELECT') or has_table_privilege('authenticated','moasem.staff_accounts','SELECT') then raise exception 'Account data exposed'; end if;
  if has_function_privilege('authenticated','moasem.bootstrap_staff_admin(uuid,text,text)','EXECUTE') then raise exception 'Bootstrap callable by browser'; end if;
  if has_function_privilege('anon','moasem.save_staff_instructor(uuid,uuid,uuid,text,text,text,uuid[],boolean)','EXECUTE') then raise exception 'Assignment callable by anonymous visitor'; end if;
  if not (select relrowsecurity from pg_class where oid='moasem.staff_accounts'::regclass) then raise exception 'RLS disabled'; end if;
end;
$$;
rollback;
