# public 스키마 RLS 미적용 테이블 점검 보고서

- 대상: Supabase 프로젝트 `aiapp` (`vypnobpmyadtcvxhtagn`, ap-northeast-2)
- 대상 스키마: `public`
- 조사일: 2026-09-12
- 작성: 모아셈(MOASEM) 작업 중 발견. **모아셈은 `moasem` 스키마를 쓰므로 이 문서의 표들과 무관하다.**

## 이 문서의 성격

`public` 스키마에서 **RLS(Row Level Security)가 꺼진 테이블 29개**를 정리했다.
조사 과정에서 **설정을 변경하지 않았다.** RLS 를 켜지도, 정책을 넣지도 않았다.

> **읽는 분께**: 아래 SQL 은 제안이며 **아직 실행하지 않았다.** 정책 없이 RLS 를 켜면
> 해당 테이블을 쓰는 앱이 즉시 전면 장애가 난다. 반드시 "적용 절차" 절을 먼저 읽어야 한다.

어떤 앱이 쓰는지는 **테이블명과 컬럼 구성으로 추정**했다. 추정임을 명시했고,
실제 소유 앱은 각 앱 저장소의 쿼리를 확인해 확정해야 한다.

---

## 1. 무엇이 문제인가

RLS 가 꺼진 테이블은 **`anon` / `authenticated` 역할에 그대로 열려 있다.**
즉 **프로젝트의 anon 키만 있으면 누구나 모든 행을 읽고 쓰고 지울 수 있다.**

anon 키는 브라우저에 내려가는 공개 값이다. 숨길 수 있는 비밀이 아니다.
웹앱을 한 번이라도 배포했다면 개발자 도구에서 그대로 보인다.

---

## 2. 위험도 우선순위

### 🔴 즉시 조치 (인증 우회·자격증명 유출)

| 표 | 건수 | 왜 위험한가 |
|---|---|---|
| `users` | 6 | `password_hash`, `totp_secret`, `role` 보관. **비밀번호 해시와 2단계 인증 비밀키가 그대로 읽힌다.** 해시 오프라인 크래킹, TOTP 코드 생성이 가능하다. 쓰기도 열려 있어 `role` 을 `admin` 으로 바꾸는 권한 상승도 가능하다. |
| `sessions` | 1 | `token`, `user_id`, `expires_at`. **유효한 세션 토큰을 읽어 로그인 상태를 그대로 가로챌 수 있다.** 임의 토큰을 직접 넣어 아무 계정으로 로그인하는 것도 가능하다. |
| `agreements` | 3 | `signed_name`, `ip`, `user_id`. 실명과 IP — 개인정보. 동의 기록 위조·삭제도 가능하다. |
| `audit_logs` | 581 | `username`, `ip`, `ua`, `action`. 접속 이력 전체가 노출된다. 쓰기가 열려 있어 **침입 흔적을 지울 수 있다.** 감사 로그가 감사 기능을 못 한다. |

### 🟠 개인정보·학생 데이터

| 표 | 건수 | 내용 |
|---|---|---|
| `project_members` | 1 | `team_id`, `anonymous_no`, `team_role` — 학생 팀 배정 |
| `project_teams` | 12 | `team_name`, `team_code` — **팀 코드가 입장 수단이면 코드 목록 전체가 유출된다** |
| `projects` | 2 | `school_label`, `class_label`, `mission`, `retention_until` — 학교·학급 식별 정보 |
| `session_progress` | 72 | `draft_data`, `confirmed_data` — 학생 활동 산출물 |
| `assessment_results` | 1 | `answers`, `score`, `phase` — 학생 평가 결과 |
| `career_reflections` | 0 | 학생 자기성찰 서술 (지금 0건이나 성격상 민감) |
| `user_test_feedback` | 0 | 테스터 의견 |

### 🟡 운영·과금

| 표 | 건수 | 내용 |
|---|---|---|
| `settings` | 16 | `key`/`value` 전역 설정. **운영 설정을 임의 변경할 수 있다.** 값에 비밀이 들어있다면 즉시 🔴 로 올려야 한다 — 내용 확인 필요. |
| `usage_events` | 1 | 호출량 집계. 위조 시 과금·정산이 틀어진다 |
| `settlements` | 0 | `invoice_amount`, `confirmed` — 정산 금액. 위조 위험 |
| `app_configs` | 12 | 팀별 앱 설정 |
| `app_versions` | 0 | 배포 버전 |
| `published_apps` | 0 | `slug`, `active` — 공개 여부를 임의로 켤 수 있다 |

### 🟢 콘텐츠 (유출보다 위조·삭제가 문제)

