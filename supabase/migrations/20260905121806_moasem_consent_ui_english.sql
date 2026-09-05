alter table moasem.students add column is_under_14 boolean;
comment on column moasem.students.is_under_14 is '관리자가 확인한 만 14세 미만 여부. NULL은 확인 필요, 학년으로 추정하지 않음.';
alter table moasem.wrong_types add column description_en text;
alter table moasem.guardians drop constraint moasem_guardians_language_check;
alter table moasem.guardians add constraint moasem_guardians_language_check check (language in ('ko','en','vi','zh-CN'));
alter table moasem.guardian_reports drop constraint moasem_guardian_reports_language_check;
alter table moasem.guardian_reports add constraint moasem_guardian_reports_language_check check (language in ('ko','en','vi','zh-CN'));
alter table moasem.supplement_videos drop constraint moasem_supplement_videos_language_check;
alter table moasem.supplement_videos add constraint moasem_supplement_videos_language_check check (language in ('ko','en','vi','zh-CN'));
alter table moasem.guardian_consent_requests drop constraint guardian_consent_requests_language_check;
alter table moasem.guardian_consent_requests add constraint guardian_consent_requests_language_check check (language in ('ko','en','vi','zh-CN'));
alter table moasem.guardian_consent_records drop constraint guardian_consent_records_language_check;
alter table moasem.guardian_consent_records add constraint guardian_consent_records_language_check check (language in ('ko','en','vi','zh-CN'));

create or replace function moasem.publish_consent_document(p_staff_id uuid,p_label text,p_translations jsonb)
returns jsonb language plpgsql security invoker set search_path='' as $$
declare entry record; document moasem.consent_documents;
begin
  perform 1 from moasem.staff_accounts where id=p_staff_id and active and role='admin' for share;
  if not found then raise exception 'STAFF_ACCESS_DENIED'; end if;
  if p_label is null or length(btrim(p_label)) not between 1 and 100
    or p_translations is null or jsonb_typeof(p_translations)<>'object' then raise exception 'INVALID_DOCUMENT'; end if;
  if not (p_translations ? 'ko') then raise exception 'KOREAN_REQUIRED'; end if;
  for entry in select * from jsonb_each(p_translations) loop
    if entry.key not in ('ko','en','vi','zh-CN') or jsonb_typeof(entry.value)<>'object'
      or jsonb_typeof(entry.value->'title') is distinct from 'string'
      or jsonb_typeof(entry.value->'body') is distinct from 'string'
      or length(btrim(entry.value->>'title')) not between 1 and 200
      or length(btrim(entry.value->>'body')) not between 1 and 20000
      or entry.value - 'title' - 'body' <> '{}'::jsonb then raise exception 'INVALID_DOCUMENT'; end if;
  end loop;
  insert into moasem.consent_documents(label,translations,created_by)
    values(btrim(p_label),p_translations,p_staff_id) returning * into document;
  return to_jsonb(document)-'created_by';
end;
$$;


create or replace function moasem.create_staff_learning_report(p_staff_id uuid,p_student_id uuid,p_payload jsonb,p_wrong_type_ids uuid[] default '{}')
returns jsonb language plpgsql security invoker set search_path='' as $$
declare
  staff moasem.staff_accounts;
  pupil moasem.students;
  ids uuid[] := coalesce(p_wrong_type_ids,'{}'::uuid[]);
  selected_count integer;
  solved integer;
  wrong integer;
  lang text;
  lesson date;
  manual_url text := nullif(btrim(p_payload->>'video_url'),'');
  type_snapshot jsonb;
  video_snapshot jsonb;
  log_id uuid;
  report_token uuid;
  report_expiry timestamptz;
