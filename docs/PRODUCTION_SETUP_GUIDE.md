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
HOME=/tmp/respondio-wrangler-home npx wrangler secret put PORTONE_API_SECRET
HOME=/tmp/respondio-wrangler-home npx wrangler secret put PORTONE_WEBHOOK_SECRET
```

입력값 설명:
- `JWT_SECRET`: 32자 이상 임의 문자열
- `CRAWLER_SHARED_SECRET`: 웹앱과 크롤러가 같이 쓸 공유 비밀값
- `CREDENTIALS_ENCRYPTION_KEY`: 플랫폼 로그인 비밀번호 암호화용 키
- `PORTONE_API_SECRET`: PortOne 서버 API secret
- `PORTONE_WEBHOOK_SECRET`: PortOne webhook secret

## 3. Cloudflare 일반 환경변수 등록

목적:
민감하지 않은 운영 설정을 등록합니다.

Cloudflare Pages 대시보드에서 설정:
- `OPENAI_BASE_URL`
- `CRAWLER_API_BASE`
- `APP_BASE_URL`
- `PORTONE_STORE_ID`
- `PORTONE_CHANNEL_KEY`

권장값 예시:
- `OPENAI_BASE_URL=https://api.openai.com/v1`
- `CRAWLER_API_BASE=https://crawler.your-domain.com`
- `APP_BASE_URL=https://app.your-domain.com`

## 4. 크롤러 서버 환경변수 등록

목적:
외부 Node crawler가 실제 웹앱과 안전하게 통신하게 합니다.

필수값:
- `WEBAPP_API=https://app.your-domain.com/api/v1`
- `CRAWLER_SHARED_SECRET=<Cloudflare와 동일한 값>`
- `CRAWLER_PORT=4000`

로컬 운영 경로 smoke만 돌릴 때:
- `CRAWLER_TEST_MODE=1`

실서비스에서는:
- `CRAWLER_TEST_MODE`를 비워두거나 제거

## 5. PortOne 값 준비

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
1. 로그인 가능
2. 결제 페이지 로드
3. 플랫폼 연결 저장 가능
4. live sync 실행 가능
5. PortOne 결제 준비 API 응답 정상
6. PortOne webhook 수신 가능

## 10. 지금 사용자에게 필요한 정보

제가 실제 외부 연동까지 마무리하려면 아래 중 최소 하나가 필요합니다.

1. Cloudflare 인증 완료
2. PortOne 운영값 4종
3. 플랫폼 운영 계정 정보

이 값이 준비되면, 그 다음 단계부터는 제가 이어서 진행할 수 있습니다.
