begin;
do $$
declare institution uuid; instructor uuid; actor uuid; outsider uuid; p uuid; p2 uuid; a uuid; b uuid; inactive uuid; foreign_pupil uuid; batch uuid:=gen_random_uuid(); bad_batch uuid; result jsonb; blocked boolean;
begin
 insert into moasem.institutions(name) values('__bulk_homework_test__') returning id into institution;
 insert into moasem.instructors(name) values('__bulk_test__') returning id into instructor;
 insert into moasem.programs(institution_id,instructor_id,name,starts_on,ends_on,week_count) values(institution,instructor,'Bulk test','2026-01-01','2026-12-31',12) returning id into p;
 insert into moasem.programs(institution_id,name,starts_on,ends_on,week_count) values(institution,'Other','2026-01-01','2026-12-31',12) returning id into p2;
 actor:=moasem.save_staff_instructor(null,instructor,null,'Test','test-'||gen_random_uuid()||'@example.invalid','',array[p],true);
 insert into moasem.instructors(name) values('Other') returning id into outsider;
 outsider:=moasem.save_staff_instructor(null,outsider,null,'Other','test-'||gen_random_uuid()||'@example.invalid','',array[]::uuid[],true);
 insert into moasem.students(program_id,name,grade) values(p,'A',3) returning id into a;
 insert into moasem.students(program_id,name,grade) values(p,'B',4) returning id into b;
 insert into moasem.students(program_id,name,grade,active) values(p,'Inactive',3,false) returning id into inactive;
 insert into moasem.students(program_id,name,grade) values(p2,'Foreign',3) returning id into foreign_pupil;
 set local role service_role;
 result:=moasem.assign_homework_batch(actor,batch,p,array[a,b],'분수 연습','20쪽','2026-09-06','2026-09-10');
 if (result->>'count')::integer<>2 or (select count(*) from moasem.homework where program_id=p)<>2 then raise exception 'Bulk save failed'; end if;
 update moasem.homework set status='checked',checked_at=now() where student_id=a;
 result:=moasem.assign_homework_batch(actor,batch,p,array[b,a],'분수 연습','20쪽','2026-09-06','2026-09-10');
 if result->>'replayed'<>'true' or (select count(*) from moasem.homework where program_id=p)<>2 or (select status from moasem.homework where student_id=a)<>'checked' then raise exception 'Retry changed homework'; end if;
 blocked:=false;begin perform moasem.assign_homework_batch(actor,batch,p,array[a,b],'Different','20쪽','2026-09-06','2026-09-10');exception when others then if sqlerrm<>'ID_CONFLICT' then raise;end if;blocked:=true;end;if not blocked then raise exception 'Payload collision accepted';end if;
 blocked:=false;begin perform moasem.assign_homework_batch(outsider,gen_random_uuid(),p,array[a],'Test','','2026-09-06','2026-09-10');exception when others then if sqlerrm<>'ACCESS_DENIED' then raise;end if;blocked:=true;end;if not blocked then raise exception 'Foreign staff allowed';end if;
 foreach foreign_pupil in array array[foreign_pupil,inactive,gen_random_uuid()] loop
  bad_batch:=gen_random_uuid();blocked:=false;
  begin perform moasem.assign_homework_batch(actor,bad_batch,p,array[b,foreign_pupil],'Bad','','2026-09-06','2026-09-10');exception when others then if sqlerrm<>'STUDENTS_CHANGED' then raise;end if;blocked:=true;end;
  if not blocked or exists(select 1 from moasem.homework_batches where id=bad_batch) or (select count(*) from moasem.homework where program_id=p)<>2 then raise exception 'Partial save'; end if;
 end loop;
 blocked:=false;begin perform moasem.assign_homework_batch(actor,gen_random_uuid(),p,array[a,a],'Test','','2026-09-06','2026-09-10');exception when others then if sqlerrm<>'INVALID_BATCH' then raise;end if;blocked:=true;end;if not blocked then raise exception 'Duplicate student allowed';end if;
 -- Completed retries remain confirmable after enrollment changes; no new homework is written.
 update moasem.students set program_id=p2 where id=b;
 result:=moasem.assign_homework_batch(actor,batch,p,array[a,b],'분수 연습','20쪽','2026-09-06','2026-09-10');
 if result->>'replayed'<>'true' or exists(select 1 from moasem.homework where program_id=p2) then raise exception 'Moved student retry failed';end if;
 update moasem.staff_accounts set active=false where id=actor;
 blocked:=false;begin perform moasem.assign_homework_batch(actor,batch,p,array[a,b],'분수 연습','20쪽','2026-09-06','2026-09-10');exception when others then if sqlerrm<>'ACCESS_DENIED' then raise;end if;blocked:=true;end;if not blocked then raise exception 'Inactive staff allowed';end if;
 reset role;
 if has_table_privilege('anon','moasem.homework_batches','SELECT') or has_function_privilege('authenticated','moasem.assign_homework_batch(uuid,uuid,uuid,uuid[],text,text,date,date)','EXECUTE') then raise exception 'Public access';end if;
end $$;
rollback;
select 'Bulk homework: atomic save, retry, scope, enrollment and privileges passed; fixtures rolled back' as result;
