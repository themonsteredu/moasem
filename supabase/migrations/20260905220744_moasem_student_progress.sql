create table moasem.student_progress_entries (
  id uuid primary key,
  student_id uuid not null references moasem.students(id),
  program_id uuid not null references moasem.programs(id),
  created_by uuid not null references moasem.staff_accounts(id),
  lesson_date date not null,
  book text not null check (length(btrim(book)) between 1 and 200),
  unit text not null check (length(unit)<=200),
  pages text not null check (length(pages)<=100),
  next_assignment text not null check (length(next_assignment)<=2000),
  learned text not null check (length(learned)<=2000),
  difficulties text not null check (length(difficulties)<=2000),
  teacher_note text not null check (length(teacher_note)<=2000),
  created_at timestamptz not null default clock_timestamp()
);
create index student_progress_history on moasem.student_progress_entries(student_id,program_id,lesson_date desc,created_at desc,id desc);
create index student_progress_program on moasem.student_progress_entries(program_id);
create index student_progress_author on moasem.student_progress_entries(created_by);
alter table moasem.student_progress_entries enable row level security;
revoke all on moasem.student_progress_entries from public,anon,authenticated,service_role;
grant select,insert on moasem.student_progress_entries to service_role;

-- Caller identity is supplied only by the server after verified Auth + current staff lookup.
create function moasem.student_progress_access(p_staff_id uuid,p_student_id uuid)
returns uuid language plpgsql security invoker set search_path='' as $$
declare s moasem.staff_accounts; pupil moasem.students; teacher uuid;
begin
 select * into s from moasem.staff_accounts where id=p_staff_id and active for share;
 if not found or s.role not in ('admin','instructor') then raise exception 'STAFF_ACCESS_DENIED'; end if;
 select * into pupil from moasem.students where id=p_student_id for share;
 if not found then raise exception 'STUDENT_NOT_FOUND'; end if;
 select instructor_id into teacher from moasem.programs where id=pupil.program_id for share;
 if s.role='instructor' and (s.instructor_id is null or s.instructor_id is distinct from teacher) then raise exception 'PROGRAM_ACCESS_DENIED'; end if;
 return pupil.program_id;
end $$;

create function moasem.save_student_progress(p_staff_id uuid,p_student_id uuid,p_entry_id uuid,p_input jsonb)
returns uuid language plpgsql security invoker set search_path='' as $$
declare program uuid; old moasem.student_progress_entries; key text; day date;
begin
 program := moasem.student_progress_access(p_staff_id,p_student_id);
 if not (select active from moasem.students where id=p_student_id) then raise exception 'STUDENT_INACTIVE'; end if;
 if p_entry_id is null or jsonb_typeof(p_input) is distinct from 'object' then raise exception 'INVALID_PROGRESS'; end if;
 foreach key in array array['lesson_date','book','unit','pages','next_assignment','learned','difficulties','teacher_note'] loop
  if jsonb_typeof(p_input->key) is distinct from 'string' then raise exception 'INVALID_PROGRESS'; end if;
 end loop;
 if (p_input->>'lesson_date') !~ '^\d{4}-\d{2}-\d{2}$' then raise exception 'INVALID_PROGRESS'; end if;
 begin day := (p_input->>'lesson_date')::date; exception when others then raise exception 'INVALID_PROGRESS'; end;
 if day > (now() at time zone 'Asia/Seoul')::date or day < date '2000-01-01' then raise exception 'INVALID_PROGRESS'; end if;
 insert into moasem.student_progress_entries(id,student_id,program_id,created_by,lesson_date,book,unit,pages,next_assignment,learned,difficulties,teacher_note)
 values(p_entry_id,p_student_id,program,p_staff_id,day,btrim(p_input->>'book'),p_input->>'unit',p_input->>'pages',p_input->>'next_assignment',p_input->>'learned',p_input->>'difficulties',p_input->>'teacher_note')
 on conflict(id) do nothing;
 select * into old from moasem.student_progress_entries where id=p_entry_id;
 if old.student_id<>p_student_id or old.program_id<>program or old.created_by<>p_staff_id or old.lesson_date<>day or old.book<>btrim(p_input->>'book') or old.unit<>p_input->>'unit' or old.pages<>p_input->>'pages' or old.next_assignment<>p_input->>'next_assignment' or old.learned<>p_input->>'learned' or old.difficulties<>p_input->>'difficulties' or old.teacher_note<>p_input->>'teacher_note' then raise exception 'PROGRESS_CONFLICT'; end if;
 return old.id;
end $$;

create function moasem.read_student_progress(p_staff_id uuid,p_student_id uuid,p_offset integer default 0)
returns jsonb language plpgsql security invoker set search_path='' as $$
declare program uuid; pupil jsonb; current_entry jsonb; entries jsonb;
begin
 program := moasem.student_progress_access(p_staff_id,p_student_id);
 if p_offset is null or p_offset<0 or p_offset>100000 then raise exception 'INVALID_PROGRESS'; end if;
 select jsonb_build_object('id',s.id,'name',s.name,'grade',s.grade,'active',s.active,'program_name',p.name,'institution_name',i.name) into pupil
 from moasem.students s join moasem.programs p on p.id=s.program_id join moasem.institutions i on i.id=p.institution_id where s.id=p_student_id;
 select to_jsonb(e) - 'student_id' - 'program_id' - 'created_by' into current_entry from moasem.student_progress_entries e where student_id=p_student_id and program_id=program order by lesson_date desc,created_at desc,id desc limit 1;
 select coalesce(jsonb_agg(x.item order by x.record_date desc,x.created_at desc,x.id desc),'[]'::jsonb) into entries from (
  select * from (
   select e.id,e.lesson_date as record_date,e.created_at,(to_jsonb(e)-'student_id'-'program_id'-'created_by') || jsonb_build_object('kind','progress','author',a.name) item
   from moasem.student_progress_entries e join moasem.staff_accounts a on a.id=e.created_by where e.student_id=p_student_id and e.program_id=program
   union all
   select l.id,l.lesson_date,l.created_at,jsonb_build_object('id',l.id,'kind','result','lesson_date',l.lesson_date,'solved_count',l.solved_count,'wrong_count',l.wrong_count,'wrong_type_summary',l.wrong_type_summary,'weekly_assignment',l.weekly_assignment,'teacher_note',l.teacher_note,'reports',coalesce((select jsonb_agg(jsonb_build_object('id',r.id,'language',r.language,'token',case when r.expires_at>now() and r.guardian_id=s.guardian_id then r.token else null end,'expires_at',r.expires_at) order by r.created_at desc) from moasem.guardian_reports r join moasem.students s on s.id=r.student_id where r.learning_log_id=l.id and r.student_id=p_student_id),'[]'::jsonb))
   from moasem.learning_logs l where l.student_id=p_student_id and l.program_id=program
  ) history order by record_date desc,created_at desc,id desc offset p_offset limit 21
 ) x;
 return jsonb_build_object('student',pupil,'current',current_entry,'entries',entries);
end $$;
revoke all on function moasem.student_progress_access(uuid,uuid),moasem.save_student_progress(uuid,uuid,uuid,jsonb),moasem.read_student_progress(uuid,uuid,integer) from public,anon,authenticated;
grant execute on function moasem.student_progress_access(uuid,uuid),moasem.save_student_progress(uuid,uuid,uuid,jsonb),moasem.read_student_progress(uuid,uuid,integer) to service_role;