| 표 | 건수 | 내용 |
|---|---|---|
| `assets` | 164 | `mime`, `data`, `storage_path` — 수업 자산. `data` 에 본문이 들어있으면 대량 유출 |
| `slides` | 135 | 슬라이드 본문 |
| `decks` | 23 | `published`, `access_start/end`, `unit_cost` — **비공개 자료를 공개로 바꿀 수 있다** |
| `class_sessions` | 11 | `code`, `active`, `expires_at` — **수업 입장 코드 목록 유출, 임의 활성화 가능** |
| `session_items` | 15 | `student_visible`, `unlocked` — **잠긴 자료를 열 수 있다** |
| `schedules` | 5 | 시간표 |
| `courses` | 2 | 과정 |
| `course_items` | 4 | 과정-자료 연결 |
| `course_instructors` | 1 | 강사 배정 |
| `course_opt_ins` | 0 | 강사 선택 |
| `resource_datasets` | 1 | 자료 데이터셋 |
| `resource_items` | 12 | `official_name`, `verification_status`, `operator_memo` |

---

## 3. 표별 정리 — 어떤 앱이 쓰는지 / 누가 읽고 써야 하는지

추정 근거는 컬럼 구성이다. **확정 전 각 앱 저장소에서 실제 쿼리를 확인해야 한다.**

### 그룹 A — 수업 자료·계정 플랫폼 (17개)

`users`·`sessions`·`password_hash` 구조로 보아 **Supabase Auth 를 쓰지 않고 자체 로그인**을 구현한
앱이다. 따라서 `auth.uid()` 기반 정책을 쓸 수 없다. 이 점이 정책 설계의 핵심 제약이다.

| 표 | 쓰는 앱(추정) | 읽어야 하는 주체 | 써야 하는 주체 |
|---|---|---|---|
| `users` | 계정 관리 | 서버만 | 서버만 |
| `sessions` | 로그인 세션 | 서버만 | 서버만 |
| `agreements` | 약관 동의 | 서버, 본인 | 서버 |
| `audit_logs` | 감사 로그 | 서버, 관리자 | **서버만 (append only)** |
| `settings` | 전역 설정 | 서버 | 관리자 |
| `decks` | 수업 자료 | 서버, 권한 있는 강사·학생 | 작성자·관리자 |
| `slides` | 수업 자료 | 상위 deck 접근 권한자 | 작성자·관리자 |
| `assets` | 수업 자산 | 상위 deck 접근 권한자 | 작성자·관리자 |
| `schedules` | 시간표 | 서버, 강사 | 관리자 |
| `class_sessions` | 실시간 수업 | 서버, 해당 수업 참여자 | 강사·관리자 |
| `session_items` | 수업 진행 | 해당 수업 참여자 | 강사 |
| `courses` | 과정 | 서버, 강사 | 관리자 |
| `course_items` | 과정 구성 | 서버, 강사 | 관리자 |
| `course_instructors` | 강사 배정 | 서버, 본인 | 관리자 |
| `course_opt_ins` | 강사 선택 | 서버, 본인 | 본인·관리자 |
| `usage_events` | 사용량 | 서버, 관리자 | **서버만** |
| `settlements` | 정산 | 관리자만 | 관리자만 |

### 그룹 B — 팀 프로젝트 앱 (12개)

`team_id` + `anonymous_no` 구조. 학생이 익명 번호로 참여하는 형태로 보인다.
개별 로그인이 없다면 역시 `auth.uid()` 를 쓸 수 없고, **서버가 팀 세션을 검증**하는 구조여야 한다.

| 표 | 쓰는 앱(추정) | 읽어야 하는 주체 | 써야 하는 주체 |
|---|---|---|---|
| `projects` | 팀 프로젝트 | 서버, 해당 학급 | 교사·관리자 |
| `project_teams` | 팀 | 서버, 같은 프로젝트 참여자 | 교사 |
| `project_members` | 팀원 | 서버, 같은 팀 | 서버 |
| `session_progress` | 활동 산출물 | **같은 팀만** | 같은 팀 |
| `app_configs` | 팀 앱 설정 | 같은 팀 | 같은 팀 |
| `app_versions` | 버전 | 같은 팀 | 같은 팀 |
| `published_apps` | 공개 앱 | 공개 가능 | **같은 팀·관리자만** |
| `assessment_results` | 평가 결과 | **본인·교사만** | 본인(1회)·교사 |
| `career_reflections` | 자기성찰 | **본인·교사만** | 본인 |
| `user_test_feedback` | 테스터 의견 | 관리자 | 누구나 쓰기(비로그인 수집 시) |
| `resource_datasets` | 자료셋 | 서버, 참여자 | 관리자 |
| `resource_items` | 자료 항목 | 서버, 참여자 | 관리자 |

---

## 4. 권장 정책 — ⚠️ 실행하지 않았음

### 핵심 판단

이 앱들이 **서버에서 `service_role` 키로만 DB에 접근**한다면,
`service_role` 은 RLS 를 통과하므로 **정책 없이 RLS 만 켜도 앱이 정상 동작하고 구멍은 즉시 닫힌다.**
이것이 가장 빠르고 안전한 경로다.

