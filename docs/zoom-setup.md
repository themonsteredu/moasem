# Zoom 연결 준비

현재 구현: 프로그램별 Zoom 요일·회의 번호·암호 저장. 앱 안 수업, 호스트 인증, 화상 출석 기록은 아직 미구현.

## 먼저 준비할 화면 (Zoom 공식 문서 확인 2026-09-06 한국시간)

1. https://marketplace.zoom.us 에 수업을 운영할 Zoom 계정으로 로그인.
2. 왼쪽 아래 Developer → Created apps → Develop → Build an app.
3. General app → Create. 이름을 MOASEM으로 입력.
4. Features → Embed → Meeting SDK를 켠다.
5. Basic Information의 App Credentials에서 Client ID/Client Secret 위치를 확인한다. 개발용과 운영용이 다르므로 구분한다.
6. 호스트 인증을 위해 계정 운영 방식에 맞는 OAuth 설정과 ZAK 권한을 추가해야 한다. 실제 계정 구조 확인 후 최소 권한으로 결정한다. 아직 없는 콜백 주소를 동작한다고 안내하지 않는다.
7. Client Secret은 채팅이나 저장소에 넣지 않고 Vercel의 서버 환경변수로 등록한다. 변수명은 구현 시 ZOOM_CLIENT_ID / ZOOM_CLIENT_SECRET을 사용한다.

확인할 운영 사항: 강사들이 원장님의 동일 Zoom 조직 계정 소속인지, 각각 별도 계정인지. 별도 외부 계정 회의 참여는 Zoom 앱 심사 및 추가 인증 조건이 적용되므로 단순 SDK 서명만으로 구현 완료라고 할 수 없다.

## 수업 화면 제안

- PC 강사: 프로그램 선택 → 수업 시작, 담당 회의만 호스트 인증(ZAK)으로 입장.
- 학생: 학생 입장 인증 → 수업 입장 → 이름 자동 설정. 회의 번호/암호 직접 입력 없음.
- PC에서는 component view, 모바일/태블릿은 client view를 우선 검토. Zoom 공식 문서는 component view를 desktop 전용으로 안내한다. 실제 기기별 마이크·카메라·입장 시험 필요.
- 항상 ‘줌 앱으로 열기’ 제공. 앱 이동을 실제 출석으로 기록하지 않는다.
- 출석은 실제 입장·퇴장 확인을 근거로 기록한다. 브라우저 종료·재접속·Zoom 앱 입장은 서버 이벤트와 대조해야 한다. 버튼 클릭을 출석으로 취급하지 않는다.
- 녹화·녹음은 별도 요청/고지 없이 구현하지 않는다.

출처:
https://developers.zoom.us/docs/build-flow/quick-start-guide/
https://developers.zoom.us/docs/meeting-sdk/get-credentials/
https://developers.zoom.us/docs/meeting-sdk/auth/
https://developers.zoom.us/docs/meeting-sdk/web/component-view/
