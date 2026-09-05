-- Integration assertions against MOASEM only. All fixtures and changes are rolled back.
begin;
do $$
declare
  institution uuid; program uuid; teacher uuid; account uuid; foreign_account uuid;
  pupil uuid; guardian uuid; t1 uuid; t2 uuid; t3 uuid; private_type uuid; inactive_type uuid;
  video uuid; private_video uuid; result jsonb; snapshot jsonb; log_id uuid;
  payload jsonb := '{"lesson_date":"2026-09-05","solved_count":10,"wrong_count":2,"language":"vi","teacher_note":"INTERNAL ONLY"}';
  before_logs bigint; before_reports bigint; before_links bigint; rejected boolean;
  attempt record;
begin
  insert into moasem.institutions(name) values ('__report_test__') returning id into institution;
  insert into moasem.instructors(name) values ('__report_teacher__') returning id into teacher;
  insert into moasem.programs(institution_id,instructor_id,name,starts_on,ends_on,week_count)
    values(institution,teacher,'__report_program__','2026-01-01','2026-12-31',12) returning id into program;
  account := moasem.save_staff_instructor(null,teacher,null,'__report_teacher__','test-'||gen_random_uuid()||'@example.invalid','',array[program],true);
  foreign_account := moasem.save_staff_instructor(null,null,null,'__foreign_teacher__','test-'||gen_random_uuid()||'@example.invalid','','{}',true);
  insert into moasem.guardians(name,phone,language) values('__sample_guardian__','TEST-NO-DELIVERY','vi') returning id into guardian;
  insert into moasem.students(program_id,guardian_id,name,grade) values(program,guardian,'__sample_pupil__',3) returning id into pupil;
  insert into moasem.wrong_types(code,name,grade,description_vi) values('test-'||gen_random_uuid(),'__type_one__',3,'Cộng các tử số.') returning id into t1;
  insert into moasem.wrong_types(code,name,grade) values('test-'||gen_random_uuid(),'__type_two__',3) returning id into t2;
  insert into moasem.wrong_types(code,name,grade) values('test-'||gen_random_uuid(),'__unlinked_type__',3) returning id into t3;
  insert into moasem.wrong_types(code,name,grade) values('test-'||gen_random_uuid(),'__private_video_type__',3) returning id into private_type;
  insert into moasem.wrong_types(code,name,grade,active) values('test-'||gen_random_uuid(),'__inactive_type__',3,false) returning id into inactive_type;
  insert into moasem.supplement_videos(title,url) values('__original_video__','https://example.com/report-test') returning id into video;
  insert into moasem.supplement_videos(title,url,visibility) values('__private_video__','https://example.com/private','private') returning id into private_video;
  insert into moasem.wrong_type_videos(wrong_type_id,video_id,is_primary) values(t1,video,true),(t2,video,true),(private_type,private_video,true);

  -- Exercise the exact execution role used by the server, with no Auth account creation.
  set local role service_role;
  result := moasem.create_staff_learning_report(account,pupil,payload || '{"video_url":"https://example.com/report-test"}',array[t2,t1,t3,private_type]);
  select learning_log_id into log_id from moasem.guardian_reports where token=(result->>'token')::uuid;
  select resource_snapshot into snapshot from moasem.learning_logs where id=log_id;
  if jsonb_array_length(snapshot->'wrong_types')<>4 then raise exception 'Selected type lost'; end if;
  if snapshot->'wrong_types'->0->>'id'<>t2::text then raise exception 'Selection order changed'; end if;
  if snapshot->'wrong_types'->1->>'description_vi'<>'Cộng các tử số.' then raise exception 'Native description missing'; end if;
  if jsonb_array_length(snapshot->'videos')<>1 then raise exception 'Duplicate or private video exposed'; end if;
  if (select count(*) from moasem.learning_log_wrong_types where learning_log_id=log_id)<>4 then raise exception 'Student type history not saved'; end if;
  if (result->>'expires_at')::timestamptz < now()+interval '13 days' then raise exception 'Report expiry missing'; end if;
  if (select guardian_id from moasem.guardian_reports where learning_log_id=log_id)<>guardian then raise exception 'Wrong guardian'; end if;
  update moasem.wrong_types set name='__renamed_type__' where id=t1;
  update moasem.supplement_videos set title='__changed_video__',url='https://example.com/changed' where id=video;
  if (select resource_snapshot from moasem.learning_logs where id=log_id)<>snapshot then raise exception 'Past report changed with catalog'; end if;

  result := moasem.create_staff_learning_report(account,pupil,payload || '{"video_url":"https://example.com/extra"}',array[t1]);
  if (select jsonb_array_length(l.resource_snapshot->'videos') from moasem.learning_logs l join moasem.guardian_reports r on r.learning_log_id=l.id where r.token=(result->>'token')::uuid)<>2 then raise exception 'Extra manual video lost'; end if;
  update moasem.supplement_videos set active=false where id=video;
  result := moasem.create_staff_learning_report(account,pupil,payload,array[t1]);
  if (select jsonb_array_length(l.resource_snapshot->'videos') from moasem.learning_logs l join moasem.guardian_reports r on r.learning_log_id=l.id where r.token=(result->>'token')::uuid)<>0 then raise exception 'Inactive video exposed'; end if;
  result := moasem.create_staff_learning_report(account,pupil,payload || '{"wrong_count":0,"video_url":"https://example.com/manual"}','{}');
  if (select l.video_url from moasem.learning_logs l join moasem.guardian_reports r on r.learning_log_id=l.id where r.token=(result->>'token')::uuid)<>'https://example.com/manual' then raise exception 'Legacy manual report failed'; end if;

  select count(*) into before_logs from moasem.learning_logs;
  select count(*) into before_reports from moasem.guardian_reports;
  select count(*) into before_links from moasem.learning_log_wrong_types;
  for attempt in select * from (values
    (foreign_account,array[t1],payload,'PROGRAM_ACCESS_DENIED'),
    (account,array[t1,t1],payload,'INVALID_WRONG_TYPES'),
    (account,array[inactive_type],payload,'INVALID_WRONG_TYPES'),
    (account,array[gen_random_uuid()],payload,'INVALID_WRONG_TYPES'),
    (account,array[t1],payload || '{"wrong_count":0}','WRONG_COUNT_REQUIRED'),
    (account,array[t1],payload || '{"video_url":"javascript:alert(1)"}','INVALID_VIDEO_URL')
  ) as v(staff_id,ids,body,message) loop
    rejected := false;
    begin
      perform moasem.create_staff_learning_report(attempt.staff_id,pupil,attempt.body,attempt.ids);
    exception when others then
      if sqlerrm<>attempt.message then raise; end if;
      rejected := true;
    end;
    if not rejected then raise exception 'Invalid or unauthorized save succeeded'; end if;
  end loop;
  update moasem.staff_accounts set active=false where id=account;
  rejected := false;
  begin
    perform moasem.create_staff_learning_report(account,pupil,payload,array[t1]);
  exception when others then
    if sqlerrm<>'STAFF_ACCESS_DENIED' then raise; end if;
    rejected := true;
  end;
  if not rejected then raise exception 'Disabled staff saved report'; end if;
  if (select count(*) from moasem.learning_logs)<>before_logs or (select count(*) from moasem.guardian_reports)<>before_reports or (select count(*) from moasem.learning_log_wrong_types)<>before_links then raise exception 'Rejected save left partial records'; end if;
  reset role;
  if has_function_privilege('anon','moasem.create_staff_learning_report(uuid,uuid,jsonb,uuid[])','EXECUTE') or has_function_privilege('authenticated','moasem.create_staff_learning_report(uuid,uuid,jsonb,uuid[])','EXECUTE') then raise exception 'Browser can call private save function'; end if;
  if exists(select 1 from pg_class where oid in ('moasem.learning_logs'::regclass,'moasem.guardian_reports'::regclass,'moasem.learning_log_wrong_types'::regclass) and not relrowsecurity) then raise exception 'RLS missing'; end if;
end;
$$;
rollback;
