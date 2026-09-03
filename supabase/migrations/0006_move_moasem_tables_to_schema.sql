-- public 스키마의 moasem_ 테이블 12개를 moasem 스키마로 이동하고 접두어를 제거한다.
--
-- 안전 설계:
--  * 데이터 0건 상태에서 수행한다.
--  * 복사 후 삭제가 아니라 이동(set schema)이므로 public 에 잔여 테이블이 남지 않으며
--    drop 문을 단 한 줄도 사용하지 않는다.
--  * moasem_ 접두어가 없는 기존 앱 테이블(109개)은 이 파일에 이름조차 등장하지 않는다.
--  * 인덱스/제약/기본값/외래키/RLS 설정은 테이블과 함께 그대로 따라온다.

alter table public.moasem_institutions             set schema moasem;
alter table public.moasem_instructors              set schema moasem;
alter table public.moasem_programs                 set schema moasem;
alter table public.moasem_guardians                set schema moasem;
alter table public.moasem_students                 set schema moasem;
alter table public.moasem_attendance               set schema moasem;
alter table public.moasem_learning_logs            set schema moasem;
alter table public.moasem_guardian_reports         set schema moasem;
alter table public.moasem_wrong_types              set schema moasem;
alter table public.moasem_supplement_videos        set schema moasem;
alter table public.moasem_wrong_type_videos        set schema moasem;
alter table public.moasem_learning_log_wrong_types set schema moasem;

alter table moasem.moasem_institutions             rename to institutions;
alter table moasem.moasem_instructors              rename to instructors;
alter table moasem.moasem_programs                 rename to programs;
alter table moasem.moasem_guardians                rename to guardians;
alter table moasem.moasem_students                 rename to students;
alter table moasem.moasem_attendance               rename to attendance;
alter table moasem.moasem_learning_logs            rename to learning_logs;
alter table moasem.moasem_guardian_reports         rename to guardian_reports;
alter table moasem.moasem_wrong_types              rename to wrong_types;
alter table moasem.moasem_supplement_videos        rename to supplement_videos;
alter table moasem.moasem_wrong_type_videos        rename to wrong_type_videos;
alter table moasem.moasem_learning_log_wrong_types rename to learning_log_wrong_types;

-- 이동한 12개 테이블의 권한을 일관되게 정리한다.
-- (RLS 는 이미 켜져 있고 테이블과 함께 이동한다.)
revoke all on all tables in schema moasem from anon, authenticated;
grant select, insert, update, delete on all tables in schema moasem to service_role;
