# Respondio Production Setup Guide

이 문서는 실제 배포에 필요한 외부 의존을 차근차근 채우는 체크리스트입니다.

## 1. Cloudflare 인증

목적:
웹앱을 실제 Cloudflare Pages/Workers로 배포할 수 있게 합니다.

실행:
```bash
cd /Users/junho/Documents/Respondio
HOME=/tmp/respondio-wrangler-home npx wrangler login
```

확인:
```bash
HOME=/tmp/respondio-wrangler-home npx wrangler whoami
```

정상 기준:
- 계정 이메일 또는 account 정보가 출력됨

## 2. Cloudflare 시크릿 등록

목적:
실서비스에서 필요한 민감 정보를 Cloudflare에 저장합니다.

실행:
```bash
cd /Users/junho/Documents/Respondio

HOME=/tmp/respondio-wrangler-home npx wrangler secret put OPENAI_API_KEY
HOME=/tmp/respondio-wrangler-home npx wrangler secret put JWT_SECRET
HOME=/tmp/respondio-wrangler-home npx wrangler secret put CRAWLER_SHARED_SECRET
HOME=/tmp/respondio-wrangler-home npx wrangler secret put CREDENTIALS_ENCRYPTION_KEY
```

입력값 설명:
- `JWT_SECRET`: 32자 이상 임의 문자열
- `CRAWLER_SHARED_SECRET`: 웹앱과 크롤러가 같이 쓸 공유 비밀값
- `CREDENTIALS_ENCRYPTION_KEY`: 플랫폼 로그인 비밀번호 암호화용 키

## 3. Cloudflare 일반 환경변수 등록

목적:
민감하지 않은 운영 설정을 등록합니다.

Cloudflare Pages 대시보드에서 설정:
- `OPENAI_BASE_URL`
- `CRAWLER_API_BASE`
- `APP_BASE_URL`

권장값 예시:
- `OPENAI_BASE_URL=https://api.openai.com/v1`
- `CRAWLER_API_BASE=https://crawler.your-domain.com`
- `APP_BASE_URL=https://app.your-domain.com`

## 4. 크롤러 서버 환경변수 등록

목적:
외부 Node crawler가 실제 웹앱과 안전하게 통신하게 합니다.

권장 배포 방식:
- Render Web Service
- 이 저장소에는 `render.yaml`과 `crawler/Dockerfile`이 포함되어 있어 GitHub 저장소를 바로 연결할 수 있음

필수값:
- `WEBAPP_API=https://app.your-domain.com/api/v1`
- `CRAWLER_SHARED_SECRET=<Cloudflare와 동일한 값>`
- `CRAWLER_PORT=4000`

로컬 운영 경로 smoke만 돌릴 때:
- `CRAWLER_TEST_MODE=1`

실서비스에서는:
- `CRAWLER_TEST_MODE`를 비워두거나 제거

Render에서는:
- `PORT`는 Render가 자동 주입하므로 별도 입력하지 않아도 됨
- `CRAWLER_PORT`는 비워둬도 동작함

## 5. PortOne 값 준비 (선택)

지금은 생략해도 됩니다.

생략 시 동작:
- 앱은 무료 베타 모드로 배포됨
- `/billing` 화면은 결제 대신 베타 안내를 표시함
- 핵심 기능인 로그인, 플랫폼 연결, 리뷰 동기화, AI 답변 생성은 그대로 사용 가능

나중에 셀프 결제를 열고 싶을 때만 아래 값을 추가하면 됩니다.

필요한 값:
- `PORTONE_STORE_ID`
- `PORTONE_CHANNEL_KEY`
- `PORTONE_API_SECRET`
- `PORTONE_WEBHOOK_SECRET`

적용 위치:
- 공개값: `PORTONE_STORE_ID`, `PORTONE_CHANNEL_KEY`
- 비공개값: `PORTONE_API_SECRET`, `PORTONE_WEBHOOK_SECRET`

Webhook URL:
```text
https://app.your-domain.com/api/v1/webhooks/portone
```

## 6. 플랫폼 운영 계정 준비

설정 화면에서 각 플랫폼별로 입력:
- 로그인 이메일
- 로그인 비밀번호
- 플랫폼 매장 ID

지원 플랫폼:
- 배달의민족
- 쿠팡이츠
- 요기요

## 7. 배포 전 점검

실행:
```bash
cd /Users/junho/Documents/Respondio
npm run build
npm test
npm run doctor:prod
```

로컬 종합 smoke:
```bash
npm run test:e2e
```

정상 기준:
- `npm test` 통과
- `npm run build` 통과
- `npm run test:e2e` 통과
- `npm run doctor:prod` 에서 blocker가 없어야 함

## 8. 실제 배포

실행:
```bash
cd /Users/junho/Documents/Respondio
npm run build
HOME=/tmp/respondio-wrangler-home npx wrangler pages deploy dist
```

## 9. 배포 후 확인

확인 순서:
0. `GET /api/v1/health/public` 이 `db.ready=true`, `crawler.reachable=true`를 반환하는지 확인
1. 로그인 가능
2. `/billing` 페이지가 무료 베타 안내 또는 결제 화면으로 정상 로드
3. 플랫폼 연결 저장 가능
4. live sync 실행 가능
5. 리뷰 AI 생성/승인/등록 흐름 정상
6. PortOne을 연동했다면 그때 결제 준비 API와 webhook 수신 확인

## 10. 지금 사용자에게 필요한 정보

제가 실제 외부 연동까지 마무리하려면 아래 중 최소 하나가 필요합니다.

1. Cloudflare 인증 완료
2. PortOne 운영값 4종 (결제를 열 때만)
3. 플랫폼 운영 계정 정보

이 값이 준비되면, 그 다음 단계부터는 제가 이어서 진행할 수 있습니다.
