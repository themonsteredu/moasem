-- Existing reports keep their original text and single video. New reports snapshot their resources.
alter table moasem.learning_logs add column resource_snapshot jsonb;
comment on column moasem.learning_logs.resource_snapshot is '리포트 작성 시점의 선택 오답 유형 설명과 자동 연결 영상. 이후 기준표 수정으로 기존 리포트를 바꾸지 않는다.';

create function moasem.create_staff_learning_report(p_staff_id uuid,p_student_id uuid,p_payload jsonb,p_wrong_type_ids uuid[] default '{}')
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
  if solved is null or wrong is null or lesson is null or solved<0 or wrong<0 or wrong>solved or lang is null or lang not in ('ko','vi','zh-CN') then raise exception 'INVALID_REPORT'; end if;
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
    'id',id,'name',name,'description_ko',description_ko,'description_vi',description_vi,'description_zh_cn',description_zh_cn
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
