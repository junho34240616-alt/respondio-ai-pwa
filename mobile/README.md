# Mobile Wrapper Plan

이 폴더는 `사용자 직접 로그인 세션`을 위한 모바일 앱/WebView 래퍼 자리를 예약한다.

## 목적
- 사용자가 모바일에서 배민/쿠팡이츠/요기요에 직접 로그인한다.
- 로그인된 같은 WebView 세션으로 리뷰 수집/답변 등록을 수행한다.
- 웹앱은 세션 상태와 AI/데이터 관리만 담당한다.

## 현재 구현된 웹앱 연동 포인트
- 모바일 세션 허브 화면: `/mobile/session-center`
- 모바일 앱 셸 시뮬레이터: `/mobile/app-shell`
- 연결 방식 전환: `POST /api/v1/platform_connections/:platform/auth-mode`
- 직접 로그인 세션 준비: `POST /api/v1/platform_connections/:platform/connect` with `auth_mode=direct_session`
- 모바일 셸용 설정 조회: `GET /api/v1/platform_connections/:platform/mobile-session-config`
- 세션 상태 보고: `POST /api/v1/platform_connections/:platform/session-state`

## 새 스캐폴드 위치
- 실제 앱 셸 출발점: `mobile/app-shell/`
- Expo 기반 React Native 시작점: `mobile/react-native-shell/`
- `mobile/app-shell/`은 공유 스캐폴드이고, `mobile/react-native-shell/`은 그 스캐폴드를 실제 앱으로 감싸는 첫 실행 골격이다.

## 네이티브 브리지 계약
모바일 앱은 WebView 안에서 아래 메시지를 받을 수 있어야 한다.

```json
{
  "type": "open_platform_login",
  "platform": "baemin",
  "platformStoreId": "optional-store-id",
  "loginUrl": "https://self.baemin.com/login",
  "reviewUrl": "https://self.baemin.com/reviews",
  "callbackPath": "/api/v1/platform_connections/baemin/session-state"
}
```

## 다음 구현 순서
1. `mobile/react-native-shell/`에서 Expo 앱 실행
2. 앱 안의 세션 센터 WebView에서 Respondio 로그인
3. `open_platform_login` 메시지 수신 후 플랫폼 로그인 WebView 모달 열기
4. URL/본문 신호로 성공/추가 인증/차단을 자동 판별
5. 최종 세션 결과를 세션 센터에 `postMessage`
6. 세션 센터가 `session-state`를 갱신하고, 이후 수집/등록은 그 세션으로 진행
