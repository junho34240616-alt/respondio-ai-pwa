# Respondio Mobile App Shell Scaffold

이 폴더는 `사용자 직접 로그인 세션` 아키텍처를 실제 모바일 앱으로 옮길 때 바로 이어서 쓸 수 있는 스캐폴드입니다.

## 목적
- 사용자가 모바일 앱 안에서 배달의민족/쿠팡이츠/요기요에 직접 로그인한다.
- 로그인된 WebView 세션을 유지한 동안 리뷰 수집과 답변 등록을 수행한다.
- 플랫폼 계정 비밀번호를 Respondio 서버에 저장하지 않는다.

## 현재 포함된 파일
- `capacitor.config.json`
  - Capacitor 셸로 전환할 때 바로 시작할 수 있는 기본 설정 템플릿
- `www/index.html`, `www/app.js`, `www/styles.css`
  - 원격 `/mobile/session-center`를 실제 WebView/iframe처럼 감싸는 앱 호스트 프로토타입
- `www/platformLoginHeuristics.js`
  - 배민/쿠팡이츠/요기요 로그인 화면의 URL/타이틀/본문 신호를 바탕으로 성공/추가 인증/차단/만료를 판별하는 공통 규칙
- `src/contracts.js`
  - 플랫폼 메타 정보와 브리지 메시지 규격
- `src/sessionStateClient.js`
  - 웹앱 API와 통신하는 최소 클라이언트
- `src/nativeBridgeHost.js`
  - WebView 안의 `/mobile/session-center`와 네이티브 셸을 연결하는 호스트 로직
- `src/nativeSessionController.js`
  - 직접 로그인 시작, 성공/실패/만료 보고를 하나로 묶은 상위 컨트롤러
- `src/adapters/injectedBridgeScript.js`
  - React Native WebView, WebKit 등에 주입할 브리지 스크립트 생성기
- `src/adapters/platformPageSignalScript.js`
  - 플랫폼 로그인 WebView 안에서 URL/타이틀/본문 일부를 읽어 네이티브 셸로 전달하는 스크립트 생성기
- `src/example/webviewFlowExample.js`
  - 앱 셸에서 어떻게 조합해 쓸지 보여주는 예시
- `src/example/directLoginFlow.js`
  - 실제 직접 로그인 흐름을 어떤 객체 조합으로 묶을지 보여주는 예시
- `examples/react-native/RespondioSessionShell.js`
  - `react-native-webview` 기준의 실제 화면 예시. 원격 세션 센터를 열고 브리지 요청을 받으면 별도 로그인 WebView 모달을 띄우고, URL/본문 신호를 바탕으로 성공/실패/만료를 자동 판별한다.

## 이 스캐폴드가 기대하는 웹앱 API
- `GET /api/v1/platform_connections/:platform/mobile-session-config`
- `POST /api/v1/platform_connections/:platform/connect`
- `POST /api/v1/platform_connections/:platform/session-state`
- `GET /mobile/session-center`

## 추천 구현 순서
1. `www/index.html`을 로컬 앱 호스트로 사용
2. 호스트 안에서 원격 `/mobile/session-center`를 연다
3. 세션 센터가 부모/네이티브 셸에 `open_platform_login`을 보낸다
4. 네이티브 셸이 플랫폼 로그인 WebView를 열고 사용자가 직접 로그인한다
5. 로그인 WebView가 URL/본문 신호를 네이티브 셸에 보내고, 셸이 고신뢰 결과는 자동 처리한다
6. 필요하면 사용자가 수동으로 성공/실패/만료를 선택할 수 있다
7. 최종 결과를 세션 센터에 `postMessage`로 전달한다
8. 세션 센터가 자기 로그인 세션으로 `session-state` API를 호출한다

## 주의
- 이 폴더는 아직 배포 가능한 완성 앱이 아니라, "바로 구현을 이어갈 수 있는 코드 스캐폴드"입니다.
- 현재 웹앱에는 같은 흐름을 미리 확인할 수 있는 `/mobile/app-shell` 시뮬레이터가 이미 들어 있습니다.
- 브라우저 기반 `www/` 프로토타입은 크로스 도메인 제한 때문에 로그인 결과 자동 판별이 제한됩니다. 자동 판별은 실제 네이티브 WebView 예시에서 먼저 동작합니다.
