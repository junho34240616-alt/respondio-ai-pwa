# Respondio React Native Shell

이 폴더는 `mobile/app-shell/` 스캐폴드를 실제 모바일 앱으로 감싸기 위한 **Expo 기반 React Native 시작점**입니다.

## 왜 React Native로 먼저 가나
- 현재 요구사항은 `플랫폼 직접 로그인`을 별도 WebView로 띄우고, 그 결과를 다시 세션 센터 WebView로 돌려보내는 구조입니다.
- 이 흐름은 `react-native-webview`에서 별도 로그인 WebView 모달을 다루는 쪽이 자연스럽습니다.
- 브라우저 기반 프로토타입은 크로스 도메인 제한 때문에 자동 판별이 어려운데, 네이티브 WebView는 URL/본문 신호를 직접 받을 수 있습니다.

## 포함된 파일
- `App.js`
  - 실제 앱 루트. `RespondioSessionShell`을 그대로 마운트합니다.
- `app.json`
  - Expo 앱 메타데이터와 기본 iOS/Android 식별자
- `babel.config.js`
  - Expo 기본 Babel 설정
- `metro.config.js`
  - `mobile/app-shell/` 아래의 공유 스캐폴드를 가져올 수 있도록 워크스페이스 폴더를 watch 대상으로 추가
- `package.json`
  - Expo SDK 54, React Native 0.81.5, `react-native-webview` 기반의 최소 의존성

## 실행 전 준비
0. 권장 Node 버전 확인
   - `nvm use` 또는 `nvm install` 전에 `.nvmrc` 확인
   - 권장: `20.19.4`
1. 이 폴더에서 의존성 설치
2. 환경변수 설정
   - `EXPO_PUBLIC_RESPONDIO_BASE_URL=https://respondio-ai-pwa.pages.dev`
3. Expo 시작

## 실행 명령
```bash
cd "/Users/junho/Documents/Respondio /mobile/react-native-shell"
npm run doctor
npm install
EXPO_PUBLIC_RESPONDIO_BASE_URL="https://respondio-ai-pwa.pages.dev" npm run start:lan
```

`npm run start:lan` 과 `npm run export:android` 는 내부적으로 `scripts/use-node20.sh` 를 통해 자동으로 Node `20.19.4`를 사용하고, `EXPO_NO_TELEMETRY=1` 도 함께 설정합니다.

## 실제 기기 테스트 포인트
- Expo가 `exp://...:8081` 주소와 QR 코드를 보여주면 휴대폰 `Expo Go`에서 바로 열 수 있습니다.
- 휴대폰과 Mac이 같은 Wi-Fi에 있어야 `start:lan` 흐름이 가장 안정적입니다.
- 테스트 중에는 `/Users/junho/Documents/Respondio /mobile/app-shell/examples/react-native/RespondioSessionShell.js` 의 로그인 WebView 모달이 실제 플랫폼 로그인과 세션 센터 사이를 중계합니다.
- 로그인 WebView 모달에는 `뒤로`, `새로고침`, `닫기` 버튼과 현재 URL 표시가 들어 있어서, 플랫폼 로그인 흐름이 막혀도 앱 안에서 바로 재시도할 수 있습니다.
- 세션 센터 화면 하단에는 현재 접속 주소, 세션 센터 새로고침, 브리지 이벤트 로그, 플랫폼별 직접 로그인 안내가 표시됩니다.

## 현재 확인된 상태
- `npm install` 완료
- Expo Android 번들 export 검증 완료
- Expo LAN 개발 서버 실기기 접속 주소 생성 확인 완료
- 검증 명령:

```bash
HOME=/tmp/respondio-expo-home EXPO_NO_TELEMETRY=1 npx expo export --platform android --output-dir ./dist-export
/bin/zsh -lc 'export NVM_DIR="$HOME/.nvm"; . "$NVM_DIR/nvm.sh"; nvm use 20.19.4 >/dev/null; EXPO_NO_TELEMETRY=1 npx expo start --lan --port 8081 --clear'
```

## 참고
- 이 프로젝트는 `mobile/app-shell/examples/react-native/RespondioSessionShell.js`를 그대로 사용합니다.
- 즉, 세션 센터 WebView, 플랫폼 로그인 WebView, 자동 판별 규칙은 공유 스캐폴드 한 곳에서 계속 유지됩니다.
- 플랫폼별 성공/추가 인증/차단 판별 규칙은 [platformLoginHeuristics.js](/Users/junho/Documents/Respondio%20/mobile/app-shell/www/platformLoginHeuristics.js) 에 있습니다.
- 버전 선택은 현재 Expo 공식 문서의 안정 조합을 기준으로 맞췄습니다. 새 프로젝트 기본값이 아직 SDK 54인 기간이라 실기기 테스트에도 무리가 적습니다.
- Expo SDK 54 문서는 최소 Node.js `20.19.x`와 `Node.js LTS` 사용을 안내합니다. 이 로컬 환경의 Node 24에서는 `expo start` 중 포트 탐색 오류를 한 번 재현했습니다.

## 다음 단계
1. 실제 기기에서 Expo로 앱 실행
2. `/mobile/session-center` 로그인
3. 플랫폼 직접 로그인 시도
4. 자동 판별 로그 수집
5. 필요하면 플랫폼별 신호 규칙 추가 보강
