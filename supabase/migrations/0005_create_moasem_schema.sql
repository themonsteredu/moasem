-- MOASEM 전용 스키마 생성
-- public 스키마의 다른 앱 테이블(109개)에는 일절 영향을 주지 않는다.

create schema if not exists moasem;

comment on schema moasem is 'MOASEM 기관 위탁형 초등 수학 학습관리 전용 스키마';

-- 현재는 서버(service_role)만 데이터에 접근한다.
-- anon/authenticated 에는 스키마 진입만 허용하고 테이블 권한은 주지 않는다.
-- 역할별 RLS 정책은 후속 단계(3단계)에서 추가한다.
grant usage on schema moasem to service_role;
grant usage on schema moasem to anon, authenticated;

-- 앞으로 moasem 스키마에 추가되는 객체도 기본적으로 service_role 전용이 되게 한다.
alter default privileges in schema moasem grant all on tables to service_role;
alter default privileges in schema moasem grant all on sequences to service_role;
alter default privileges in schema moasem grant all on functions to service_role;
