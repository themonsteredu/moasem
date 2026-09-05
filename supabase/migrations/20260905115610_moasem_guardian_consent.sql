-- Consent foundation only. No real legal copy or existing student status is changed.
create table moasem.consent_documents (
  id uuid primary key default gen_random_uuid(),
  label text not null check (length(btrim(label)) between 1 and 100),
  translations jsonb not null check (jsonb_typeof(translations)='object'),
  created_by uuid references moasem.staff_accounts(id) on delete set null,
  created_at timestamptz not null default now()
);
create index consent_documents_created_idx on moasem.consent_documents(created_at desc);
create index consent_documents_staff_idx on moasem.consent_documents(created_by);

create table moasem.guardian_consent_requests (
  id uuid primary key default gen_random_uuid(),
  student_id uuid references moasem.students(id) on delete set null,
  guardian_id uuid references moasem.guardians(id) on delete set null,
  program_id uuid references moasem.programs(id) on delete set null,
  document_id uuid not null references moasem.consent_documents(id),
  token_hash text not null unique check (token_hash ~ '^[0-9a-f]{64}$'),
  language text not null check (language in ('ko','vi','zh-CN')),
  document_snapshot jsonb not null,
  student_name text not null,
  program_name text not null,
  institution_name text not null,
  guardian_phone text not null,
  requested_by uuid references moasem.staff_accounts(id) on delete set null,
  created_at timestamptz not null default now(),
  expires_at timestamptz not null default now()+interval '7 days',
  revoked_at timestamptz,
  check (expires_at>created_at)
);
create index guardian_consent_requests_student_idx on moasem.guardian_consent_requests(student_id,created_at desc);
create index guardian_consent_requests_guardian_idx on moasem.guardian_consent_requests(guardian_id);
create index guardian_consent_requests_program_idx on moasem.guardian_consent_requests(program_id);
create index guardian_consent_requests_document_idx on moasem.guardian_consent_requests(document_id);
create index guardian_consent_requests_staff_idx on moasem.guardian_consent_requests(requested_by);
create unique index guardian_consent_requests_current_idx on moasem.guardian_consent_requests(student_id) where revoked_at is null;

create table moasem.guardian_consent_records (
  id uuid primary key default gen_random_uuid(),
  request_id uuid not null unique references moasem.guardian_consent_requests(id),
  language text not null check (language in ('ko','vi','zh-CN')),
  signer_name text not null check (length(btrim(signer_name)) between 1 and 100),
  accepted boolean not null check (accepted),
  is_legal_representative boolean not null check (is_legal_representative),
  verification_method text not null default 'link_self_declaration' check (verification_method='link_self_declaration'),
  consented_at timestamptz not null default now()
);
alter table moasem.consent_documents enable row level security;
alter table moasem.guardian_consent_requests enable row level security;
alter table moasem.guardian_consent_records enable row level security;
revoke all on moasem.consent_documents,moasem.guardian_consent_requests,moasem.guardian_consent_records from public,anon,authenticated,service_role;
grant select,insert on moasem.consent_documents,moasem.guardian_consent_requests,moasem.guardian_consent_records to service_role;
-- Row locks require an UPDATE privilege. Only revocation may be changed by the app.
grant update(revoked_at) on moasem.guardian_consent_requests to service_role;
comment on table moasem.guardian_consent_records is '동의 일시·언어·자기 확인 기록. 휴대전화 본인 인증 또는 법정대리인 자격 증명을 의미하지 않음.';

create function moasem.publish_consent_document(p_staff_id uuid,p_label text,p_translations jsonb)
returns jsonb language plpgsql security invoker set search_path='' as $$
declare entry record; document moasem.consent_documents;
begin
  perform 1 from moasem.staff_accounts where id=p_staff_id and active and role='admin' for share;
  if not found then raise exception 'STAFF_ACCESS_DENIED'; end if;
  if p_label is null or length(btrim(p_label)) not between 1 and 100
    or p_translations is null or jsonb_typeof(p_translations)<>'object' then raise exception 'INVALID_DOCUMENT'; end if;
  if not (p_translations ? 'ko') then raise exception 'KOREAN_REQUIRED'; end if;
  for entry in select * from jsonb_each(p_translations) loop
    if entry.key not in ('ko','vi','zh-CN') or jsonb_typeof(entry.value)<>'object'
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

create function moasem.create_guardian_consent_request(p_staff_id uuid,p_student_id uuid,p_document_id uuid,p_token_hash text)
returns jsonb language plpgsql security invoker set search_path='' as $$
declare staff moasem.staff_accounts; pupil moasem.students; guardian moasem.guardians;
  program moasem.programs; document moasem.consent_documents; request moasem.guardian_consent_requests;
  institution_label text;