반대로 **브라우저에서 anon 키로 직접 접근하는 화면이 하나라도 있으면** 그 화면은 즉시 깨진다.

따라서 첫 번째로 확인할 것은 딱 하나다:

> **각 테이블을 브라우저가 직접 건드리는가, 아니면 서버만 건드리는가?**

각 앱 저장소에서 `createClient(` 호출에 어떤 키가 쓰이는지 확인하면 갈린다.
`anon` / `publishable` 키를 쓰는 클라이언트 코드가 해당 테이블을 `.from()` 하고 있는지 보면 된다.

### 1단계 — 서버 전용 테이블 (브라우저가 안 건드리는 것)

정책 없이 RLS 만 켜고, 브라우저 역할의 권한을 회수한다.
**🔴 4개는 확실히 서버 전용이어야 하므로 여기서 시작하기를 권한다.**

```sql
-- ⚠️ 아직 실행하지 마십시오. 브라우저가 직접 접근하지 않음을 확인한 뒤 적용.
alter table public.users       enable row level security;
alter table public.sessions    enable row level security;
alter table public.agreements  enable row level security;
alter table public.audit_logs  enable row level security;

revoke all on public.users, public.sessions, public.agreements, public.audit_logs
  from anon, authenticated;

grant select, insert, update, delete
  on public.users, public.sessions, public.agreements, public.audit_logs
  to service_role;
```

### 2단계 — 브라우저가 읽는 테이블

테이블마다 "누가 어느 행을 볼 수 있는가"를 정해 정책을 만든다.
자체 로그인(`users`/`sessions`)을 쓰므로 `auth.uid()` 는 쓸 수 없다. 두 가지 방향이 있다.

**방향 1 (권장) — 서버 경유로 전환**
브라우저가 DB를 직접 보지 않게 하고, 서버 API 를 거치게 바꾼다.
그러면 모든 테이블을 1단계 방식으로 닫을 수 있다. 코드 변경은 있으나 가장 단순하고 안전하다.

**방향 2 — 세션 컨텍스트 기반 정책**
서버가 요청마다 세션을 검증해 `set_config('app.user_id', ...)` 등으로 컨텍스트를 심고,
정책이 그 값을 읽게 한다. 예시:

```sql
-- ⚠️ 제안. 실행하지 않았음.
create or replace function public.current_app_user_id()
returns uuid language sql stable as $$
  select nullif(current_setting('app.user_id', true), '')::uuid
$$;

alter table public.assessment_results enable row level security;

create policy assessment_results_own_read on public.assessment_results
  for select to authenticated
  using (team_id in (
    select team_id from public.project_members
    where anonymous_no = current_setting('app.anonymous_no', true)::int
  ));
```

> 이 방식은 연결 풀링 환경에서 컨텍스트 누출에 주의해야 한다. 트랜잭션 단위로
> `set_local` 을 쓰고, 요청 종료 시 초기화되는지 반드시 검증할 것.

### 3단계 — 감사 로그는 추가 전용으로

```sql
-- ⚠️ 제안. 실행하지 않았음.
revoke update, delete on public.audit_logs from anon, authenticated, service_role;
grant insert, select on public.audit_logs to service_role;
```

---

## 5. 적용 절차 권고

1. **테이블별로 브라우저 직접 접근 여부를 먼저 확정한다.** 이것 없이 켜면 장애가 난다.
2. **Supabase 브랜치나 복제 프로젝트에서 먼저 적용해 본다.** 운영에 바로 넣지 않는다.
3. **🔴 4개(`users`, `sessions`, `agreements`, `audit_logs`)부터 한 번에 하나씩** 적용하고 매번 앱을 확인한다.
4. 각 단계는 **되돌릴 수 있게** 준비한다 (`alter table ... disable row level security`).
5. 적용 후 Supabase Advisor 의 `rls_disabled` 경고가 줄어드는지 확인한다.

### 별도로 즉시 검토할 것

- `users.password_hash` 의 해시 알고리즘이 무엇인지 확인. 이미 노출된 것으로 간주하고
  **전체 비밀번호 재설정**을 검토해야 한다.
- `users.totp_secret` 도 노출된 것으로 간주하고 **2단계 인증 재등록**을 검토해야 한다.
- `sessions` 의 기존 토큰은 **전부 무효화**하는 것이 안전하다.
- `settings` 의 16개 값에 API 키·비밀번호가 들어있는지 확인. 있으면 즉시 교체.
- anon 키 자체를 교체(rotate)할지 검토. 단, 교체하면 배포된 모든 앱을 같이 갱신해야 한다.

> 위 항목은 "실제로 유출되었다"는 증거가 아니라, **유출이 가능한 상태였다**는 뜻이다.
> 접근 로그로 실제 조회 여부를 확인할 수 있는지도 함께 점검하기를 권한다.
