# Mobile Direct Login Architecture

## Goal
- `배달의민족`, `쿠팡이츠`, `요기요`를 모두 `사용자 직접 로그인 세션` 방식으로 전환한다.
- 사용자는 모바일 앱/WebView 안에서 직접 플랫폼에 로그인한다.
- 로그인한 동안에만 리뷰 수집, 답변 등록, 세션 검증 기능을 사용한다.
- 플랫폼 이메일/비밀번호를 서버에 영구 저장하지 않는 방향으로 간다.

## Why We Are Switching
- 서버가 대신 로그인하는 구조는 `배민/쿠팡이츠`에서 추가 인증, CAPTCHA, 데이터센터 IP 차단에 자주 막힌다.
- 모바일 브라우저에서 로그인한 세션을 PWA가 직접 읽어 서버로 넘기는 것은 웹 보안 정책상 안정적으로 불가능하다.
- 따라서 `모바일 앱 안의 WebView 세션`을 제품의 1급 연결 방식으로 가져가야 한다.

## Target Flow
1. 사용자가 모바일 앱에서 `플랫폼 연결` 화면을 연다.
2. 플랫폼별 `직접 로그인` 버튼을 누른다.
3. 앱 내부 WebView가 해당 플랫폼 로그인 페이지를 연다.
4. 사용자가 직접 로그인하고, 필요하면 OTP/CAPTCHA도 직접 해결한다.
5. 앱은 같은 WebView 세션으로 리뷰 페이지 접근 가능 여부를 검증한다.
6. 검증에 성공하면 앱은 백엔드에 `session_state=connected`를 보고한다.
7. 사용자가 서비스를 쓰는 동안 리뷰 수집/답변 등록은 해당 세션으로 처리한다.
8. 앱 종료/로그아웃/세션 만료 시 `session_state=inactive|expired`로 갱신한다.

## Current Foundation Added
- `store_platform_connections`에 아래 상태를 저장할 수 있도록 확장했다.
  - `auth_mode`
  - `session_status`
  - `session_connected_at`
  - `session_last_validated_at`
- API가 `credentials`와 `direct_session` 두 연결 방식을 모두 이해한다.
- 모바일 셸이 하드코딩 없이 사용할 수 있도록 `mobile-session-config` API를 추가했다.
- 리뷰 수집은 `direct_session` 모드일 때 서버 재로그인을 시도하지 않고 현재 세션 활성 여부를 먼저 확인한다.
- 크롤러 세션은 더 이상 플랫폼 전역 1개가 아니라 `platform + store_id` 단위로 분리된다.
- 웹앱에는 `/mobile/app-shell` 시뮬레이터가 있고, `mobile/app-shell/` 폴더에는 실제 네이티브 셸로 옮길 스캐폴드가 있다.

## Current Limits
- 아직 모바일 앱/WebView 자체는 구현되지 않았다.
- 현재 웹앱의 `직접 로그인 세션` 버튼은 방향 전환용 토대만 준비한다.
- 세션 생성/검증의 실제 UX는 모바일 앱 또는 앱 래퍼 구현이 필요하다.

## Next Implementation Steps
1. `mobile/` 앱 셸 추가
   - Capacitor 또는 React Native 중 하나 선택
2. 플랫폼별 WebView 로그인 화면 구현
3. 로그인 성공 후 세션 검증 API 호출
4. 리뷰 수집/답변 등록 요청에 세션 상태 반영
5. 세션 만료/로그아웃 UX 추가
6. 레거시 이메일+비밀번호 연결 UI 제거

## Recommended Build Order
1. `요기요`를 직접 로그인 세션 방식으로 먼저 재구현
2. `배달의민족` WebView 로그인 붙이기
3. `쿠팡이츠` WebView 로그인 붙이기
4. 세 플랫폼 공통 세션 만료/재로그인 UX 정리
