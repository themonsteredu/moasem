begin;
do $$
declare institution_id_value uuid; teacher_id uuid; program_id_value uuid; staff_id_value uuid; admin_id_value uuid;
  guardian_id_value uuid; pupil_id uuid; document_id_value uuid; request_id_value uuid; wrong_type_id uuid; report_token uuid;
  result jsonb; rejected boolean;
begin
  insert into moasem.institutions(name) values('__english_consent_test__') returning id into institution_id_value;
  insert into moasem.instructors(name) values('__test_teacher__') returning id into teacher_id;
  insert into moasem.programs(institution_id,instructor_id,name,starts_on,ends_on,week_count)
    values(institution_id_value,teacher_id,'__test_program__','2026-01-01','2026-12-31',12) returning id into program_id_value;
  staff_id_value := moasem.save_staff_instructor(null,teacher_id,null,'__test_teacher__','test-'||gen_random_uuid()||'@example.invalid','',array[program_id_value],true);
  insert into moasem.staff_accounts(name,email,role) values('__test_admin__','test-'||gen_random_uuid()||'@example.invalid','admin') returning id into admin_id_value;
  insert into moasem.guardians(name,phone,language) values('__test_guardian__','01000000000','en') returning id into guardian_id_value;
  insert into moasem.students(program_id,guardian_id,name,grade) values(program_id_value,guardian_id_value,'__test_pupil__',3) returning id into pupil_id;
  if (select is_under_14 from moasem.students where id=pupil_id) is not null then raise exception 'Age inferred for existing student'; end if;
  set local role service_role;
  rejected := false;
  begin perform moasem.update_student_consent_details(staff_id_value,pupil_id,false,'ko');
  exception when others then if sqlerrm<>'STAFF_ACCESS_DENIED' then raise; end if; rejected := true; end;
  if not rejected then raise exception 'Instructor can bypass guardian requirement'; end if;
  perform moasem.update_student_consent_details(admin_id_value,pupil_id,true,'en');
  if (select is_under_14 from moasem.students where id=pupil_id) is distinct from true then raise exception 'Age confirmation not saved'; end if;
  rejected := false;
  begin perform moasem.update_student_consent_details(admin_id_value,pupil_id,false,'fr');
  exception when others then if sqlerrm<>'INVALID_CONSENT' then raise; end if; rejected := true; end;
  if not rejected or (select is_under_14 from moasem.students where id=pupil_id) is distinct from true then raise exception 'Invalid language partly overwrote age'; end if;
  document_id_value := (moasem.publish_consent_document(admin_id_value,'English test only','{"ko":{"title":"시험 문구","body":"실제 동의 문구 아님"},"en":{"title":"Test only","body":"Not a real consent document"}}')->>'id')::uuid;
  result := moasem.create_guardian_consent_request(staff_id_value,pupil_id,document_id_value,repeat('f',64));
  request_id_value := (result->>'id')::uuid;
  result := moasem.access_guardian_consent(repeat('f',64));
  if result->>'language'<>'en' or result->'document'->'primary'->>'body'<>'Not a real consent document' then raise exception 'English consent not served'; end if;
  result := moasem.access_guardian_consent(repeat('f',64),jsonb_build_object('signer_name','Test guardian','language','en','document_id',document_id_value,'accepted',true,'is_legal_representative',true));
  if result->>'status'<>'accepted' or not exists(select 1 from moasem.guardian_consent_records where request_id=request_id_value and language='en') then raise exception 'English consent not recorded'; end if;
  -- Same native-language extension must reach the report snapshot, not only its picker.
  insert into moasem.wrong_types(code,name,grade,description_ko,description_en) values('test-'||gen_random_uuid(),'시험 유형',3,'한국어 설명','English explanation') returning id into wrong_type_id;
  report_token := (moasem.create_staff_learning_report(staff_id_value,pupil_id,'{"lesson_date":"2026-09-05","solved_count":10,"wrong_count":1,"language":"en"}',array[wrong_type_id])->>'token')::uuid;
  if not exists(select 1 from moasem.guardian_reports r join moasem.learning_logs l on l.id=r.learning_log_id where r.token=report_token and r.language='en' and l.resource_snapshot->'wrong_types'->0->>'description_en'='English explanation') then raise exception 'English report explanation lost'; end if;
  update moasem.wrong_types set description_en='Changed later' where id=wrong_type_id;
  if not exists(select 1 from moasem.guardian_reports r join moasem.learning_logs l on l.id=r.learning_log_id where r.token=report_token and l.resource_snapshot->'wrong_types'->0->>'description_en'='English explanation') then raise exception 'Saved English description drifted'; end if;
  reset role;
  if has_function_privilege('anon','moasem.update_student_consent_details(uuid,uuid,boolean,text)','EXECUTE') or has_function_privilege('authenticated','moasem.update_student_consent_details(uuid,uuid,boolean,text)','EXECUTE') then raise exception 'Public can alter age confirmation'; end if;
end;
$$;
rollback;
