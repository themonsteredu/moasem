create table moasem.report_notification_attempts (
  id uuid primary key default gen_random_uuid(),
  report_id uuid not null references moasem.guardian_reports(id) on delete cascade,
  requested_by uuid references moasem.staff_accounts(id) on delete set null,
  recipient_phone text not null,
  status text not null default 'sending' check(status in ('sending','accepted','delivered','failed','unknown')),
  provider_message_id text,
  provider_group_id text,
  provider_status_code text,
  error_code text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index report_notification_attempts_report_time_idx on moasem.report_notification_attempts(report_id,created_at desc);
create index report_notification_attempts_staff_idx on moasem.report_notification_attempts(requested_by);
-- A completed, pending or uncertain send blocks new attempts for the same report.
create unique index report_notification_attempts_once_idx on moasem.report_notification_attempts(report_id) where status<>'failed';
alter table moasem.report_notification_attempts enable row level security;
revoke all on moasem.report_notification_attempts from public,anon,authenticated;
grant select,insert,update,delete on moasem.report_notification_attempts to service_role;
comment on table moasem.report_notification_attempts is 'MOAKIT 알림톡 발송 시도와 결과. 접수와 도착을 구분하며 결과 불명 시 자동 재발송 금지.';

create function moasem.claim_report_notification(p_staff_id uuid,p_report_token uuid,p_retry boolean default false)
returns jsonb language plpgsql security invoker set search_path='' as $$
declare
  staff moasem.staff_accounts;
  report moasem.guardian_reports;
  pupil moasem.students;
  attempt moasem.report_notification_attempts;
  phone text;
  attempt_count integer;
begin
  select * into staff from moasem.staff_accounts where id=p_staff_id and active for share;
  if not found then raise exception 'STAFF_ACCESS_DENIED'; end if;
  -- Serializes simultaneous clicks across browsers and server instances.
  select * into report from moasem.guardian_reports where token=p_report_token for update;
  if not found then raise exception 'REPORT_NOT_FOUND'; end if;
  select * into pupil from moasem.students where id=report.student_id for share;
  if not found then raise exception 'PROGRAM_ACCESS_DENIED'; end if;
  perform 1 from moasem.programs where id=pupil.program_id and (staff.role='admin' or instructor_id=staff.instructor_id) for share;
  if not found then raise exception 'PROGRAM_ACCESS_DENIED'; end if;
  if report.expires_at<=now() then raise exception 'REPORT_EXPIRED'; end if;
  if report.guardian_id is null or report.guardian_id is distinct from pupil.guardian_id then raise exception 'GUARDIAN_CHANGED'; end if;
  select g.phone into phone from moasem.guardians g where id=report.guardian_id for share;
  if phone is null or btrim(phone)!~ '^\+?[0-9 ()-]+$' then raise exception 'INVALID_PHONE'; end if;
  phone := regexp_replace(phone,'[^0-9]','','g');
  if phone like '821%' then phone := '0'||substring(phone from 3); end if;
  if phone!~ '^01[016789][0-9]{7,8}$' then raise exception 'INVALID_PHONE'; end if;

  select * into attempt from moasem.report_notification_attempts where report_id=report.id order by created_at desc limit 1 for update;
  if found then
    if attempt.status<>'failed' or not coalesce(p_retry,false) then return jsonb_build_object('claimed',false,'attempt',to_jsonb(attempt)); end if;
    select count(*) into attempt_count from moasem.report_notification_attempts where report_id=report.id;
    if attempt_count>=3 or attempt.created_at>now()-interval '1 minute' then raise exception 'RETRY_LIMIT'; end if;
  end if;
  insert into moasem.report_notification_attempts(report_id,requested_by,recipient_phone)
    values(report.id,staff.id,phone) returning * into attempt;
  return jsonb_build_object('claimed',true,'attempt',to_jsonb(attempt));
end;
$$;
revoke all on function moasem.claim_report_notification(uuid,uuid,boolean) from public,anon,authenticated;
grant execute on function moasem.claim_report_notification(uuid,uuid,boolean) to service_role;