begin
  select * into staff from moasem.staff_accounts where id=p_staff_id and active for share;
  if not found then raise exception 'STAFF_ACCESS_DENIED'; end if;
  select * into pupil from moasem.students where id=p_student_id for share;
  if not found then raise exception 'STUDENT_NOT_FOUND'; end if;
  perform 1 from moasem.programs where id=pupil.program_id and (staff.role='admin' or instructor_id=staff.instructor_id) for share;
  if not found then raise exception 'PROGRAM_ACCESS_DENIED'; end if;

  solved := (p_payload->>'solved_count')::integer;
  wrong := (p_payload->>'wrong_count')::integer;
  lesson := (p_payload->>'lesson_date')::date;
  lang := p_payload->>'language';
  if solved is null or wrong is null or lesson is null or solved<0 or wrong<0 or wrong>solved or lang is null or lang not in ('ko','en','vi','zh-CN') then raise exception 'INVALID_REPORT'; end if;
  if cardinality(ids)>100 or array_position(ids,null) is not null then raise exception 'INVALID_WRONG_TYPES'; end if;
  if wrong=0 and cardinality(ids)>0 then raise exception 'WRONG_COUNT_REQUIRED'; end if;
  if manual_url is not null and (length(manual_url)>2048 or manual_url !~* '^https?://[^/@[:space:]]+(?:/|$)') then raise exception 'INVALID_VIDEO_URL'; end if;

  -- Read once into the snapshot so catalog edits cannot change this report later.
  with selected as (
    select wt.*, requested.ord
    from unnest(ids) with ordinality requested(id,ord)
    join moasem.wrong_types wt on wt.id=requested.id and wt.active
  )
  select count(*), coalesce(jsonb_agg(jsonb_build_object(
    'id',id,'name',name,'description_ko',description_ko,'description_en',description_en,'description_vi',description_vi,'description_zh_cn',description_zh_cn
  ) order by ord),'[]'::jsonb) into selected_count,type_snapshot from selected;
  if selected_count<>cardinality(ids) or selected_count<>(select count(distinct id) from unnest(ids) as selected(id)) then raise exception 'INVALID_WRONG_TYPES'; end if;

  with candidates as (
    select v.id,v.title,btrim(v.url) as url,v.language,requested.ord,
      row_number() over(partition by btrim(v.url) order by requested.ord,v.id) as occurrence
    from unnest(ids) with ordinality requested(id,ord)
    join moasem.wrong_type_videos link on link.wrong_type_id=requested.id and link.is_primary
    join moasem.supplement_videos v on v.id=link.video_id and v.active and v.visibility in ('public','unlisted')
    where btrim(v.url) ~* '^https?://[^/@[:space:]]+(?:/|$)'
  )
  select coalesce(jsonb_agg(jsonb_build_object('id',id,'title',title,'url',url,'language',language) order by ord),'[]'::jsonb)
    into video_snapshot from candidates where occurrence=1;
  if manual_url is not null and not exists(select 1 from jsonb_array_elements(video_snapshot) video where video->>'url'=manual_url) then
    video_snapshot := video_snapshot || jsonb_build_array(jsonb_build_object('id',null,'title','','url',manual_url,'language','ko'));
  end if;

  insert into moasem.learning_logs(student_id,program_id,lesson_date,solved_count,wrong_count,wrong_type_summary,weekly_assignment,video_url,teacher_note,resource_snapshot)
  values(pupil.id,pupil.program_id,lesson,solved,wrong,nullif(btrim(p_payload->>'wrong_type_summary'),''),nullif(btrim(p_payload->>'weekly_assignment'),''),
    video_snapshot->0->>'url',nullif(btrim(p_payload->>'teacher_note'),''),jsonb_build_object('version',1,'wrong_types',type_snapshot,'videos',video_snapshot)) returning id into log_id;
  insert into moasem.learning_log_wrong_types(learning_log_id,wrong_type_id,display_order)
  select log_id,id,(ord-1)::smallint from unnest(ids) with ordinality selected(id,ord);
  insert into moasem.guardian_reports(student_id,guardian_id,learning_log_id,language,headline,action_line)
  values(pupil.id,pupil.guardian_id,log_id,lang,nullif(btrim(p_payload->>'headline'),''),nullif(btrim(p_payload->>'action_line'),''))
  returning token,expires_at into report_token,report_expiry;
  return jsonb_build_object('token',report_token,'expires_at',report_expiry);
end;
$$;
revoke all on function moasem.create_staff_learning_report(uuid,uuid,jsonb,uuid[]) from public,anon,authenticated;
grant execute on function moasem.create_staff_learning_report(uuid,uuid,jsonb,uuid[]) to service_role;

create function moasem.update_student_consent_details(p_staff_id uuid,p_student_id uuid,p_is_under_14 boolean,p_language text)
returns void language plpgsql security invoker set search_path='' as $$
declare pupil moasem.students;
begin
  perform 1 from moasem.staff_accounts where id=p_staff_id and active and role='admin' for share;
  if not found then raise exception 'STAFF_ACCESS_DENIED'; end if;
  if p_language is null or p_language not in ('ko','en','vi','zh-CN') then raise exception 'INVALID_CONSENT'; end if;
  select * into pupil from moasem.students where id=p_student_id for update;
  if not found then raise exception 'STUDENT_NOT_FOUND'; end if;
  perform 1 from moasem.guardians where id=pupil.guardian_id for update;
  if not found then raise exception 'GUARDIAN_REQUIRED'; end if;
  update moasem.students set is_under_14=p_is_under_14,updated_at=now() where id=pupil.id;
  update moasem.guardians set language=p_language,updated_at=now() where id=pupil.guardian_id;
end;
$$;
revoke all on function moasem.update_student_consent_details(uuid,uuid,boolean,text) from public,anon,authenticated;
grant execute on function moasem.update_student_consent_details(uuid,uuid,boolean,text) to service_role;
