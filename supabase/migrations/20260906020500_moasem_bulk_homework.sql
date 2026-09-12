create table moasem.homework_batches (
 id uuid primary key,
 program_id uuid not null references moasem.programs(id),
 created_by uuid not null references moasem.staff_accounts(id),
 payload jsonb not null,
 created_at timestamptz not null default now()
);
create index homework_batches_program_idx on moasem.homework_batches(program_id,created_at desc);
create index homework_batches_staff_idx on moasem.homework_batches(created_by);
alter table moasem.homework_batches enable row level security;
revoke all on moasem.homework_batches from public,anon,authenticated;
grant select,insert,update,delete on moasem.homework_batches to service_role;

-- One transaction: either every selected pupil receives the homework or none does.
create function moasem.assign_homework_batch(
 p_staff uuid,p_batch uuid,p_program uuid,p_students uuid[],
 p_title text,p_details text,p_assigned date,p_due date
) returns jsonb language plpgsql security invoker set search_path='' as $$
declare
 actor moasem.staff_accounts; program moasem.programs; saved moasem.homework_batches;
 canonical uuid[]; body jsonb; inserted uuid; matched integer;
begin
 if p_batch is null or p_program is null or coalesce(cardinality(p_students),0) not between 1 and 200
    or array_position(p_students,null) is not null
    or p_title is null or length(btrim(p_title)) not between 1 and 200
    or p_details is null or length(btrim(p_details))>2000
    or p_assigned is null or p_due is null or p_due<p_assigned then raise exception 'INVALID_BATCH'; end if;
 select array_agg(distinct id order by id) into canonical from unnest(p_students) as t(id);
 if cardinality(canonical)<>cardinality(p_students) then raise exception 'INVALID_BATCH'; end if;
 select * into actor from moasem.staff_accounts where id=p_staff and active for share;
 select * into program from moasem.programs where id=p_program for share;
 if actor.id is null or program.id is null or (actor.role<>'admin' and (actor.role<>'instructor' or actor.instructor_id is distinct from program.instructor_id)) then raise exception 'ACCESS_DENIED'; end if;
 body:=jsonb_build_object('student_ids',canonical,'title',btrim(p_title),'details',btrim(p_details),'assigned_on',p_assigned,'due_on',p_due);
 insert into moasem.homework_batches(id,program_id,created_by,payload) values(p_batch,p_program,p_staff,body)
 on conflict(id) do nothing returning id into inserted;
 select * into saved from moasem.homework_batches where id=p_batch for update;
 if saved.program_id is distinct from p_program or saved.created_by is distinct from p_staff or saved.payload is distinct from body then raise exception 'ID_CONFLICT'; end if;
 if inserted is null then return jsonb_build_object('id',p_batch,'count',cardinality(canonical),'replayed',true); end if;
 -- Keep enrollment and active status stable throughout the insert.
 perform id from moasem.students where id=any(canonical) and program_id=p_program and active order by id for share;
 get diagnostics matched=row_count;
 if matched<>cardinality(canonical) then raise exception 'STUDENTS_CHANGED'; end if;
 insert into moasem.homework(id,student_id,program_id,title,details,assigned_on,due_on,created_by)
 select gen_random_uuid(),id,p_program,btrim(p_title),btrim(p_details),p_assigned,p_due,p_staff from unnest(canonical) as t(id);
 return jsonb_build_object('id',p_batch,'count',matched,'replayed',false);
end $$;
revoke all on function moasem.assign_homework_batch(uuid,uuid,uuid,uuid[],text,text,date,date) from public,anon,authenticated;
grant execute on function moasem.assign_homework_batch(uuid,uuid,uuid,uuid[],text,text,date,date) to service_role;