begin
  select * into staff from moasem.staff_accounts where id=p_staff_id and active for share;
  if not found then raise exception 'STAFF_ACCESS_DENIED'; end if;
  select * into pupil from moasem.students where id=p_student_id for update;
  if not found then raise exception 'STUDENT_NOT_FOUND'; end if;
  select * into program from moasem.programs where id=pupil.program_id
    and (staff.role='admin' or (staff.role='instructor' and instructor_id=staff.instructor_id)) for share;
  if not found then raise exception 'PROGRAM_ACCESS_DENIED'; end if;
  if not pupil.active then raise exception 'STUDENT_INACTIVE'; end if;
  select * into guardian from moasem.guardians where id=pupil.guardian_id for share;
  if not found then raise exception 'GUARDIAN_REQUIRED'; end if;
  select * into document from moasem.consent_documents where id=p_document_id;
  if not found then raise exception 'DOCUMENT_NOT_FOUND'; end if;
  if not (document.translations ? guardian.language) then raise exception 'TRANSLATION_REQUIRED'; end if;
  if p_token_hash is null or p_token_hash !~ '^[0-9a-f]{64}$' then raise exception 'INVALID_TOKEN'; end if;
  select name into institution_label from moasem.institutions where id=program.institution_id;
  update moasem.guardian_consent_requests set revoked_at=now() where student_id=pupil.id and revoked_at is null;
  insert into moasem.guardian_consent_requests(student_id,guardian_id,program_id,document_id,token_hash,language,
    document_snapshot,student_name,program_name,institution_name,guardian_phone,requested_by)
  values(pupil.id,guardian.id,program.id,document.id,p_token_hash,guardian.language,
    jsonb_build_object('label',document.label,'primary',document.translations->guardian.language,'korean',document.translations->'ko'),
    pupil.name,program.name,institution_label,guardian.phone,staff.id) returning * into request;
  return jsonb_build_object('id',request.id,'language',request.language,'document_id',request.document_id,'expires_at',request.expires_at);
end;
$$;

-- Both reading and submission recheck the current student/guardian relationship.
-- The raw capability token never reaches the database; only its SHA-256 does.
create function moasem.access_guardian_consent(p_token_hash text,p_submission jsonb default null)
returns jsonb language plpgsql security invoker set search_path='' as $$
declare request moasem.guardian_consent_requests; pupil moasem.students; guardian moasem.guardians;
  receipt moasem.guardian_consent_records; pupil_id uuid;
begin
  if p_token_hash is null or p_token_hash !~ '^[0-9a-f]{64}$' then raise exception 'CONSENT_NOT_FOUND'; end if;
  select student_id into pupil_id from moasem.guardian_consent_requests where token_hash=p_token_hash;
  if not found or pupil_id is null then raise exception 'CONSENT_NOT_FOUND'; end if;
  -- Consistent lock order with issuance/revocation: student, program, guardian, request.
  select * into pupil from moasem.students where id=pupil_id for update;
  if not found or not pupil.active then raise exception 'CONSENT_UNAVAILABLE'; end if;
  perform 1 from moasem.programs where id=pupil.program_id for share;
  select * into guardian from moasem.guardians where id=pupil.guardian_id for share;
  if not found then raise exception 'CONSENT_UNAVAILABLE'; end if;
  select * into request from moasem.guardian_consent_requests where token_hash=p_token_hash for update;
  if request.revoked_at is not null or request.expires_at<=now()
    or request.guardian_id is distinct from pupil.guardian_id or request.program_id is distinct from pupil.program_id
    or request.guardian_phone is distinct from guardian.phone then raise exception 'CONSENT_UNAVAILABLE'; end if;
  select * into receipt from moasem.guardian_consent_records where request_id=request.id;
  if p_submission is not null then
    if jsonb_typeof(p_submission)<>'object'
      or p_submission->'accepted' is distinct from 'true'::jsonb
      or p_submission->'is_legal_representative' is distinct from 'true'::jsonb
      or jsonb_typeof(p_submission->'signer_name') is distinct from 'string'
      or length(btrim(p_submission->>'signer_name')) not between 1 and 100
      or p_submission->>'language' is distinct from request.language
      or p_submission->>'document_id' is distinct from request.document_id::text then raise exception 'INVALID_CONSENT'; end if;
    if receipt.id is not null and receipt.signer_name is distinct from btrim(p_submission->>'signer_name') then
      raise exception 'CONSENT_ALREADY_RECORDED';
    end if;
    if receipt.id is null then
      insert into moasem.guardian_consent_records(request_id,language,signer_name,accepted,is_legal_representative)
        values(request.id,request.language,btrim(p_submission->>'signer_name'),true,true) returning * into receipt;
    end if;
  end if;
  return jsonb_build_object('status',case when receipt.id is null then 'pending' else 'accepted' end,
    'student_name',request.student_name,'program_name',request.program_name,'institution_name',request.institution_name,
    'language',request.language,'document_id',request.document_id,'document',request.document_snapshot,
    'expires_at',request.expires_at,'consented_at',receipt.consented_at);
end;
$$;

create function moasem.revoke_guardian_consent_request(p_staff_id uuid,p_student_id uuid,p_request_id uuid)
returns void language plpgsql security invoker set search_path='' as $$
declare staff moasem.staff_accounts; pupil moasem.students;
begin
  select * into staff from moasem.staff_accounts where id=p_staff_id and active for share;
  if not found then raise exception 'STAFF_ACCESS_DENIED'; end if;
  select * into pupil from moasem.students where id=p_student_id for update;
  if not found then raise exception 'STUDENT_NOT_FOUND'; end if;
  perform 1 from moasem.programs where id=pupil.program_id
    and (staff.role='admin' or (staff.role='instructor' and instructor_id=staff.instructor_id)) for share;
  if not found then raise exception 'PROGRAM_ACCESS_DENIED'; end if;
  update moasem.guardian_consent_requests set revoked_at=coalesce(revoked_at,now()) where id=p_request_id and student_id=pupil.id;
  if not found then raise exception 'CONSENT_NOT_FOUND'; end if;
end;
$$;
revoke all on function moasem.publish_consent_document(uuid,text,jsonb),moasem.create_guardian_consent_request(uuid,uuid,uuid,text),
  moasem.access_guardian_consent(text,jsonb),moasem.revoke_guardian_consent_request(uuid,uuid,uuid) from public,anon,authenticated;
grant execute on function moasem.publish_consent_document(uuid,text,jsonb),moasem.create_guardian_consent_request(uuid,uuid,uuid,text),
  moasem.access_guardian_consent(text,jsonb),moasem.revoke_guardian_consent_request(uuid,uuid,uuid) to service_role;
