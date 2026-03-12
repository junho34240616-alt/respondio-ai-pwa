# GitHub Upload Bundle

Source bundle for GitHub upload.

Excluded directories: `.git`, `node_modules`, `crawler/node_modules`, `.wrangler`, `dist`.

## File List
```text
.gitignore
CODEX_CONTEXT.md
crawler/ecosystem.config.cjs
crawler/index.js
crawler/package-lock.json
crawler/package.json
docs/PRODUCTION_SETUP_GUIDE.md
ecosystem.config.cjs
migrations/0001_initial_schema.sql
migrations/0002_auth_sessions.sql
migrations/0003_billing_and_platform_connections.sql
package-lock.json
package.json
public/static/icon-192.png
public/static/icon-512.png
public/static/style.css
public/sw.js
README.md
scripts/local-e2e.mjs
scripts/production-doctor.mjs
seed.sql
src/index.tsx
src/routes/api.smoke.test.ts
src/routes/api.ts
src/services/ai.ts
src/services/auth.test.ts
src/services/auth.ts
src/services/secrets.ts
tsconfig.json
vite.config.ts
wrangler.jsonc
```

## Binary Files
- public/static/icon-192.png (3476 bytes)
- public/static/icon-512.png (11395 bytes)

## FILE: .gitignore
```text
node_modules/
dist/
.wrangler/
.dev.vars
*.log
.pm2/
pids/
crawler/node_modules/

```

## FILE: CODEX_CONTEXT.md
```md
# Respondio - Codex 협업 컨텍스트 (2026-03-11)

## 프로젝트 한줄 요약
**배달 리뷰 AI 자동답변 SaaS** (배민/쿠팡이츠/요기요 → GPT 답변 생성 → 승인 → 자동 게시)

---

## 기술 스택
| 구분 | 기술 |
|------|------|
| 웹앱 프레임워크 | Hono 4 + TypeScript |
| 배포 타겟 | Cloudflare Pages (Workers runtime) |
| 빌드 | Vite 6 + @hono/vite-build |
| DB | Cloudflare D1 (SQLite, `--local` 모드) |
| AI | GPT-5-mini via GenSpark LLM Proxy |
| 크롤러 | Node.js + Playwright + Express (port 4000) |
| 프론트엔드 | Tailwind CSS (CDN) + Chart.js + FontAwesome |
| PM2 | 프로세스 매니저 (respondio:3000, respondio-crawler:4000) |
| PWA | manifest.json + service worker |

## 디렉토리 구조
```
/Users/junho/Documents/Respondio/
├── src/
│   ├── index.tsx          # 메인 앱 + 전체 프론트엔드 HTML (1530줄)
│   ├── routes/api.ts      # REST API 엔드포인트 (632줄)
│   └── services/ai.ts     # GPT 호출, 감정분석, 품질점수 (316줄)
├── crawler/
│   ├── index.js           # Playwright 크롤링 서버 (626줄)
│   ├── ecosystem.config.cjs
│   └── package.json
├── migrations/
│   ├── 0001_initial_schema.sql  # 초기 14 테이블
│   └── 0002_auth_sessions.sql   # refresh token 세션 테이블
├── public/
│   ├── static/            # CSS, 아이콘
│   └── sw.js              # Service Worker
├── seed.sql               # 테스트 데이터
├── .dev.vars              # OPENAI_API_KEY, OPENAI_BASE_URL
├── ecosystem.config.cjs   # PM2: wrangler pages dev (port 3000)
├── wrangler.jsonc         # D1 binding: DB → respondio-production
├── vite.config.ts
└── package.json
```

## 핵심 아키텍처 결정사항

### 배포 기준 아키텍처 방향 (확정)
- **젠스파크 AI개발자 배포 기준 기본 방향은 유지보수보다 "배포 성공률" 우선**
- **메인 웹앱/API는 현재 구조인 Hono + D1 + Cloudflare Pages/Workers를 유지하며 고도화**
- **크롤러는 Node.js + Playwright 외부 프로세스로 유지**하고, 웹앱과 HTTP API로 통신
- **상세 설계서의 Next.js + Redis + R2 + worker 분리 구조는 장기 확장안**으로 보관하고, 지금 당장 전체 마이그레이션은 하지 않음
- **Redis/R2/worker 세분화는 실제 병목 또는 운영 요구가 확인된 뒤 단계적으로 도입**

### 단계적 확장 원칙
- **지금 바로 도입하지 않는 것**: Next.js 전면 전환, Redis 큐, AI worker/post worker 분리, R2 screenshot 저장
- **조만간 도입 가능한 것**: JWT 인증, 실사용 크롤러 연동, PortOne 일반결제, Cloudflare 프로덕션 배포
- **도입 시점 조건**:
  - Redis: 동기화/생성/등록 작업이 눈에 띄게 쌓일 때
  - R2: 실패 스크린샷/HTML dump 보관이 필요해질 때
  - worker 분리: crawler 외 작업까지 비동기 처리량이 커질 때
  - Next.js 전환: UI 복잡도와 컴포넌트 재사용 요구가 현재 인라인 HTML 구조를 넘을 때

### 프론트엔드: 전부 src/index.tsx에 인라인 HTML
- SSR이 아니라 `c.html()` 호출로 HTML 문자열 반환
- 페이지별 함수: `landingPage()`, `loginPage()`, `dashboardPage()`, `reviewsPage()`, `customersPage()`, `billingPage()`, `settingsPage()`, `adminDashboardPage()`
- Chart.js/Tailwind는 CDN으로 로드, API 호출은 fetch로 직접

### 백엔드: Hono + D1
- Bindings: `{ DB: D1Database, OPENAI_API_KEY: string, OPENAI_BASE_URL: string }`
- API base: `/api/v1`
- D1 로컬 모드: `wrangler pages dev dist --d1=respondio-production --local`

### AI 서비스 (src/services/ai.ts)
- `callGPT()`: fetch로 직접 호출 (model: gpt-5-mini, max_completion_tokens: 1000)
- `generateReply()`: 프롬프트 엔지니어링 → 답변 생성 → 품질 점수 평가
- `analyzeSentiment()`: JSON 포맷으로 감정 분석 응답 파싱
- API 실패시 `template_fallback`으로 자동 전환
- Base URL: `https://www.genspark.ai/api/llm_proxy/v1`

### 크롤러 서버 (crawler/index.js)
- Express on port 4000
- 데모 모드: 실제 로그인 없이 시뮬레이션 리뷰 생성
- 실제 모드: Playwright로 플랫폼 로그인 → 리뷰 수집 → 답변 게시
- 웹앱과 통신: crawler API 호출 후 웹앱 DB 저장

## DB 스키마 (14 테이블)
`users` → `stores` → `store_platform_connections`
`reviews` → `reply_candidates` → `replies`
`customers`, `banned_words`
`plans` → `subscriptions` → `payments`, `payment_methods`
`dashboard_daily_summaries`, `job_logs`

## 페이지 라우팅
| 경로 | 역할 | 설명 |
|------|------|------|
| `/` | 공개 | 랜딩 (기능/요금제/FAQ) |
| `/login` | 공개 | 로그인/가입 (사장님 & 관리자 퀵로그인) |
| `/dashboard` | 사장님 | KPI 6개, 최근리뷰, 메뉴차트, 충성고객, 트렌드 |
| `/reviews` | 사장님 | 필터/리스트/AI승인패널, 리뷰수집/일괄생성/전체승인 |
| `/customers` | 사장님 | 고객분석 테이블 |
| `/billing` | 사장님 | 요금제비교, 결제내역, 결제수단 |
| `/settings` | 사장님 | 매장정보, 답변스타일, 자동응답 토글 |
| `/admin` | 관리자 | 다크테마, KPI, 에러로그, 에러차트, 큐상태, DLQ, 사용자관리, 크롤러상태 |

## API 엔드포인트 요약
**Auth**: POST `/auth/login`, `/auth/signup`, `/auth/refresh`, `/auth/logout`, GET `/auth/me`
**Reviews**: GET `/reviews`, POST `/reviews/:id/generate`, `/reviews/:id/analyze`, `/reviews/batch-generate`, `/reviews/batch-analyze`, `/reviews/approve`, POST `/reviews/:id/post`, PATCH `/reviews/:id/reply`, POST `/reviews/sync`
**Dashboard**: GET `/dashboard/summary`, `/dashboard/menus`, `/dashboard/repeat_customers`, `/dashboard/daily_trend`
**Plans/Billing**: GET `/plans`, `/subscriptions`, `/payments`, `/payment_methods`, `/platform_connections`
**Crawler**: GET `/crawler/status`, POST `/crawler/reviews`
**Admin**: GET `/admin/users`, `/admin/logs`, `/admin/stats`, POST `/admin/jobs/:id/retry`

## 테스트 계정
- 사장님: `owner@test.com` / `password` → `/dashboard`
- 관리자: `admin@respondio.com` / `admin123` → `/admin`

## 현재 구현 상태 (프로토타입)
- [x] 리뷰 조회/필터, AI 답변 생성, 감정 분석, 품질 점수 계산
- [x] 데모 크롤러를 통한 리뷰 수집/DB 저장
- [x] 관리자 대시보드용 기본 통계/로그 조회 API
- [x] Cloudflare Pages + D1 기준 개발용 구조
- [x] JWT access token 기반 API 인증 + 관리자 API 보호
- [x] refresh token + httpOnly cookie + 401 자동 세션 갱신 + 초기 진입 시 세션 복구
- [x] 사용자/매장 기준 API 스코프 분리
- [x] 승인 후 `approved`/`posted` 분리 + 실제 등록 시도
- [x] 크롤러-웹앱 shared secret 연동
- [x] auth 유틸 기본 스모크 테스트
- [x] PortOne 결제 준비/승인/웹훅/API 기본 경로
- [x] 플랫폼 계정 연결 UI + 자격증명 암호화 저장
- [x] 로컬 Cloudflare + crawler + browser E2E smoke
- [ ] 기기별 세션 관리 / 강제 로그아웃 UI
- [ ] PortOne 실결제 검증 및 운영 시크릿 배선
- [ ] 서비스워커 등록을 포함한 PWA 완성

## 구현상 주의사항
- 로그인/회원가입은 실제 API 인증이며 refresh token/httpOnly cookie와 초기 세션 복구도 들어갔지만, 기기별 세션 관리 UI는 아직 없음
- 크롤러 URL은 설정 가능하고 shared secret도 연동됐지만 프로덕션 환경변수/시크릿 배선은 아직 필요
- 플랫폼 자격증명은 `CREDENTIALS_ENCRYPTION_KEY` 기반으로 암호화 저장되며, 로컬 운영 경로 E2E는 `CRAWLER_TEST_MODE=1`로 검증 가능
- 일부 UI 문구/시드 데이터는 여전히 데모 전제이며, 실제 운영 흐름과 완전히 동기화되어 있지 않음
- PortOne 결제 UI/API/웹훅 기본 경로는 추가됐지만, 실결제 검증은 실제 Store/Channel/API secret과 webhook 배선이 있어야 함

## 필수 환경변수
- **Cloudflare Pages / Workers secrets**: `OPENAI_API_KEY`, `JWT_SECRET`, `CRAWLER_SHARED_SECRET`, `CREDENTIALS_ENCRYPTION_KEY`, `PORTONE_API_SECRET`, `PORTONE_WEBHOOK_SECRET`
- **Cloudflare Pages / Workers vars**: `OPENAI_BASE_URL`, `CRAWLER_API_BASE`, `APP_BASE_URL`, `PORTONE_STORE_ID`, `PORTONE_CHANNEL_KEY`
- **Crawler server vars**: `WEBAPP_API`, `CRAWLER_SHARED_SECRET`, `CRAWLER_PORT`, `CRAWLER_TEST_MODE`

## 남은 과제 / 개선 포인트 (우선순위 재정렬)
1. **Cloudflare 프로덕션 배포 정리**: D1 실제 DB, 시크릿, 환경별 crawler URL, 배포 스모크체크
2. **세션 보강**: refresh token / httpOnly cookie / 자동 로그아웃 및 만료 처리 UX
3. **실제 크롤링 전환**: 데모/실모드 분리 유지, 플랫폼 연결 UX, 외부 크롤러 배포 환경 정리
4. **입력 검증/에러 포맷/보안 보강**: request validation, 공통 에러 응답, 로그 마스킹
5. **PortOne 실운영 전환**: 실제 Store/Channel/API Secret 연결, webhook endpoint 공개, 결제 성공/실패 운영 점검
6. **테스트 코드 확대**: API 핵심 유닛 테스트 확대, 현재 로컬 browser E2E를 CI 친화적으로 정리
7. **프론트엔드 구조 정리**: `src/index.tsx` 분리, 공통 UI/스크립트 추출
8. **관리자 운영 기능 확장**: 금칙어 CRUD, 플랜 CRUD, 결제 운영, 실패 재처리 정교화
9. **후순위 확장**: R2 screenshot/html dump, Redis 큐, AI/post worker 분리, Next.js 전환 검토

## 실행 명령어
```bash
# 빌드 + 실행
cd /Users/junho/Documents/Respondio && npm run build
pm2 start ecosystem.config.cjs          # 웹앱 :3000
pm2 start crawler/ecosystem.config.cjs  # 크롤러 :4000

# 테스트
npm test
npm run test:e2e

# DB 리셋
rm -rf .wrangler/state/v3/d1
npx wrangler d1 migrations apply respondio-production --local
npx wrangler d1 execute respondio-production --local --file=./seed.sql

# 로그 확인
pm2 logs --nostream
```

## 배포 상태
- 로컬 Cloudflare Pages/D1 smoke와 browser E2E는 2026-03-11 기준 통과
- 원격 Cloudflare 배포는 현재 `wrangler whoami`가 `You are not authenticated. Please run wrangler login.` 를 반환해서, 인증 전까지는 불가

## Git 히스토리
```
ec9a8be fix: GPT API max_completion_tokens 적용
c86b32d docs: README 업데이트
37f9356 feat: 크롤링 서버 + 관리자 대시보드 개선
439ab74 feat: GPT AI 연동
c3115a2 docs: README.md 추가
9b81f14 feat: 초기 구현 (전체 UI + API + DB)
```

```

## FILE: crawler/ecosystem.config.cjs
```js
module.exports = {
  apps: [
    {
      name: 'respondio-crawler',
      script: 'index.js',
      cwd: __dirname,
      env: {
        NODE_ENV: 'development',
        CRAWLER_PORT: 4000,
        WEBAPP_API: 'http://localhost:3000/api/v1',
        CRAWLER_SHARED_SECRET: process.env.CRAWLER_SHARED_SECRET || ''
      },
      watch: false,
      instances: 1,
      exec_mode: 'fork'
    }
  ]
}

```

## FILE: crawler/index.js
```js
/**
 * Respondio - 배달 플랫폼 크롤링 서버
 * Node.js + Playwright + Express
 * 
 * 지원 플랫폼:
 * - 배달의민족 (baemin)
 * - 쿠팡이츠 (coupang_eats)
 * - 요기요 (yogiyo)
 * 
 * 기능:
 * - 리뷰 수집 (신규 미답변 리뷰)
 * - 답변 게시 (승인된 답변을 플랫폼에 등록)
 * - 세션 관리 (로그인 세션 유지)
 * - 연동 상태 모니터링
 */

const express = require('express');
const cors = require('cors');
const { chromium } = require('playwright');

const app = express();
app.use(cors());
app.use(express.json());

const PORT = process.env.CRAWLER_PORT || 4000;
const WEBAPP_API = process.env.WEBAPP_API || 'http://localhost:3000/api/v1';
const CRAWLER_SHARED_SECRET = process.env.CRAWLER_SHARED_SECRET || '';
const CRAWLER_TEST_MODE = process.env.CRAWLER_TEST_MODE === '1';

app.use((req, res, next) => {
  if (!CRAWLER_SHARED_SECRET || req.path === '/health') {
    return next();
  }

  const providedSecret = req.headers['x-crawler-secret'];
  if (providedSecret !== CRAWLER_SHARED_SECRET) {
    return res.status(401).json({ error: 'Unauthorized crawler request' });
  }

  next();
});

// ============================================================
//  STATE MANAGEMENT
// ============================================================
const platformSessions = new Map(); // platform -> { browser, context, page, loggedIn }
const crawlJobs = [];
const jobHistory = [];

// ============================================================
//  PLATFORM CONFIGS
// ============================================================
const PLATFORMS = {
  baemin: {
    name: '배달의민족',
    loginUrl: 'https://self.baemin.com/login',
    reviewUrl: 'https://self.baemin.com/reviews',
    selectors: {
      loginEmail: 'input[type="email"], input[name="email"], #email',
      loginPassword: 'input[type="password"], input[name="password"], #password',
      loginButton: 'button[type="submit"], .login-btn',
      reviewList: '.review-item, .review-card, [data-testid="review"]',
      reviewText: '.review-content, .review-text, .content',
      reviewRating: '.rating, .star-rating, [data-testid="rating"]',
      reviewAuthor: '.author, .customer-name, .nickname',
      reviewDate: '.date, .review-date, time',
      reviewMenu: '.menu-items, .order-items',
      replyInput: 'textarea.reply, textarea[name="reply"], .reply-input',
      replySubmit: 'button.reply-submit, .submit-reply'
    }
  },
  coupang_eats: {
    name: '쿠팡이츠',
    loginUrl: 'https://store.coupangeats.com/login',
    reviewUrl: 'https://store.coupangeats.com/reviews',
    selectors: {
      loginEmail: 'input[type="email"], input[name="email"]',
      loginPassword: 'input[type="password"]',
      loginButton: 'button[type="submit"]',
      reviewList: '.review-item, [class*="review"]',
      reviewText: '.review-content, [class*="content"]',
      reviewRating: '.rating, [class*="rating"]',
      reviewAuthor: '.author, [class*="author"]',
      reviewDate: '.date, time',
      reviewMenu: '.menu, [class*="menu"]',
      replyInput: 'textarea',
      replySubmit: 'button[type="submit"]'
    }
  },
  yogiyo: {
    name: '요기요',
    loginUrl: 'https://ceo.yogiyo.co.kr/login',
    reviewUrl: 'https://ceo.yogiyo.co.kr/reviews',
    selectors: {
      loginEmail: 'input[type="email"], input[name="id"]',
      loginPassword: 'input[type="password"]',
      loginButton: 'button[type="submit"]',
      reviewList: '.review-item, [class*="review"]',
      reviewText: '.content, [class*="content"]',
      reviewRating: '.rating, [class*="star"]',
      reviewAuthor: '.name, [class*="name"]',
      reviewDate: '.date, time',
      reviewMenu: '.menu, [class*="order"]',
      replyInput: 'textarea',
      replySubmit: 'button[type="submit"]'
    }
  }
};

// ============================================================
//  BROWSER MANAGEMENT
// ============================================================
let globalBrowser = null;

async function getBrowser() {
  if (!globalBrowser || !globalBrowser.isConnected()) {
    globalBrowser = await chromium.launch({
      headless: true,
      args: [
        '--no-sandbox',
        '--disable-setuid-sandbox',
        '--disable-dev-shm-usage',
        '--disable-gpu',
        '--single-process'
      ]
    });
  }
  return globalBrowser;
}

async function getContext(platform) {
  const session = platformSessions.get(platform);
  if (session && session.context) {
    return session;
  }

  const browser = await getBrowser();
  const context = await browser.newContext({
    userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
    viewport: { width: 1280, height: 720 }
  });
  
  const page = await context.newPage();
  const sessionData = { browser, context, page, loggedIn: false, lastActivity: Date.now() };
  platformSessions.set(platform, sessionData);
  return sessionData;
}

// ============================================================
//  CORE CRAWLING FUNCTIONS
// ============================================================

/**
 * 플랫폼 로그인
 */
async function loginPlatform(platform, credentials) {
  const config = PLATFORMS[platform];
  if (!config) throw new Error(`Unsupported platform: ${platform}`);

  if (CRAWLER_TEST_MODE) {
    platformSessions.set(platform, {
      browser: null,
      context: null,
      page: null,
      loggedIn: true,
      lastActivity: Date.now(),
      mockMode: true,
      loginEmail: credentials.email
    });

    return {
      success: true,
      platform,
      message: '테스트 모드 로그인 성공'
    };
  }

  const session = await getContext(platform);
  const { page } = session;

  try {
    console.log(`[${config.name}] 로그인 시도...`);
    
    await page.goto(config.loginUrl, { waitUntil: 'networkidle', timeout: 30000 });
    
    // 이메일 입력
    await page.waitForSelector(config.selectors.loginEmail, { timeout: 10000 });
    await page.fill(config.selectors.loginEmail, credentials.email);
    
    // 비밀번호 입력
    await page.fill(config.selectors.loginPassword, credentials.password);
    
    // 로그인 버튼 클릭
    await page.click(config.selectors.loginButton);
    
    // 페이지 전환 대기
    await page.waitForNavigation({ timeout: 15000 }).catch(() => {});
    await page.waitForTimeout(2000);
    
    // 로그인 성공 확인 (URL이 login이 아닌지)
    const currentUrl = page.url();
    session.loggedIn = !currentUrl.includes('login');
    session.lastActivity = Date.now();
    
    console.log(`[${config.name}] 로그인 ${session.loggedIn ? '성공' : '실패'}: ${currentUrl}`);
    
    return {
      success: session.loggedIn,
      platform,
      message: session.loggedIn ? '로그인 성공' : '로그인 실패 - 크리덴셜 확인 필요'
    };
  } catch (error) {
    console.error(`[${config.name}] 로그인 에러:`, error.message);
    session.loggedIn = false;
    return {
      success: false,
      platform,
      message: `로그인 에러: ${error.message}`
    };
  }
}

/**
 * 리뷰 수집
 */
async function fetchReviews(platform, storeId, options = {}) {
  const config = PLATFORMS[platform];
  if (!config) throw new Error(`Unsupported platform: ${platform}`);

  const session = platformSessions.get(platform);
  
  // 데모 모드: 실제 크롤링 없이 시뮬레이션 데이터 반환
  if (options.demo || !session?.loggedIn) {
    console.log(`[${config.name}] 데모 모드로 리뷰 수집 시뮬레이션`);
    return generateDemoReviews(platform, storeId);
  }

  if (CRAWLER_TEST_MODE) {
    console.log(`[${config.name}] 테스트 운영 모드 리뷰 수집`);
    return generateOperationalMockReviews(platform, storeId);
  }

  const { page } = session;
  
  try {
    console.log(`[${config.name}] 리뷰 페이지 접속...`);
    await page.goto(config.reviewUrl, { waitUntil: 'networkidle', timeout: 30000 });
    
    // 리뷰 목록 대기
    await page.waitForSelector(config.selectors.reviewList, { timeout: 15000 });
    
    // 리뷰 데이터 추출
    const reviews = await page.evaluate((selectors) => {
      const items = document.querySelectorAll(selectors.reviewList);
      return Array.from(items).map((item, index) => {
        const getText = (sel) => {
          const el = item.querySelector(sel);
          return el ? el.textContent.trim() : '';
        };
        
        return {
          platform_review_id: `review_${Date.now()}_${index}`,
          customer_name: getText(selectors.reviewAuthor) || '고객',
          rating: parseFloat(getText(selectors.reviewRating)) || 4.0,
          review_text: getText(selectors.reviewText) || '',
          menu_items: getText(selectors.reviewMenu) || '',
          review_date: getText(selectors.reviewDate) || new Date().toISOString()
        };
      }).filter(r => r.review_text.length > 0);
    }, config.selectors);

    session.lastActivity = Date.now();
    
    console.log(`[${config.name}] ${reviews.length}건의 리뷰 수집 완료`);
    
    return {
      success: true,
      platform,
      store_id: storeId,
      reviews,
      fetched_at: new Date().toISOString(),
      count: reviews.length
    };
  } catch (error) {
    console.error(`[${config.name}] 리뷰 수집 에러:`, error.message);
    return {
      success: false,
      platform,
      error: error.message,
      reviews: []
    };
  }
}

/**
 * 답변 게시
 */
async function postReply(platform, reviewId, replyText) {
  const config = PLATFORMS[platform];
  if (!config) throw new Error(`Unsupported platform: ${platform}`);

  const session = platformSessions.get(platform);
  
  // 데모 모드
  if (!session?.loggedIn) {
    console.log(`[${config.name}] 데모 모드: 답변 게시 시뮬레이션 (review: ${reviewId})`);
    return {
      success: true,
      platform,
      review_id: reviewId,
      message: '답변 게시 완료 (데모)',
      posted_at: new Date().toISOString()
    };
  }

  if (CRAWLER_TEST_MODE) {
    console.log(`[${config.name}] 테스트 운영 모드: 답변 게시 시뮬레이션 (review: ${reviewId})`);
    return {
      success: true,
      platform,
      review_id: reviewId,
      message: '답변 게시 완료 (테스트 운영 모드)',
      posted_at: new Date().toISOString(),
      reply_preview: String(replyText || '').slice(0, 60)
    };
  }

  const { page } = session;

  try {
    console.log(`[${config.name}] 답변 게시 시도 (review: ${reviewId})...`);
    
    // 리뷰 페이지에서 해당 리뷰 찾기
    await page.goto(`${config.reviewUrl}/${reviewId}`, { waitUntil: 'networkidle', timeout: 30000 });
    
    // 답변 입력
    await page.waitForSelector(config.selectors.replyInput, { timeout: 10000 });
    await page.fill(config.selectors.replyInput, replyText);
    
    // 답변 제출
    await page.click(config.selectors.replySubmit);
    await page.waitForTimeout(2000);
    
    session.lastActivity = Date.now();
    
    console.log(`[${config.name}] 답변 게시 완료`);
    
    return {
      success: true,
      platform,
      review_id: reviewId,
      message: '답변 게시 완료',
      posted_at: new Date().toISOString()
    };
  } catch (error) {
    console.error(`[${config.name}] 답변 게시 에러:`, error.message);
    return {
      success: false,
      platform,
      review_id: reviewId,
      error: error.message
    };
  }
}

// ============================================================
//  DEMO DATA GENERATOR
// ============================================================
function generateDemoReviews(platform, storeId) {
  const platformNames = { baemin: '배달의민족', coupang_eats: '쿠팡이츠', yogiyo: '요기요' };
  
  const demoReviews = {
    baemin: [
      { customer_name: '이지은', rating: 5, review_text: '양념치킨 진짜 맛있어요! 소스도 넉넉하고 배달도 빨랐습니다.', menu_items: '["양념치킨","감자튀김"]', sentiment: 'positive' },
      { customer_name: '김준혁', rating: 3, review_text: '치킨은 맛있는데 배달이 좀 늦었어요. 40분 넘게 걸렸습니다.', menu_items: '["후라이드치킨","콜라"]', sentiment: 'negative' },
      { customer_name: '박서연', rating: 4, review_text: '간장치킨 좋아요! 다음에도 시킬게요.', menu_items: '["간장치킨"]', sentiment: 'positive' },
    ],
    coupang_eats: [
      { customer_name: '최민호', rating: 5, review_text: '쿠팡이츠로 처음 시켰는데 너무 맛있어요! 포장도 깔끔합니다.', menu_items: '["양념치킨","치즈볼"]', sentiment: 'positive' },
      { customer_name: '한수진', rating: 2, review_text: '양이 너무 적어요. 가격 대비 실망이네요.', menu_items: '["불고기 덮밥"]', sentiment: 'negative' },
    ],
    yogiyo: [
      { customer_name: '송지우', rating: 4, review_text: '떡볶이 맛있어요! 근데 순대가 좀 차가웠어요.', menu_items: '["떡볶이","순대","튀김"]', sentiment: 'neutral' },
      { customer_name: '윤채원', rating: 5, review_text: '사장님 서비스 최고! 항상 잘 먹고 있습니다.', menu_items: '["양념치킨","감자튀김"]', sentiment: 'positive' },
    ]
  };

  const reviews = (demoReviews[platform] || demoReviews.baemin).map((r, i) => ({
    ...r,
    platform_review_id: `${platform}_demo_${Date.now()}_${i}`,
    platform,
    store_id: storeId,
    status: 'pending',
    customer_type: Math.random() > 0.7 ? 'loyal' : Math.random() > 0.5 ? 'repeat' : 'new',
    is_repeat_customer: Math.random() > 0.5 ? 1 : 0,
    created_at: new Date().toISOString()
  }));

  return {
    success: true,
    platform,
    platform_name: platformNames[platform],
    store_id: storeId,
    reviews,
    fetched_at: new Date().toISOString(),
    count: reviews.length,
    mode: 'demo'
  };
}

function generateOperationalMockReviews(platform, storeId) {
  const platformNames = { baemin: '배달의민족', coupang_eats: '쿠팡이츠', yogiyo: '요기요' };
  const liveMockReviews = {
    baemin: [
      { customer_name: '테스트배민고객', rating: 5, review_text: '실전 운영 테스트 리뷰입니다. 배민 라이브 수집 경로 검증용이에요.', menu_items: '["양념치킨","콜라"]', sentiment: 'positive' },
      { customer_name: '배민운영체크', rating: 4, review_text: '운영 전환 검증 중입니다. 실제 연동처럼 리뷰가 들어오는지 확인합니다.', menu_items: '["후라이드치킨"]', sentiment: 'neutral' }
    ],
    coupang_eats: [
      { customer_name: '쿠팡라이브', rating: 5, review_text: '쿠팡이츠 운영 모드 리뷰 동기화 테스트입니다.', menu_items: '["제육덮밥"]', sentiment: 'positive' }
    ],
    yogiyo: [
      { customer_name: '요기요라이브', rating: 3, review_text: '요기요 실제 수집 경로를 테스트하는 샘플 리뷰입니다.', menu_items: '["떡볶이","튀김"]', sentiment: 'neutral' }
    ]
  };

  const reviews = (liveMockReviews[platform] || liveMockReviews.baemin).map((review, index) => ({
    ...review,
    platform_review_id: `${platform}_live_${Date.now()}_${index}`,
    platform,
    store_id: storeId,
    status: 'pending',
    customer_type: index === 0 ? 'repeat' : 'new',
    is_repeat_customer: index === 0 ? 1 : 0,
    created_at: new Date().toISOString()
  }));

  return {
    success: true,
    platform,
    platform_name: platformNames[platform],
    store_id: storeId,
    reviews,
    fetched_at: new Date().toISOString(),
    count: reviews.length,
    mode: 'live-mock'
  };
}

// ============================================================
//  SYNC WITH WEBAPP
// ============================================================
async function syncReviewsToWebapp(reviews, storeId) {
  try {
    const response = await fetch(`${WEBAPP_API}/crawler/reviews`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(CRAWLER_SHARED_SECRET ? { 'X-Crawler-Secret': CRAWLER_SHARED_SECRET } : {})
      },
      body: JSON.stringify({ reviews, store_id: storeId })
    });
    return await response.json();
  } catch (error) {
    console.error('Webapp sync error:', error.message);
    return { success: false, error: error.message };
  }
}

// ============================================================
//  EXPRESS API ROUTES
// ============================================================

// 서버 상태
app.get('/health', (req, res) => {
  const sessions = {};
  for (const [platform, session] of platformSessions) {
    sessions[platform] = {
      loggedIn: session.loggedIn,
      lastActivity: session.lastActivity ? new Date(session.lastActivity).toISOString() : null
    };
  }
  
  res.json({
    status: 'ok',
    mode: CRAWLER_TEST_MODE ? 'test' : 'live',
    uptime: process.uptime(),
    timestamp: new Date().toISOString(),
    browser: globalBrowser?.isConnected() ? 'connected' : 'disconnected',
    sessions,
    jobs: {
      active: crawlJobs.filter(j => j.status === 'running').length,
      completed: jobHistory.filter(j => j.status === 'completed').length,
      failed: jobHistory.filter(j => j.status === 'failed').length
    }
  });
});

// 플랫폼 로그인
app.post('/login', async (req, res) => {
  const { platform, email, password } = req.body;
  
  if (!platform || !PLATFORMS[platform]) {
    return res.status(400).json({ error: 'Invalid platform', supported: Object.keys(PLATFORMS) });
  }
  if (!email || !password) {
    return res.status(400).json({ error: 'Email and password required' });
  }

  try {
    const result = await loginPlatform(platform, { email, password });
    res.json(result);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// 리뷰 수집
app.post('/fetch-reviews', async (req, res) => {
  const { platform, store_id, demo } = req.body;
  
  if (!platform || !PLATFORMS[platform]) {
    return res.status(400).json({ error: 'Invalid platform', supported: Object.keys(PLATFORMS) });
  }

  const jobId = `fetch_${platform}_${Date.now()}`;
  const job = { id: jobId, type: 'fetch', platform, store_id, status: 'running', started_at: new Date().toISOString() };
  crawlJobs.push(job);

  try {
    const result = await fetchReviews(platform, store_id || 1, { demo: demo !== false });
    job.status = 'completed';
    job.completed_at = new Date().toISOString();
    job.result = { count: result.count };
    jobHistory.push({ ...job });
    
    res.json(result);
  } catch (error) {
    job.status = 'failed';
    job.error = error.message;
    jobHistory.push({ ...job });
    res.status(500).json({ error: error.message });
  } finally {
    const idx = crawlJobs.indexOf(job);
    if (idx > -1) crawlJobs.splice(idx, 1);
  }
});

// 전체 플랫폼 리뷰 수집 (일괄)
app.post('/fetch-all', async (req, res) => {
  const { store_id, demo } = req.body;
  const results = {};

  for (const platform of Object.keys(PLATFORMS)) {
    try {
      results[platform] = await fetchReviews(platform, store_id || 1, { demo: demo !== false });
    } catch (error) {
      results[platform] = { success: false, error: error.message };
    }
  }

  const totalReviews = Object.values(results).reduce((sum, r) => sum + (r.count || 0), 0);
  
  res.json({
    success: true,
    total_reviews: totalReviews,
    platforms: results,
    fetched_at: new Date().toISOString()
  });
});

// 답변 게시
app.post('/post-reply', async (req, res) => {
  const { platform, review_id, reply_text } = req.body;
  
  if (!platform || !review_id || !reply_text) {
    return res.status(400).json({ error: 'platform, review_id, reply_text required' });
  }

  try {
    const result = await postReply(platform, review_id, reply_text);
    res.json(result);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// 세션 상태
app.get('/sessions', (req, res) => {
  const sessions = {};
  for (const [platform, session] of platformSessions) {
    sessions[platform] = {
      name: PLATFORMS[platform]?.name || platform,
      loggedIn: session.loggedIn,
      lastActivity: session.lastActivity ? new Date(session.lastActivity).toISOString() : null
    };
  }
  res.json({ sessions });
});

// 작업 이력
app.get('/jobs', (req, res) => {
  res.json({
    active: crawlJobs,
    history: jobHistory.slice(-50).reverse()
  });
});

// 지원 플랫폼 목록
app.get('/platforms', (req, res) => {
  const platforms = Object.entries(PLATFORMS).map(([key, config]) => ({
    id: key,
    name: config.name,
    loginUrl: config.loginUrl,
    reviewUrl: config.reviewUrl,
    session: platformSessions.has(key) ? {
      loggedIn: platformSessions.get(key).loggedIn,
      lastActivity: platformSessions.get(key).lastActivity
    } : null
  }));
  res.json({ platforms });
});

// 리뷰를 웹앱 DB에 동기화
app.post('/sync-to-webapp', async (req, res) => {
  const { platform, store_id, demo } = req.body;
  
  try {
    // 1. 리뷰 수집
    const fetchResult = await fetchReviews(platform || 'baemin', store_id || 1, { demo: demo !== false });
    
    if (!fetchResult.success || !fetchResult.reviews.length) {
      return res.json({ success: false, message: 'No reviews to sync', ...fetchResult });
    }

    // 2. 웹앱 API로 전송
    const syncResult = await syncReviewsToWebapp(fetchResult.reviews, store_id || 1);
    
    res.json({
      success: true,
      fetched: fetchResult.count,
      synced: syncResult,
      platform: fetchResult.platform
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// ============================================================
//  SCHEDULED SYNC (자동 동기화)
// ============================================================
let syncInterval = null;

app.post('/auto-sync/start', (req, res) => {
  const { interval_minutes } = req.body;
  const intervalMs = (interval_minutes || 30) * 60 * 1000;
  
  if (syncInterval) clearInterval(syncInterval);
  
  syncInterval = setInterval(async () => {
    console.log('[Auto-Sync] 자동 리뷰 수집 시작...');
    for (const platform of Object.keys(PLATFORMS)) {
      try {
        const result = await fetchReviews(platform, 1, { demo: true });
        console.log(`[Auto-Sync] ${platform}: ${result.count}건 수집`);
      } catch (e) {
        console.error(`[Auto-Sync] ${platform} 실패:`, e.message);
      }
    }
  }, intervalMs);

  res.json({ 
    success: true, 
    message: `자동 동기화 시작: ${interval_minutes || 30}분 간격`,
    interval_ms: intervalMs
  });
});

app.post('/auto-sync/stop', (req, res) => {
  if (syncInterval) {
    clearInterval(syncInterval);
    syncInterval = null;
  }
  res.json({ success: true, message: '자동 동기화 중지' });
});

// ============================================================
//  CLEANUP
// ============================================================
async function cleanup() {
  console.log('Cleaning up browser sessions...');
  for (const [platform, session] of platformSessions) {
    try {
      await session.context?.close();
    } catch (e) {}
  }
  try {
    await globalBrowser?.close();
  } catch (e) {}
}

process.on('SIGINT', async () => { await cleanup(); process.exit(0); });
process.on('SIGTERM', async () => { await cleanup(); process.exit(0); });

// ============================================================
//  START SERVER
// ============================================================
app.listen(PORT, '0.0.0.0', () => {
  const runtimeMode = CRAWLER_TEST_MODE
    ? 'Operational Test (브라우저 없는 운영 경로 검증)'
    : 'Demo/Live (실제 크롤링은 크리덴셜 필요)'

  console.log(`
  ╔══════════════════════════════════════════════╗
  ║   Respondio Crawler Server                   ║
  ║   Port: ${PORT}                                 ║
  ║   Webapp API: ${WEBAPP_API}           ║
  ║   Platforms: ${Object.keys(PLATFORMS).join(', ')}   ║
  ║   Mode: ${runtimeMode}    ║
  ╚══════════════════════════════════════════════╝
  `);
});

```

## FILE: crawler/package-lock.json
```json
{
  "name": "crawler",
  "version": "1.0.0",
  "lockfileVersion": 3,
  "requires": true,
  "packages": {
    "": {
      "name": "crawler",
      "version": "1.0.0",
      "license": "ISC",
      "dependencies": {
        "cors": "^2.8.6",
        "dotenv": "^17.3.1",
        "express": "^5.2.1",
        "playwright": "^1.58.2"
      }
    },
    "node_modules/accepts": {
      "version": "2.0.0",
      "resolved": "https://registry.npmjs.org/accepts/-/accepts-2.0.0.tgz",
      "integrity": "sha512-5cvg6CtKwfgdmVqY1WIiXKc3Q1bkRqGLi+2W/6ao+6Y7gu/RCwRuAhGEzh5B4KlszSuTLgZYuqFqo5bImjNKng==",
      "license": "MIT",
      "dependencies": {
        "mime-types": "^3.0.0",
        "negotiator": "^1.0.0"
      },
      "engines": {
        "node": ">= 0.6"
      }
    },
    "node_modules/body-parser": {
      "version": "2.2.2",
      "resolved": "https://registry.npmjs.org/body-parser/-/body-parser-2.2.2.tgz",
      "integrity": "sha512-oP5VkATKlNwcgvxi0vM0p/D3n2C3EReYVX+DNYs5TjZFn/oQt2j+4sVJtSMr18pdRr8wjTcBl6LoV+FUwzPmNA==",
      "license": "MIT",
      "dependencies": {
        "bytes": "^3.1.2",
        "content-type": "^1.0.5",
        "debug": "^4.4.3",
        "http-errors": "^2.0.0",
        "iconv-lite": "^0.7.0",
        "on-finished": "^2.4.1",
        "qs": "^6.14.1",
        "raw-body": "^3.0.1",
        "type-is": "^2.0.1"
      },
      "engines": {
        "node": ">=18"
      },
      "funding": {
        "type": "opencollective",
        "url": "https://opencollective.com/express"
      }
    },
    "node_modules/bytes": {
      "version": "3.1.2",
      "resolved": "https://registry.npmjs.org/bytes/-/bytes-3.1.2.tgz",
      "integrity": "sha512-/Nf7TyzTx6S3yRJObOAV7956r8cr2+Oj8AC5dt8wSP3BQAoeX58NoHyCU8P8zGkNXStjTSi6fzO6F0pBdcYbEg==",
      "license": "MIT",
      "engines": {
        "node": ">= 0.8"
      }
    },
    "node_modules/call-bind-apply-helpers": {
      "version": "1.0.2",
      "resolved": "https://registry.npmjs.org/call-bind-apply-helpers/-/call-bind-apply-helpers-1.0.2.tgz",
      "integrity": "sha512-Sp1ablJ0ivDkSzjcaJdxEunN5/XvksFJ2sMBFfq6x0ryhQV/2b/KwFe21cMpmHtPOSij8K99/wSfoEuTObmuMQ==",
      "license": "MIT",
      "dependencies": {
        "es-errors": "^1.3.0",
        "function-bind": "^1.1.2"
      },
      "engines": {
        "node": ">= 0.4"
      }
    },
    "node_modules/call-bound": {
      "version": "1.0.4",
      "resolved": "https://registry.npmjs.org/call-bound/-/call-bound-1.0.4.tgz",
      "integrity": "sha512-+ys997U96po4Kx/ABpBCqhA9EuxJaQWDQg7295H4hBphv3IZg0boBKuwYpt4YXp6MZ5AmZQnU/tyMTlRpaSejg==",
      "license": "MIT",
      "dependencies": {
        "call-bind-apply-helpers": "^1.0.2",
        "get-intrinsic": "^1.3.0"
      },
      "engines": {
        "node": ">= 0.4"
      },
      "funding": {
        "url": "https://github.com/sponsors/ljharb"
      }
    },
    "node_modules/content-disposition": {
      "version": "1.0.1",
      "resolved": "https://registry.npmjs.org/content-disposition/-/content-disposition-1.0.1.tgz",
      "integrity": "sha512-oIXISMynqSqm241k6kcQ5UwttDILMK4BiurCfGEREw6+X9jkkpEe5T9FZaApyLGGOnFuyMWZpdolTXMtvEJ08Q==",
      "license": "MIT",
      "engines": {
        "node": ">=18"
      },
      "funding": {
        "type": "opencollective",
        "url": "https://opencollective.com/express"
      }
    },
    "node_modules/content-type": {
      "version": "1.0.5",
      "resolved": "https://registry.npmjs.org/content-type/-/content-type-1.0.5.tgz",
      "integrity": "sha512-nTjqfcBFEipKdXCv4YDQWCfmcLZKm81ldF0pAopTvyrFGVbcR6P/VAAd5G7N+0tTr8QqiU0tFadD6FK4NtJwOA==",
      "license": "MIT",
      "engines": {
        "node": ">= 0.6"
      }
    },
    "node_modules/cookie": {
      "version": "0.7.2",
      "resolved": "https://registry.npmjs.org/cookie/-/cookie-0.7.2.tgz",
      "integrity": "sha512-yki5XnKuf750l50uGTllt6kKILY4nQ1eNIQatoXEByZ5dWgnKqbnqmTrBE5B4N7lrMJKQ2ytWMiTO2o0v6Ew/w==",
      "license": "MIT",
      "engines": {
        "node": ">= 0.6"
      }
    },
    "node_modules/cookie-signature": {
      "version": "1.2.2",
      "resolved": "https://registry.npmjs.org/cookie-signature/-/cookie-signature-1.2.2.tgz",
      "integrity": "sha512-D76uU73ulSXrD1UXF4KE2TMxVVwhsnCgfAyTg9k8P6KGZjlXKrOLe4dJQKI3Bxi5wjesZoFXJWElNWBjPZMbhg==",
      "license": "MIT",
      "engines": {
        "node": ">=6.6.0"
      }
    },
    "node_modules/cors": {
      "version": "2.8.6",
      "resolved": "https://registry.npmjs.org/cors/-/cors-2.8.6.tgz",
      "integrity": "sha512-tJtZBBHA6vjIAaF6EnIaq6laBBP9aq/Y3ouVJjEfoHbRBcHBAHYcMh/w8LDrk2PvIMMq8gmopa5D4V8RmbrxGw==",
      "license": "MIT",
      "dependencies": {
        "object-assign": "^4",
        "vary": "^1"
      },
      "engines": {
        "node": ">= 0.10"
      },
      "funding": {
        "type": "opencollective",
        "url": "https://opencollective.com/express"
      }
    },
    "node_modules/debug": {
      "version": "4.4.3",
      "resolved": "https://registry.npmjs.org/debug/-/debug-4.4.3.tgz",
      "integrity": "sha512-RGwwWnwQvkVfavKVt22FGLw+xYSdzARwm0ru6DhTVA3umU5hZc28V3kO4stgYryrTlLpuvgI9GiijltAjNbcqA==",
      "license": "MIT",
      "dependencies": {
        "ms": "^2.1.3"
      },
      "engines": {
        "node": ">=6.0"
      },
      "peerDependenciesMeta": {
        "supports-color": {
          "optional": true
        }
      }
    },
    "node_modules/depd": {
      "version": "2.0.0",
      "resolved": "https://registry.npmjs.org/depd/-/depd-2.0.0.tgz",
      "integrity": "sha512-g7nH6P6dyDioJogAAGprGpCtVImJhpPk/roCzdb3fIh61/s/nPsfR6onyMwkCAR/OlC3yBC0lESvUoQEAssIrw==",
      "license": "MIT",
      "engines": {
        "node": ">= 0.8"
      }
    },
    "node_modules/dotenv": {
      "version": "17.3.1",
      "resolved": "https://registry.npmjs.org/dotenv/-/dotenv-17.3.1.tgz",
      "integrity": "sha512-IO8C/dzEb6O3F9/twg6ZLXz164a2fhTnEWb95H23Dm4OuN+92NmEAlTrupP9VW6Jm3sO26tQlqyvyi4CsnY9GA==",
      "license": "BSD-2-Clause",
      "engines": {
        "node": ">=12"
      },
      "funding": {
        "url": "https://dotenvx.com"
      }
    },
    "node_modules/dunder-proto": {
      "version": "1.0.1",
      "resolved": "https://registry.npmjs.org/dunder-proto/-/dunder-proto-1.0.1.tgz",
      "integrity": "sha512-KIN/nDJBQRcXw0MLVhZE9iQHmG68qAVIBg9CqmUYjmQIhgij9U5MFvrqkUL5FbtyyzZuOeOt0zdeRe4UY7ct+A==",
      "license": "MIT",
      "dependencies": {
        "call-bind-apply-helpers": "^1.0.1",
        "es-errors": "^1.3.0",
        "gopd": "^1.2.0"
      },
      "engines": {
        "node": ">= 0.4"
      }
    },
    "node_modules/ee-first": {
      "version": "1.1.1",
      "resolved": "https://registry.npmjs.org/ee-first/-/ee-first-1.1.1.tgz",
      "integrity": "sha512-WMwm9LhRUo+WUaRN+vRuETqG89IgZphVSNkdFgeb6sS/E4OrDIN7t48CAewSHXc6C8lefD8KKfr5vY61brQlow==",
      "license": "MIT"
    },
    "node_modules/encodeurl": {
      "version": "2.0.0",
      "resolved": "https://registry.npmjs.org/encodeurl/-/encodeurl-2.0.0.tgz",
      "integrity": "sha512-Q0n9HRi4m6JuGIV1eFlmvJB7ZEVxu93IrMyiMsGC0lrMJMWzRgx6WGquyfQgZVb31vhGgXnfmPNNXmxnOkRBrg==",
      "license": "MIT",
      "engines": {
        "node": ">= 0.8"
      }
    },
    "node_modules/es-define-property": {
      "version": "1.0.1",
      "resolved": "https://registry.npmjs.org/es-define-property/-/es-define-property-1.0.1.tgz",
      "integrity": "sha512-e3nRfgfUZ4rNGL232gUgX06QNyyez04KdjFrF+LTRoOXmrOgFKDg4BCdsjW8EnT69eqdYGmRpJwiPVYNrCaW3g==",
      "license": "MIT",
      "engines": {
        "node": ">= 0.4"
      }
    },
    "node_modules/es-errors": {
      "version": "1.3.0",
      "resolved": "https://registry.npmjs.org/es-errors/-/es-errors-1.3.0.tgz",
      "integrity": "sha512-Zf5H2Kxt2xjTvbJvP2ZWLEICxA6j+hAmMzIlypy4xcBg1vKVnx89Wy0GbS+kf5cwCVFFzdCFh2XSCFNULS6csw==",
      "license": "MIT",
      "engines": {
        "node": ">= 0.4"
      }
    },
    "node_modules/es-object-atoms": {
      "version": "1.1.1",
      "resolved": "https://registry.npmjs.org/es-object-atoms/-/es-object-atoms-1.1.1.tgz",
      "integrity": "sha512-FGgH2h8zKNim9ljj7dankFPcICIK9Cp5bm+c2gQSYePhpaG5+esrLODihIorn+Pe6FGJzWhXQotPv73jTaldXA==",
      "license": "MIT",
      "dependencies": {
        "es-errors": "^1.3.0"
      },
      "engines": {
        "node": ">= 0.4"
      }
    },
    "node_modules/escape-html": {
      "version": "1.0.3",
      "resolved": "https://registry.npmjs.org/escape-html/-/escape-html-1.0.3.tgz",
      "integrity": "sha512-NiSupZ4OeuGwr68lGIeym/ksIZMJodUGOSCZ/FSnTxcrekbvqrgdUxlJOMpijaKZVjAJrWrGs/6Jy8OMuyj9ow==",
      "license": "MIT"
    },
    "node_modules/etag": {
      "version": "1.8.1",
      "resolved": "https://registry.npmjs.org/etag/-/etag-1.8.1.tgz",
      "integrity": "sha512-aIL5Fx7mawVa300al2BnEE4iNvo1qETxLrPI/o05L7z6go7fCw1J6EQmbK4FmJ2AS7kgVF/KEZWufBfdClMcPg==",
      "license": "MIT",
      "engines": {
        "node": ">= 0.6"
      }
    },
    "node_modules/express": {
      "version": "5.2.1",
      "resolved": "https://registry.npmjs.org/express/-/express-5.2.1.tgz",
      "integrity": "sha512-hIS4idWWai69NezIdRt2xFVofaF4j+6INOpJlVOLDO8zXGpUVEVzIYk12UUi2JzjEzWL3IOAxcTubgz9Po0yXw==",
      "license": "MIT",
      "dependencies": {
        "accepts": "^2.0.0",
        "body-parser": "^2.2.1",
        "content-disposition": "^1.0.0",
        "content-type": "^1.0.5",
        "cookie": "^0.7.1",
        "cookie-signature": "^1.2.1",
        "debug": "^4.4.0",
        "depd": "^2.0.0",
        "encodeurl": "^2.0.0",
        "escape-html": "^1.0.3",
        "etag": "^1.8.1",
        "finalhandler": "^2.1.0",
        "fresh": "^2.0.0",
        "http-errors": "^2.0.0",
        "merge-descriptors": "^2.0.0",
        "mime-types": "^3.0.0",
        "on-finished": "^2.4.1",
        "once": "^1.4.0",
        "parseurl": "^1.3.3",
        "proxy-addr": "^2.0.7",
        "qs": "^6.14.0",
        "range-parser": "^1.2.1",
        "router": "^2.2.0",
        "send": "^1.1.0",
        "serve-static": "^2.2.0",
        "statuses": "^2.0.1",
        "type-is": "^2.0.1",
        "vary": "^1.1.2"
      },
      "engines": {
        "node": ">= 18"
      },
      "funding": {
        "type": "opencollective",
        "url": "https://opencollective.com/express"
      }
    },
    "node_modules/finalhandler": {
      "version": "2.1.1",
      "resolved": "https://registry.npmjs.org/finalhandler/-/finalhandler-2.1.1.tgz",
      "integrity": "sha512-S8KoZgRZN+a5rNwqTxlZZePjT/4cnm0ROV70LedRHZ0p8u9fRID0hJUZQpkKLzro8LfmC8sx23bY6tVNxv8pQA==",
      "license": "MIT",
      "dependencies": {
        "debug": "^4.4.0",
        "encodeurl": "^2.0.0",
        "escape-html": "^1.0.3",
        "on-finished": "^2.4.1",
        "parseurl": "^1.3.3",
        "statuses": "^2.0.1"
      },
      "engines": {
        "node": ">= 18.0.0"
      },
      "funding": {
        "type": "opencollective",
        "url": "https://opencollective.com/express"
      }
    },
    "node_modules/forwarded": {
      "version": "0.2.0",
      "resolved": "https://registry.npmjs.org/forwarded/-/forwarded-0.2.0.tgz",
      "integrity": "sha512-buRG0fpBtRHSTCOASe6hD258tEubFoRLb4ZNA6NxMVHNw2gOcwHo9wyablzMzOA5z9xA9L1KNjk/Nt6MT9aYow==",
      "license": "MIT",
      "engines": {
        "node": ">= 0.6"
      }
    },
    "node_modules/fresh": {
      "version": "2.0.0",
      "resolved": "https://registry.npmjs.org/fresh/-/fresh-2.0.0.tgz",
      "integrity": "sha512-Rx/WycZ60HOaqLKAi6cHRKKI7zxWbJ31MhntmtwMoaTeF7XFH9hhBp8vITaMidfljRQ6eYWCKkaTK+ykVJHP2A==",
      "license": "MIT",
      "engines": {
        "node": ">= 0.8"
      }
    },
    "node_modules/fsevents": {
      "version": "2.3.2",
      "resolved": "https://registry.npmjs.org/fsevents/-/fsevents-2.3.2.tgz",
      "integrity": "sha512-xiqMQR4xAeHTuB9uWm+fFRcIOgKBMiOBP+eXiyT7jsgVCq1bkVygt00oASowB7EdtpOHaaPgKt812P9ab+DDKA==",
      "hasInstallScript": true,
      "license": "MIT",
      "optional": true,
      "os": [
        "darwin"
      ],
      "engines": {
        "node": "^8.16.0 || ^10.6.0 || >=11.0.0"
      }
    },
    "node_modules/function-bind": {
      "version": "1.1.2",
      "resolved": "https://registry.npmjs.org/function-bind/-/function-bind-1.1.2.tgz",
      "integrity": "sha512-7XHNxH7qX9xG5mIwxkhumTox/MIRNcOgDrxWsMt2pAr23WHp6MrRlN7FBSFpCpr+oVO0F744iUgR82nJMfG2SA==",
      "license": "MIT",
      "funding": {
        "url": "https://github.com/sponsors/ljharb"
      }
    },
    "node_modules/get-intrinsic": {
      "version": "1.3.0",
      "resolved": "https://registry.npmjs.org/get-intrinsic/-/get-intrinsic-1.3.0.tgz",
      "integrity": "sha512-9fSjSaos/fRIVIp+xSJlE6lfwhES7LNtKaCBIamHsjr2na1BiABJPo0mOjjz8GJDURarmCPGqaiVg5mfjb98CQ==",
      "license": "MIT",
      "dependencies": {
        "call-bind-apply-helpers": "^1.0.2",
        "es-define-property": "^1.0.1",
        "es-errors": "^1.3.0",
        "es-object-atoms": "^1.1.1",
        "function-bind": "^1.1.2",
        "get-proto": "^1.0.1",
        "gopd": "^1.2.0",
        "has-symbols": "^1.1.0",
        "hasown": "^2.0.2",
        "math-intrinsics": "^1.1.0"
      },
      "engines": {
        "node": ">= 0.4"
      },
      "funding": {
        "url": "https://github.com/sponsors/ljharb"
      }
    },
    "node_modules/get-proto": {
      "version": "1.0.1",
      "resolved": "https://registry.npmjs.org/get-proto/-/get-proto-1.0.1.tgz",
      "integrity": "sha512-sTSfBjoXBp89JvIKIefqw7U2CCebsc74kiY6awiGogKtoSGbgjYE/G/+l9sF3MWFPNc9IcoOC4ODfKHfxFmp0g==",
      "license": "MIT",
      "dependencies": {
        "dunder-proto": "^1.0.1",
        "es-object-atoms": "^1.0.0"
      },
      "engines": {
        "node": ">= 0.4"
      }
    },
    "node_modules/gopd": {
      "version": "1.2.0",
      "resolved": "https://registry.npmjs.org/gopd/-/gopd-1.2.0.tgz",
      "integrity": "sha512-ZUKRh6/kUFoAiTAtTYPZJ3hw9wNxx+BIBOijnlG9PnrJsCcSjs1wyyD6vJpaYtgnzDrKYRSqf3OO6Rfa93xsRg==",
      "license": "MIT",
      "engines": {
        "node": ">= 0.4"
      },
      "funding": {
        "url": "https://github.com/sponsors/ljharb"
      }
    },
    "node_modules/has-symbols": {
      "version": "1.1.0",
      "resolved": "https://registry.npmjs.org/has-symbols/-/has-symbols-1.1.0.tgz",
      "integrity": "sha512-1cDNdwJ2Jaohmb3sg4OmKaMBwuC48sYni5HUw2DvsC8LjGTLK9h+eb1X6RyuOHe4hT0ULCW68iomhjUoKUqlPQ==",
      "license": "MIT",
      "engines": {
        "node": ">= 0.4"
      },
      "funding": {
        "url": "https://github.com/sponsors/ljharb"
      }
    },
    "node_modules/hasown": {
      "version": "2.0.2",
      "resolved": "https://registry.npmjs.org/hasown/-/hasown-2.0.2.tgz",
      "integrity": "sha512-0hJU9SCPvmMzIBdZFqNPXWa6dqh7WdH0cII9y+CyS8rG3nL48Bclra9HmKhVVUHyPWNH5Y7xDwAB7bfgSjkUMQ==",
      "license": "MIT",
      "dependencies": {
        "function-bind": "^1.1.2"
      },
      "engines": {
        "node": ">= 0.4"
      }
    },
    "node_modules/http-errors": {
      "version": "2.0.1",
      "resolved": "https://registry.npmjs.org/http-errors/-/http-errors-2.0.1.tgz",
      "integrity": "sha512-4FbRdAX+bSdmo4AUFuS0WNiPz8NgFt+r8ThgNWmlrjQjt1Q7ZR9+zTlce2859x4KSXrwIsaeTqDoKQmtP8pLmQ==",
      "license": "MIT",
      "dependencies": {
        "depd": "~2.0.0",
        "inherits": "~2.0.4",
        "setprototypeof": "~1.2.0",
        "statuses": "~2.0.2",
        "toidentifier": "~1.0.1"
      },
      "engines": {
        "node": ">= 0.8"
      },
      "funding": {
        "type": "opencollective",
        "url": "https://opencollective.com/express"
      }
    },
    "node_modules/iconv-lite": {
      "version": "0.7.2",
      "resolved": "https://registry.npmjs.org/iconv-lite/-/iconv-lite-0.7.2.tgz",
      "integrity": "sha512-im9DjEDQ55s9fL4EYzOAv0yMqmMBSZp6G0VvFyTMPKWxiSBHUj9NW/qqLmXUwXrrM7AvqSlTCfvqRb0cM8yYqw==",
      "license": "MIT",
      "dependencies": {
        "safer-buffer": ">= 2.1.2 < 3.0.0"
      },
      "engines": {
        "node": ">=0.10.0"
      },
      "funding": {
        "type": "opencollective",
        "url": "https://opencollective.com/express"
      }
    },
    "node_modules/inherits": {
      "version": "2.0.4",
      "resolved": "https://registry.npmjs.org/inherits/-/inherits-2.0.4.tgz",
      "integrity": "sha512-k/vGaX4/Yla3WzyMCvTQOXYeIHvqOKtnqBduzTHpzpQZzAskKMhZ2K+EnBiSM9zGSoIFeMpXKxa4dYeZIQqewQ==",
      "license": "ISC"
    },
    "node_modules/ipaddr.js": {
      "version": "1.9.1",
      "resolved": "https://registry.npmjs.org/ipaddr.js/-/ipaddr.js-1.9.1.tgz",
      "integrity": "sha512-0KI/607xoxSToH7GjN1FfSbLoU0+btTicjsQSWQlh/hZykN8KpmMf7uYwPW3R+akZ6R/w18ZlXSHBYXiYUPO3g==",
      "license": "MIT",
      "engines": {
        "node": ">= 0.10"
      }
    },
    "node_modules/is-promise": {
      "version": "4.0.0",
      "resolved": "https://registry.npmjs.org/is-promise/-/is-promise-4.0.0.tgz",
      "integrity": "sha512-hvpoI6korhJMnej285dSg6nu1+e6uxs7zG3BYAm5byqDsgJNWwxzM6z6iZiAgQR4TJ30JmBTOwqZUw3WlyH3AQ==",
      "license": "MIT"
    },
    "node_modules/math-intrinsics": {
      "version": "1.1.0",
      "resolved": "https://registry.npmjs.org/math-intrinsics/-/math-intrinsics-1.1.0.tgz",
      "integrity": "sha512-/IXtbwEk5HTPyEwyKX6hGkYXxM9nbj64B+ilVJnC/R6B0pH5G4V3b0pVbL7DBj4tkhBAppbQUlf6F6Xl9LHu1g==",
      "license": "MIT",
      "engines": {
        "node": ">= 0.4"
      }
    },
    "node_modules/media-typer": {
      "version": "1.1.0",
      "resolved": "https://registry.npmjs.org/media-typer/-/media-typer-1.1.0.tgz",
      "integrity": "sha512-aisnrDP4GNe06UcKFnV5bfMNPBUw4jsLGaWwWfnH3v02GnBuXX2MCVn5RbrWo0j3pczUilYblq7fQ7Nw2t5XKw==",
      "license": "MIT",
      "engines": {
        "node": ">= 0.8"
      }
    },
    "node_modules/merge-descriptors": {
      "version": "2.0.0",
      "resolved": "https://registry.npmjs.org/merge-descriptors/-/merge-descriptors-2.0.0.tgz",
      "integrity": "sha512-Snk314V5ayFLhp3fkUREub6WtjBfPdCPY1Ln8/8munuLuiYhsABgBVWsozAG+MWMbVEvcdcpbi9R7ww22l9Q3g==",
      "license": "MIT",
      "engines": {
        "node": ">=18"
      },
      "funding": {
        "url": "https://github.com/sponsors/sindresorhus"
      }
    },
    "node_modules/mime-db": {
      "version": "1.54.0",
      "resolved": "https://registry.npmjs.org/mime-db/-/mime-db-1.54.0.tgz",
      "integrity": "sha512-aU5EJuIN2WDemCcAp2vFBfp/m4EAhWJnUNSSw0ixs7/kXbd6Pg64EmwJkNdFhB8aWt1sH2CTXrLxo/iAGV3oPQ==",
      "license": "MIT",
      "engines": {
        "node": ">= 0.6"
      }
    },
    "node_modules/mime-types": {
      "version": "3.0.2",
      "resolved": "https://registry.npmjs.org/mime-types/-/mime-types-3.0.2.tgz",
      "integrity": "sha512-Lbgzdk0h4juoQ9fCKXW4by0UJqj+nOOrI9MJ1sSj4nI8aI2eo1qmvQEie4VD1glsS250n15LsWsYtCugiStS5A==",
      "license": "MIT",
      "dependencies": {
        "mime-db": "^1.54.0"
      },
      "engines": {
        "node": ">=18"
      },
      "funding": {
        "type": "opencollective",
        "url": "https://opencollective.com/express"
      }
    },
    "node_modules/ms": {
      "version": "2.1.3",
      "resolved": "https://registry.npmjs.org/ms/-/ms-2.1.3.tgz",
      "integrity": "sha512-6FlzubTLZG3J2a/NVCAleEhjzq5oxgHyaCU9yYXvcLsvoVaHJq/s5xXI6/XXP6tz7R9xAOtHnSO/tXtF3WRTlA==",
      "license": "MIT"
    },
    "node_modules/negotiator": {
      "version": "1.0.0",
      "resolved": "https://registry.npmjs.org/negotiator/-/negotiator-1.0.0.tgz",
      "integrity": "sha512-8Ofs/AUQh8MaEcrlq5xOX0CQ9ypTF5dl78mjlMNfOK08fzpgTHQRQPBxcPlEtIw0yRpws+Zo/3r+5WRby7u3Gg==",
      "license": "MIT",
      "engines": {
        "node": ">= 0.6"
      }
    },
    "node_modules/object-assign": {
      "version": "4.1.1",
      "resolved": "https://registry.npmjs.org/object-assign/-/object-assign-4.1.1.tgz",
      "integrity": "sha512-rJgTQnkUnH1sFw8yT6VSU3zD3sWmu6sZhIseY8VX+GRu3P6F7Fu+JNDoXfklElbLJSnc3FUQHVe4cU5hj+BcUg==",
      "license": "MIT",
      "engines": {
        "node": ">=0.10.0"
      }
    },
    "node_modules/object-inspect": {
      "version": "1.13.4",
      "resolved": "https://registry.npmjs.org/object-inspect/-/object-inspect-1.13.4.tgz",
      "integrity": "sha512-W67iLl4J2EXEGTbfeHCffrjDfitvLANg0UlX3wFUUSTx92KXRFegMHUVgSqE+wvhAbi4WqjGg9czysTV2Epbew==",
      "license": "MIT",
      "engines": {
        "node": ">= 0.4"
      },
      "funding": {
        "url": "https://github.com/sponsors/ljharb"
      }
    },
    "node_modules/on-finished": {
      "version": "2.4.1",
      "resolved": "https://registry.npmjs.org/on-finished/-/on-finished-2.4.1.tgz",
      "integrity": "sha512-oVlzkg3ENAhCk2zdv7IJwd/QUD4z2RxRwpkcGY8psCVcCYZNq4wYnVWALHM+brtuJjePWiYF/ClmuDr8Ch5+kg==",
      "license": "MIT",
      "dependencies": {
        "ee-first": "1.1.1"
      },
      "engines": {
        "node": ">= 0.8"
      }
    },
    "node_modules/once": {
      "version": "1.4.0",
      "resolved": "https://registry.npmjs.org/once/-/once-1.4.0.tgz",
      "integrity": "sha512-lNaJgI+2Q5URQBkccEKHTQOPaXdUxnZZElQTZY0MFUAuaEqe1E+Nyvgdz/aIyNi6Z9MzO5dv1H8n58/GELp3+w==",
      "license": "ISC",
      "dependencies": {
        "wrappy": "1"
      }
    },
    "node_modules/parseurl": {
      "version": "1.3.3",
      "resolved": "https://registry.npmjs.org/parseurl/-/parseurl-1.3.3.tgz",
      "integrity": "sha512-CiyeOxFT/JZyN5m0z9PfXw4SCBJ6Sygz1Dpl0wqjlhDEGGBP1GnsUVEL0p63hoG1fcj3fHynXi9NYO4nWOL+qQ==",
      "license": "MIT",
      "engines": {
        "node": ">= 0.8"
      }
    },
    "node_modules/path-to-regexp": {
      "version": "8.3.0",
      "resolved": "https://registry.npmjs.org/path-to-regexp/-/path-to-regexp-8.3.0.tgz",
      "integrity": "sha512-7jdwVIRtsP8MYpdXSwOS0YdD0Du+qOoF/AEPIt88PcCFrZCzx41oxku1jD88hZBwbNUIEfpqvuhjFaMAqMTWnA==",
      "license": "MIT",
      "funding": {
        "type": "opencollective",
        "url": "https://opencollective.com/express"
      }
    },
    "node_modules/playwright": {
      "version": "1.58.2",
      "resolved": "https://registry.npmjs.org/playwright/-/playwright-1.58.2.tgz",
      "integrity": "sha512-vA30H8Nvkq/cPBnNw4Q8TWz1EJyqgpuinBcHET0YVJVFldr8JDNiU9LaWAE1KqSkRYazuaBhTpB5ZzShOezQ6A==",
      "license": "Apache-2.0",
      "dependencies": {
        "playwright-core": "1.58.2"
      },
      "bin": {
        "playwright": "cli.js"
      },
      "engines": {
        "node": ">=18"
      },
      "optionalDependencies": {
        "fsevents": "2.3.2"
      }
    },
    "node_modules/playwright-core": {
      "version": "1.58.2",
      "resolved": "https://registry.npmjs.org/playwright-core/-/playwright-core-1.58.2.tgz",
      "integrity": "sha512-yZkEtftgwS8CsfYo7nm0KE8jsvm6i/PTgVtB8DL726wNf6H2IMsDuxCpJj59KDaxCtSnrWan2AeDqM7JBaultg==",
      "license": "Apache-2.0",
      "bin": {
        "playwright-core": "cli.js"
      },
      "engines": {
        "node": ">=18"
      }
    },
    "node_modules/proxy-addr": {
      "version": "2.0.7",
      "resolved": "https://registry.npmjs.org/proxy-addr/-/proxy-addr-2.0.7.tgz",
      "integrity": "sha512-llQsMLSUDUPT44jdrU/O37qlnifitDP+ZwrmmZcoSKyLKvtZxpyV0n2/bD/N4tBAAZ/gJEdZU7KMraoK1+XYAg==",
      "license": "MIT",
      "dependencies": {
        "forwarded": "0.2.0",
        "ipaddr.js": "1.9.1"
      },
      "engines": {
        "node": ">= 0.10"
      }
    },
    "node_modules/qs": {
      "version": "6.15.0",
      "resolved": "https://registry.npmjs.org/qs/-/qs-6.15.0.tgz",
      "integrity": "sha512-mAZTtNCeetKMH+pSjrb76NAM8V9a05I9aBZOHztWy/UqcJdQYNsf59vrRKWnojAT9Y+GbIvoTBC++CPHqpDBhQ==",
      "license": "BSD-3-Clause",
      "dependencies": {
        "side-channel": "^1.1.0"
      },
      "engines": {
        "node": ">=0.6"
      },
      "funding": {
        "url": "https://github.com/sponsors/ljharb"
      }
    },
    "node_modules/range-parser": {
      "version": "1.2.1",
      "resolved": "https://registry.npmjs.org/range-parser/-/range-parser-1.2.1.tgz",
      "integrity": "sha512-Hrgsx+orqoygnmhFbKaHE6c296J+HTAQXoxEF6gNupROmmGJRoyzfG3ccAveqCBrwr/2yxQ5BVd/GTl5agOwSg==",
      "license": "MIT",
      "engines": {
        "node": ">= 0.6"
      }
    },
    "node_modules/raw-body": {
      "version": "3.0.2",
      "resolved": "https://registry.npmjs.org/raw-body/-/raw-body-3.0.2.tgz",
      "integrity": "sha512-K5zQjDllxWkf7Z5xJdV0/B0WTNqx6vxG70zJE4N0kBs4LovmEYWJzQGxC9bS9RAKu3bgM40lrd5zoLJ12MQ5BA==",
      "license": "MIT",
      "dependencies": {
        "bytes": "~3.1.2",
        "http-errors": "~2.0.1",
        "iconv-lite": "~0.7.0",
        "unpipe": "~1.0.0"
      },
      "engines": {
        "node": ">= 0.10"
      }
    },
    "node_modules/router": {
      "version": "2.2.0",
      "resolved": "https://registry.npmjs.org/router/-/router-2.2.0.tgz",
      "integrity": "sha512-nLTrUKm2UyiL7rlhapu/Zl45FwNgkZGaCpZbIHajDYgwlJCOzLSk+cIPAnsEqV955GjILJnKbdQC1nVPz+gAYQ==",
      "license": "MIT",
      "dependencies": {
        "debug": "^4.4.0",
        "depd": "^2.0.0",
        "is-promise": "^4.0.0",
        "parseurl": "^1.3.3",
        "path-to-regexp": "^8.0.0"
      },
      "engines": {
        "node": ">= 18"
      }
    },
    "node_modules/safer-buffer": {
      "version": "2.1.2",
      "resolved": "https://registry.npmjs.org/safer-buffer/-/safer-buffer-2.1.2.tgz",
      "integrity": "sha512-YZo3K82SD7Riyi0E1EQPojLz7kpepnSQI9IyPbHHg1XXXevb5dJI7tpyN2ADxGcQbHG7vcyRHk0cbwqcQriUtg==",
      "license": "MIT"
    },
    "node_modules/send": {
      "version": "1.2.1",
      "resolved": "https://registry.npmjs.org/send/-/send-1.2.1.tgz",
      "integrity": "sha512-1gnZf7DFcoIcajTjTwjwuDjzuz4PPcY2StKPlsGAQ1+YH20IRVrBaXSWmdjowTJ6u8Rc01PoYOGHXfP1mYcZNQ==",
      "license": "MIT",
      "dependencies": {
        "debug": "^4.4.3",
        "encodeurl": "^2.0.0",
        "escape-html": "^1.0.3",
        "etag": "^1.8.1",
        "fresh": "^2.0.0",
        "http-errors": "^2.0.1",
        "mime-types": "^3.0.2",
        "ms": "^2.1.3",
        "on-finished": "^2.4.1",
        "range-parser": "^1.2.1",
        "statuses": "^2.0.2"
      },
      "engines": {
        "node": ">= 18"
      },
      "funding": {
        "type": "opencollective",
        "url": "https://opencollective.com/express"
      }
    },
    "node_modules/serve-static": {
      "version": "2.2.1",
      "resolved": "https://registry.npmjs.org/serve-static/-/serve-static-2.2.1.tgz",
      "integrity": "sha512-xRXBn0pPqQTVQiC8wyQrKs2MOlX24zQ0POGaj0kultvoOCstBQM5yvOhAVSUwOMjQtTvsPWoNCHfPGwaaQJhTw==",
      "license": "MIT",
      "dependencies": {
        "encodeurl": "^2.0.0",
        "escape-html": "^1.0.3",
        "parseurl": "^1.3.3",
        "send": "^1.2.0"
      },
      "engines": {
        "node": ">= 18"
      },
      "funding": {
        "type": "opencollective",
        "url": "https://opencollective.com/express"
      }
    },
    "node_modules/setprototypeof": {
      "version": "1.2.0",
      "resolved": "https://registry.npmjs.org/setprototypeof/-/setprototypeof-1.2.0.tgz",
      "integrity": "sha512-E5LDX7Wrp85Kil5bhZv46j8jOeboKq5JMmYM3gVGdGH8xFpPWXUMsNrlODCrkoxMEeNi/XZIwuRvY4XNwYMJpw==",
      "license": "ISC"
    },
    "node_modules/side-channel": {
      "version": "1.1.0",
      "resolved": "https://registry.npmjs.org/side-channel/-/side-channel-1.1.0.tgz",
      "integrity": "sha512-ZX99e6tRweoUXqR+VBrslhda51Nh5MTQwou5tnUDgbtyM0dBgmhEDtWGP/xbKn6hqfPRHujUNwz5fy/wbbhnpw==",
      "license": "MIT",
      "dependencies": {
        "es-errors": "^1.3.0",
        "object-inspect": "^1.13.3",
        "side-channel-list": "^1.0.0",
        "side-channel-map": "^1.0.1",
        "side-channel-weakmap": "^1.0.2"
      },
      "engines": {
        "node": ">= 0.4"
      },
      "funding": {
        "url": "https://github.com/sponsors/ljharb"
      }
    },
    "node_modules/side-channel-list": {
      "version": "1.0.0",
      "resolved": "https://registry.npmjs.org/side-channel-list/-/side-channel-list-1.0.0.tgz",
      "integrity": "sha512-FCLHtRD/gnpCiCHEiJLOwdmFP+wzCmDEkc9y7NsYxeF4u7Btsn1ZuwgwJGxImImHicJArLP4R0yX4c2KCrMrTA==",
      "license": "MIT",
      "dependencies": {
        "es-errors": "^1.3.0",
        "object-inspect": "^1.13.3"
      },
      "engines": {
        "node": ">= 0.4"
      },
      "funding": {
        "url": "https://github.com/sponsors/ljharb"
      }
    },
    "node_modules/side-channel-map": {
      "version": "1.0.1",
      "resolved": "https://registry.npmjs.org/side-channel-map/-/side-channel-map-1.0.1.tgz",
      "integrity": "sha512-VCjCNfgMsby3tTdo02nbjtM/ewra6jPHmpThenkTYh8pG9ucZ/1P8So4u4FGBek/BjpOVsDCMoLA/iuBKIFXRA==",
      "license": "MIT",
      "dependencies": {
        "call-bound": "^1.0.2",
        "es-errors": "^1.3.0",
        "get-intrinsic": "^1.2.5",
        "object-inspect": "^1.13.3"
      },
      "engines": {
        "node": ">= 0.4"
      },
      "funding": {
        "url": "https://github.com/sponsors/ljharb"
      }
    },
    "node_modules/side-channel-weakmap": {
      "version": "1.0.2",
      "resolved": "https://registry.npmjs.org/side-channel-weakmap/-/side-channel-weakmap-1.0.2.tgz",
      "integrity": "sha512-WPS/HvHQTYnHisLo9McqBHOJk2FkHO/tlpvldyrnem4aeQp4hai3gythswg6p01oSoTl58rcpiFAjF2br2Ak2A==",
      "license": "MIT",
      "dependencies": {
        "call-bound": "^1.0.2",
        "es-errors": "^1.3.0",
        "get-intrinsic": "^1.2.5",
        "object-inspect": "^1.13.3",
        "side-channel-map": "^1.0.1"
      },
      "engines": {
        "node": ">= 0.4"
      },
      "funding": {
        "url": "https://github.com/sponsors/ljharb"
      }
    },
    "node_modules/statuses": {
      "version": "2.0.2",
      "resolved": "https://registry.npmjs.org/statuses/-/statuses-2.0.2.tgz",
      "integrity": "sha512-DvEy55V3DB7uknRo+4iOGT5fP1slR8wQohVdknigZPMpMstaKJQWhwiYBACJE3Ul2pTnATihhBYnRhZQHGBiRw==",
      "license": "MIT",
      "engines": {
        "node": ">= 0.8"
      }
    },
    "node_modules/toidentifier": {
      "version": "1.0.1",
      "resolved": "https://registry.npmjs.org/toidentifier/-/toidentifier-1.0.1.tgz",
      "integrity": "sha512-o5sSPKEkg/DIQNmH43V0/uerLrpzVedkUh8tGNvaeXpfpuwjKenlSox/2O/BTlZUtEe+JG7s5YhEz608PlAHRA==",
      "license": "MIT",
      "engines": {
        "node": ">=0.6"
      }
    },
    "node_modules/type-is": {
      "version": "2.0.1",
      "resolved": "https://registry.npmjs.org/type-is/-/type-is-2.0.1.tgz",
      "integrity": "sha512-OZs6gsjF4vMp32qrCbiVSkrFmXtG/AZhY3t0iAMrMBiAZyV9oALtXO8hsrHbMXF9x6L3grlFuwW2oAz7cav+Gw==",
      "license": "MIT",
      "dependencies": {
        "content-type": "^1.0.5",
        "media-typer": "^1.1.0",
        "mime-types": "^3.0.0"
      },
      "engines": {
        "node": ">= 0.6"
      }
    },
    "node_modules/unpipe": {
      "version": "1.0.0",
      "resolved": "https://registry.npmjs.org/unpipe/-/unpipe-1.0.0.tgz",
      "integrity": "sha512-pjy2bYhSsufwWlKwPc+l3cN7+wuJlK6uz0YdJEOlQDbl6jo/YlPi4mb8agUkVC8BF7V8NuzeyPNqRksA3hztKQ==",
      "license": "MIT",
      "engines": {
        "node": ">= 0.8"
      }
    },
    "node_modules/vary": {
      "version": "1.1.2",
      "resolved": "https://registry.npmjs.org/vary/-/vary-1.1.2.tgz",
      "integrity": "sha512-BNGbWLfd0eUPabhkXUVm0j8uuvREyTh5ovRa/dyow/BqAbZJyC+5fU+IzQOzmAKzYqYRAISoRhdQr3eIZ/PXqg==",
      "license": "MIT",
      "engines": {
        "node": ">= 0.8"
      }
    },
    "node_modules/wrappy": {
      "version": "1.0.2",
      "resolved": "https://registry.npmjs.org/wrappy/-/wrappy-1.0.2.tgz",
      "integrity": "sha512-l4Sp/DRseor9wL6EvV2+TuQn63dMkPjZ/sp9XkghTEbV9KlPS1xUsZ3u7/IQO4wxtcFB4bgpQPRcR3QCvezPcQ==",
      "license": "ISC"
    }
  }
}

```

## FILE: crawler/package.json
```json
{
  "name": "crawler",
  "version": "1.0.0",
  "main": "index.js",
  "scripts": {
    "test": "echo \"Error: no test specified\" && exit 1"
  },
  "keywords": [],
  "author": "",
  "license": "ISC",
  "description": "",
  "dependencies": {
    "cors": "^2.8.6",
    "dotenv": "^17.3.1",
    "express": "^5.2.1",
    "playwright": "^1.58.2"
  }
}

```

## FILE: docs/PRODUCTION_SETUP_GUIDE.md
```md
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

```

## FILE: ecosystem.config.cjs
```js
module.exports = {
  apps: [
    {
      name: 'respondio',
      script: 'npx',
      args: 'wrangler pages dev dist --d1=respondio-production --local --ip 0.0.0.0 --port 3000',
      env: {
        NODE_ENV: 'development',
        PORT: 3000,
        HOME: '/tmp/respondio-wrangler-home'
      },
      watch: false,
      instances: 1,
      exec_mode: 'fork'
    }
  ]
}

```

## FILE: migrations/0001_initial_schema.sql
```sql
-- Respondio: AI 배달 리뷰 자동답변 SaaS DB Schema

-- 사용자 테이블
CREATE TABLE IF NOT EXISTS users (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  email TEXT UNIQUE NOT NULL,
  password_hash TEXT NOT NULL,
  name TEXT NOT NULL,
  role TEXT DEFAULT 'owner' CHECK(role IN ('owner','admin','super_admin')),
  status TEXT DEFAULT 'active' CHECK(status IN ('active','suspended','deleted')),
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- 매장 테이블
CREATE TABLE IF NOT EXISTS stores (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL,
  store_name TEXT NOT NULL,
  business_number_masked TEXT,
  reply_style TEXT DEFAULT 'friendly' CHECK(reply_style IN ('friendly','polite','casual','custom')),
  reply_tone_sample TEXT,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (user_id) REFERENCES users(id)
);

-- 플랫폼 연결 테이블
CREATE TABLE IF NOT EXISTS store_platform_connections (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  store_id INTEGER NOT NULL,
  platform TEXT NOT NULL CHECK(platform IN ('baemin','coupang_eats','yogiyo')),
  connection_status TEXT DEFAULT 'connected' CHECK(connection_status IN ('connected','disconnected','error')),
  platform_store_id TEXT,
  last_sync_at DATETIME,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (store_id) REFERENCES stores(id),
  UNIQUE(store_id, platform)
);

-- 리뷰 테이블
CREATE TABLE IF NOT EXISTS reviews (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  store_id INTEGER NOT NULL,
  platform TEXT NOT NULL CHECK(platform IN ('baemin','coupang_eats','yogiyo')),
  platform_review_id TEXT,
  customer_name TEXT,
  rating REAL,
  review_text TEXT,
  menu_items TEXT, -- JSON array
  order_date DATETIME,
  sentiment TEXT CHECK(sentiment IN ('positive','neutral','negative')),
  status TEXT DEFAULT 'pending' CHECK(status IN ('pending','generated','approved','posted','failed')),
  is_repeat_customer INTEGER DEFAULT 0,
  customer_type TEXT DEFAULT 'new' CHECK(customer_type IN ('new','repeat','loyal')),
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (store_id) REFERENCES stores(id)
);

-- AI 답변 후보 테이블
CREATE TABLE IF NOT EXISTS reply_candidates (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  review_id INTEGER NOT NULL,
  reply_text TEXT NOT NULL,
  style_type TEXT,
  quality_score REAL DEFAULT 0,
  is_selected INTEGER DEFAULT 0,
  regenerate_count INTEGER DEFAULT 0,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (review_id) REFERENCES reviews(id)
);

-- 최종 답변 테이블
CREATE TABLE IF NOT EXISTS replies (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  review_id INTEGER NOT NULL,
  candidate_id INTEGER,
  final_reply_text TEXT NOT NULL,
  posted_at DATETIME,
  post_status TEXT DEFAULT 'pending' CHECK(post_status IN ('pending','posted','failed')),
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (review_id) REFERENCES reviews(id),
  FOREIGN KEY (candidate_id) REFERENCES reply_candidates(id)
);

-- 고객 테이블
CREATE TABLE IF NOT EXISTS customers (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  store_id INTEGER NOT NULL,
  customer_key TEXT NOT NULL,
  customer_name TEXT,
  customer_type TEXT DEFAULT 'new' CHECK(customer_type IN ('new','repeat','loyal')),
  order_count INTEGER DEFAULT 1,
  last_order_at DATETIME,
  favorite_menu TEXT,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (store_id) REFERENCES stores(id),
  UNIQUE(store_id, customer_key)
);

-- 금칙어 테이블
CREATE TABLE IF NOT EXISTS banned_words (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  word TEXT NOT NULL UNIQUE,
  created_by INTEGER,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- 요금제 테이블
CREATE TABLE IF NOT EXISTS plans (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  slug TEXT UNIQUE NOT NULL,
  price INTEGER NOT NULL, -- 원 단위
  review_limit INTEGER NOT NULL,
  features TEXT, -- JSON
  is_active INTEGER DEFAULT 1,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- 구독 테이블
CREATE TABLE IF NOT EXISTS subscriptions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL,
  plan_id INTEGER NOT NULL,
  status TEXT DEFAULT 'active' CHECK(status IN ('active','cancelled','expired','past_due')),
  current_period_start DATETIME,
  current_period_end DATETIME,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (user_id) REFERENCES users(id),
  FOREIGN KEY (plan_id) REFERENCES plans(id)
);

-- 결제 테이블
CREATE TABLE IF NOT EXISTS payments (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL,
  subscription_id INTEGER,
  amount INTEGER NOT NULL,
  currency TEXT DEFAULT 'KRW',
  status TEXT DEFAULT 'pending' CHECK(status IN ('pending','completed','failed','refunded')),
  payment_method TEXT,
  transaction_id TEXT,
  paid_at DATETIME,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (user_id) REFERENCES users(id),
  FOREIGN KEY (subscription_id) REFERENCES subscriptions(id)
);

-- 결제 수단 테이블
CREATE TABLE IF NOT EXISTS payment_methods (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL,
  type TEXT DEFAULT 'card',
  card_last4 TEXT,
  card_brand TEXT,
  expiry_date TEXT,
  is_default INTEGER DEFAULT 0,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (user_id) REFERENCES users(id)
);

-- 대시보드 일별 요약 테이블
CREATE TABLE IF NOT EXISTS dashboard_daily_summaries (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  store_id INTEGER NOT NULL,
  summary_date DATE NOT NULL,
  total_reviews INTEGER DEFAULT 0,
  responded_reviews INTEGER DEFAULT 0,
  avg_rating REAL DEFAULT 0,
  positive_count INTEGER DEFAULT 0,
  negative_count INTEGER DEFAULT 0,
  neutral_count INTEGER DEFAULT 0,
  repeat_customer_count INTEGER DEFAULT 0,
  new_customer_count INTEGER DEFAULT 0,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (store_id) REFERENCES stores(id),
  UNIQUE(store_id, summary_date)
);

-- 작업 로그 테이블
CREATE TABLE IF NOT EXISTS job_logs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  job_type TEXT NOT NULL,
  status TEXT DEFAULT 'pending' CHECK(status IN ('pending','processing','completed','failed','dlq')),
  payload TEXT,
  error_message TEXT,
  retry_count INTEGER DEFAULT 0,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  completed_at DATETIME
);

-- 인덱스
CREATE INDEX IF NOT EXISTS idx_reviews_store_id ON reviews(store_id);
CREATE INDEX IF NOT EXISTS idx_reviews_status ON reviews(status);
CREATE INDEX IF NOT EXISTS idx_reviews_platform ON reviews(platform);
CREATE INDEX IF NOT EXISTS idx_reviews_sentiment ON reviews(sentiment);
CREATE INDEX IF NOT EXISTS idx_customers_store_id ON customers(store_id);
CREATE INDEX IF NOT EXISTS idx_subscriptions_user_id ON subscriptions(user_id);
CREATE INDEX IF NOT EXISTS idx_payments_user_id ON payments(user_id);
CREATE INDEX IF NOT EXISTS idx_dashboard_store_date ON dashboard_daily_summaries(store_id, summary_date);
CREATE INDEX IF NOT EXISTS idx_job_logs_status ON job_logs(status);

```

## FILE: migrations/0002_auth_sessions.sql
```sql
-- Refresh token sessions
CREATE TABLE IF NOT EXISTS auth_sessions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL,
  token_hash TEXT NOT NULL UNIQUE,
  expires_at DATETIME NOT NULL,
  revoked_at DATETIME,
  last_used_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  user_agent TEXT,
  ip_address TEXT,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (user_id) REFERENCES users(id)
);

CREATE INDEX IF NOT EXISTS idx_auth_sessions_user_id ON auth_sessions(user_id);
CREATE INDEX IF NOT EXISTS idx_auth_sessions_expires_at ON auth_sessions(expires_at);

```

## FILE: migrations/0003_billing_and_platform_connections.sql
```sql
ALTER TABLE payments ADD COLUMN provider TEXT DEFAULT 'manual';
ALTER TABLE payments ADD COLUMN plan_id INTEGER;
ALTER TABLE payments ADD COLUMN payment_id TEXT;
ALTER TABLE payments ADD COLUMN raw_payload TEXT;
ALTER TABLE payments ADD COLUMN updated_at DATETIME DEFAULT CURRENT_TIMESTAMP;

ALTER TABLE subscriptions ADD COLUMN cancel_at_period_end INTEGER DEFAULT 0;
ALTER TABLE subscriptions ADD COLUMN updated_at DATETIME DEFAULT CURRENT_TIMESTAMP;

ALTER TABLE store_platform_connections ADD COLUMN login_email TEXT;
ALTER TABLE store_platform_connections ADD COLUMN login_password_encrypted TEXT;
ALTER TABLE store_platform_connections ADD COLUMN last_error TEXT;
ALTER TABLE store_platform_connections ADD COLUMN updated_at DATETIME DEFAULT CURRENT_TIMESTAMP;

CREATE UNIQUE INDEX IF NOT EXISTS idx_payments_payment_id ON payments(payment_id);

CREATE TABLE IF NOT EXISTS payment_webhook_events (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  provider TEXT NOT NULL,
  event_id TEXT NOT NULL UNIQUE,
  event_type TEXT,
  payload TEXT,
  processed_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

```

## FILE: package-lock.json
```json
{
  "name": "webapp",
  "lockfileVersion": 3,
  "requires": true,
  "packages": {
    "": {
      "name": "webapp",
      "dependencies": {
        "@portone/server-sdk": "^0.15.0",
        "hono": "^4.12.6"
      },
      "devDependencies": {
        "@cloudflare/workers-types": "^4.20260310.1",
        "@hono/vite-build": "^1.2.0",
        "@hono/vite-dev-server": "^0.18.2",
        "playwright": "^1.58.2",
        "vite": "^6.3.5",
        "wrangler": "^4.4.0"
      }
    },
    "node_modules/@cloudflare/kv-asset-handler": {
      "version": "0.4.2",
      "resolved": "https://registry.npmjs.org/@cloudflare/kv-asset-handler/-/kv-asset-handler-0.4.2.tgz",
      "integrity": "sha512-SIOD2DxrRRwQ+jgzlXCqoEFiKOFqaPjhnNTGKXSRLvp1HiOvapLaFG2kEr9dYQTYe8rKrd9uvDUzmAITeNyaHQ==",
      "dev": true,
      "license": "MIT OR Apache-2.0",
      "engines": {
        "node": ">=18.0.0"
      }
    },
    "node_modules/@cloudflare/unenv-preset": {
      "version": "2.15.0",
      "resolved": "https://registry.npmjs.org/@cloudflare/unenv-preset/-/unenv-preset-2.15.0.tgz",
      "integrity": "sha512-EGYmJaGZKWl+X8tXxcnx4v2bOZSjQeNI5dWFeXivgX9+YCT69AkzHHwlNbVpqtEUTbew8eQurpyOpeN8fg00nw==",
      "dev": true,
      "license": "MIT OR Apache-2.0",
      "peerDependencies": {
        "unenv": "2.0.0-rc.24",
        "workerd": "1.20260301.1 || ~1.20260302.1 || ~1.20260303.1 || ~1.20260304.1 || >1.20260305.0 <2.0.0-0"
      },
      "peerDependenciesMeta": {
        "workerd": {
          "optional": true
        }
      }
    },
    "node_modules/@cloudflare/workerd-darwin-64": {
      "version": "1.20260301.1",
      "resolved": "https://registry.npmjs.org/@cloudflare/workerd-darwin-64/-/workerd-darwin-64-1.20260301.1.tgz",
      "integrity": "sha512-+kJvwociLrvy1JV9BAvoSVsMEIYD982CpFmo/yMEvBwxDIjltYsLTE8DLi0mCkGsQ8Ygidv2fD9wavzXeiY7OQ==",
      "cpu": [
        "x64"
      ],
      "dev": true,
      "license": "Apache-2.0",
      "optional": true,
      "os": [
        "darwin"
      ],
      "engines": {
        "node": ">=16"
      }
    },
    "node_modules/@cloudflare/workerd-darwin-arm64": {
      "version": "1.20260301.1",
      "resolved": "https://registry.npmjs.org/@cloudflare/workerd-darwin-arm64/-/workerd-darwin-arm64-1.20260301.1.tgz",
      "integrity": "sha512-PPIetY3e67YBr9O4UhILK8nbm5TqUDl14qx4rwFNrRSBOvlzuczzbd4BqgpAtbGVFxKp1PWpjAnBvGU/OI/tLQ==",
      "cpu": [
        "arm64"
      ],
      "dev": true,
      "license": "Apache-2.0",
      "optional": true,
      "os": [
        "darwin"
      ],
      "engines": {
        "node": ">=16"
      }
    },
    "node_modules/@cloudflare/workerd-linux-64": {
      "version": "1.20260301.1",
      "resolved": "https://registry.npmjs.org/@cloudflare/workerd-linux-64/-/workerd-linux-64-1.20260301.1.tgz",
      "integrity": "sha512-Gu5vaVTZuYl3cHa+u5CDzSVDBvSkfNyuAHi6Mdfut7TTUdcb3V5CIcR/mXRSyMXzEy9YxEWIfdKMxOMBjupvYQ==",
      "cpu": [
        "x64"
      ],
      "dev": true,
      "license": "Apache-2.0",
      "optional": true,
      "os": [
        "linux"
      ],
      "engines": {
        "node": ">=16"
      }
    },
    "node_modules/@cloudflare/workerd-linux-arm64": {
      "version": "1.20260301.1",
      "resolved": "https://registry.npmjs.org/@cloudflare/workerd-linux-arm64/-/workerd-linux-arm64-1.20260301.1.tgz",
      "integrity": "sha512-igL1pkyCXW6GiGpjdOAvqMi87UW0LMc/+yIQe/CSzuZJm5GzXoAMrwVTkCFnikk6JVGELrM5x0tGYlxa0sk5Iw==",
      "cpu": [
        "arm64"
      ],
      "dev": true,
      "license": "Apache-2.0",
      "optional": true,
      "os": [
        "linux"
      ],
      "engines": {
        "node": ">=16"
      }
    },
    "node_modules/@cloudflare/workerd-windows-64": {
      "version": "1.20260301.1",
      "resolved": "https://registry.npmjs.org/@cloudflare/workerd-windows-64/-/workerd-windows-64-1.20260301.1.tgz",
      "integrity": "sha512-Q0wMJ4kcujXILwQKQFc1jaYamVsNvjuECzvRrTI8OxGFMx2yq9aOsswViE4X1gaS2YQQ5u0JGwuGi5WdT1Lt7A==",
      "cpu": [
        "x64"
      ],
      "dev": true,
      "license": "Apache-2.0",
      "optional": true,
      "os": [
        "win32"
      ],
      "engines": {
        "node": ">=16"
      }
    },
    "node_modules/@cloudflare/workers-types": {
      "version": "4.20260310.1",
      "resolved": "https://registry.npmjs.org/@cloudflare/workers-types/-/workers-types-4.20260310.1.tgz",
      "integrity": "sha512-Cg4gyGDtfimNMgBr2h06aGR5Bt8puUbblyzPNZN55mBfVYCTWwQiUd9PrbkcoddKrWHlsy0ACH/16dAeGf5BQg==",
      "dev": true,
      "license": "MIT OR Apache-2.0"
    },
    "node_modules/@cspotcode/source-map-support": {
      "version": "0.8.1",
      "resolved": "https://registry.npmjs.org/@cspotcode/source-map-support/-/source-map-support-0.8.1.tgz",
      "integrity": "sha512-IchNf6dN4tHoMFIn/7OE8LWZ19Y6q/67Bmf6vnGREv8RSbBVb9LPJxEcnwrcwX6ixSvaiGoomAUvu4YSxXrVgw==",
      "dev": true,
      "license": "MIT",
      "dependencies": {
        "@jridgewell/trace-mapping": "0.3.9"
      },
      "engines": {
        "node": ">=12"
      }
    },
    "node_modules/@emnapi/runtime": {
      "version": "1.8.1",
      "resolved": "https://registry.npmjs.org/@emnapi/runtime/-/runtime-1.8.1.tgz",
      "integrity": "sha512-mehfKSMWjjNol8659Z8KxEMrdSJDDot5SXMq00dM8BN4o+CLNXQ0xH2V7EchNHV4RmbZLmmPdEaXZc5H2FXmDg==",
      "dev": true,
      "license": "MIT",
      "optional": true,
      "dependencies": {
        "tslib": "^2.4.0"
      }
    },
    "node_modules/@esbuild/aix-ppc64": {
      "version": "0.25.12",
      "resolved": "https://registry.npmjs.org/@esbuild/aix-ppc64/-/aix-ppc64-0.25.12.tgz",
      "integrity": "sha512-Hhmwd6CInZ3dwpuGTF8fJG6yoWmsToE+vYgD4nytZVxcu1ulHpUQRAB1UJ8+N1Am3Mz4+xOByoQoSZf4D+CpkA==",
      "cpu": [
        "ppc64"
      ],
      "dev": true,
      "license": "MIT",
      "optional": true,
      "os": [
        "aix"
      ],
      "engines": {
        "node": ">=18"
      }
    },
    "node_modules/@esbuild/android-arm": {
      "version": "0.25.12",
      "resolved": "https://registry.npmjs.org/@esbuild/android-arm/-/android-arm-0.25.12.tgz",
      "integrity": "sha512-VJ+sKvNA/GE7Ccacc9Cha7bpS8nyzVv0jdVgwNDaR4gDMC/2TTRc33Ip8qrNYUcpkOHUT5OZ0bUcNNVZQ9RLlg==",
      "cpu": [
        "arm"
      ],
      "dev": true,
      "license": "MIT",
      "optional": true,
      "os": [
        "android"
      ],
      "engines": {
        "node": ">=18"
      }
    },
    "node_modules/@esbuild/android-arm64": {
      "version": "0.25.12",
      "resolved": "https://registry.npmjs.org/@esbuild/android-arm64/-/android-arm64-0.25.12.tgz",
      "integrity": "sha512-6AAmLG7zwD1Z159jCKPvAxZd4y/VTO0VkprYy+3N2FtJ8+BQWFXU+OxARIwA46c5tdD9SsKGZ/1ocqBS/gAKHg==",
      "cpu": [
        "arm64"
      ],
      "dev": true,
      "license": "MIT",
      "optional": true,
      "os": [
        "android"
      ],
      "engines": {
        "node": ">=18"
      }
    },
    "node_modules/@esbuild/android-x64": {
      "version": "0.25.12",
      "resolved": "https://registry.npmjs.org/@esbuild/android-x64/-/android-x64-0.25.12.tgz",
      "integrity": "sha512-5jbb+2hhDHx5phYR2By8GTWEzn6I9UqR11Kwf22iKbNpYrsmRB18aX/9ivc5cabcUiAT/wM+YIZ6SG9QO6a8kg==",
      "cpu": [
        "x64"
      ],
      "dev": true,
      "license": "MIT",
      "optional": true,
      "os": [
        "android"
      ],
      "engines": {
        "node": ">=18"
      }
    },
    "node_modules/@esbuild/darwin-arm64": {
      "version": "0.25.12",
      "resolved": "https://registry.npmjs.org/@esbuild/darwin-arm64/-/darwin-arm64-0.25.12.tgz",
      "integrity": "sha512-N3zl+lxHCifgIlcMUP5016ESkeQjLj/959RxxNYIthIg+CQHInujFuXeWbWMgnTo4cp5XVHqFPmpyu9J65C1Yg==",
      "cpu": [
        "arm64"
      ],
      "dev": true,
      "license": "MIT",
      "optional": true,
      "os": [
        "darwin"
      ],
      "engines": {
        "node": ">=18"
      }
    },
    "node_modules/@esbuild/darwin-x64": {
      "version": "0.25.12",
      "resolved": "https://registry.npmjs.org/@esbuild/darwin-x64/-/darwin-x64-0.25.12.tgz",
      "integrity": "sha512-HQ9ka4Kx21qHXwtlTUVbKJOAnmG1ipXhdWTmNXiPzPfWKpXqASVcWdnf2bnL73wgjNrFXAa3yYvBSd9pzfEIpA==",
      "cpu": [
        "x64"
      ],
      "dev": true,
      "license": "MIT",
      "optional": true,
      "os": [
        "darwin"
      ],
      "engines": {
        "node": ">=18"
      }
    },
    "node_modules/@esbuild/freebsd-arm64": {
      "version": "0.25.12",
      "resolved": "https://registry.npmjs.org/@esbuild/freebsd-arm64/-/freebsd-arm64-0.25.12.tgz",
      "integrity": "sha512-gA0Bx759+7Jve03K1S0vkOu5Lg/85dou3EseOGUes8flVOGxbhDDh/iZaoek11Y8mtyKPGF3vP8XhnkDEAmzeg==",
      "cpu": [
        "arm64"
      ],
      "dev": true,
      "license": "MIT",
      "optional": true,
      "os": [
        "freebsd"
      ],
      "engines": {
        "node": ">=18"
      }
    },
    "node_modules/@esbuild/freebsd-x64": {
      "version": "0.25.12",
      "resolved": "https://registry.npmjs.org/@esbuild/freebsd-x64/-/freebsd-x64-0.25.12.tgz",
      "integrity": "sha512-TGbO26Yw2xsHzxtbVFGEXBFH0FRAP7gtcPE7P5yP7wGy7cXK2oO7RyOhL5NLiqTlBh47XhmIUXuGciXEqYFfBQ==",
      "cpu": [
        "x64"
      ],
      "dev": true,
      "license": "MIT",
      "optional": true,
      "os": [
        "freebsd"
      ],
      "engines": {
        "node": ">=18"
      }
    },
    "node_modules/@esbuild/linux-arm": {
      "version": "0.25.12",
      "resolved": "https://registry.npmjs.org/@esbuild/linux-arm/-/linux-arm-0.25.12.tgz",
      "integrity": "sha512-lPDGyC1JPDou8kGcywY0YILzWlhhnRjdof3UlcoqYmS9El818LLfJJc3PXXgZHrHCAKs/Z2SeZtDJr5MrkxtOw==",
      "cpu": [
        "arm"
      ],
      "dev": true,
      "license": "MIT",
      "optional": true,
      "os": [
        "linux"
      ],
      "engines": {
        "node": ">=18"
      }
    },
    "node_modules/@esbuild/linux-arm64": {
      "version": "0.25.12",
      "resolved": "https://registry.npmjs.org/@esbuild/linux-arm64/-/linux-arm64-0.25.12.tgz",
      "integrity": "sha512-8bwX7a8FghIgrupcxb4aUmYDLp8pX06rGh5HqDT7bB+8Rdells6mHvrFHHW2JAOPZUbnjUpKTLg6ECyzvas2AQ==",
      "cpu": [
        "arm64"
      ],
      "dev": true,
      "license": "MIT",
      "optional": true,
      "os": [
        "linux"
      ],
      "engines": {
        "node": ">=18"
      }
    },
    "node_modules/@esbuild/linux-ia32": {
      "version": "0.25.12",
      "resolved": "https://registry.npmjs.org/@esbuild/linux-ia32/-/linux-ia32-0.25.12.tgz",
      "integrity": "sha512-0y9KrdVnbMM2/vG8KfU0byhUN+EFCny9+8g202gYqSSVMonbsCfLjUO+rCci7pM0WBEtz+oK/PIwHkzxkyharA==",
      "cpu": [
        "ia32"
      ],
      "dev": true,
      "license": "MIT",
      "optional": true,
      "os": [
        "linux"
      ],
      "engines": {
        "node": ">=18"
      }
    },
    "node_modules/@esbuild/linux-loong64": {
      "version": "0.25.12",
      "resolved": "https://registry.npmjs.org/@esbuild/linux-loong64/-/linux-loong64-0.25.12.tgz",
      "integrity": "sha512-h///Lr5a9rib/v1GGqXVGzjL4TMvVTv+s1DPoxQdz7l/AYv6LDSxdIwzxkrPW438oUXiDtwM10o9PmwS/6Z0Ng==",
      "cpu": [
        "loong64"
      ],
      "dev": true,
      "license": "MIT",
      "optional": true,
      "os": [
        "linux"
      ],
      "engines": {
        "node": ">=18"
      }
    },
    "node_modules/@esbuild/linux-mips64el": {
      "version": "0.25.12",
      "resolved": "https://registry.npmjs.org/@esbuild/linux-mips64el/-/linux-mips64el-0.25.12.tgz",
      "integrity": "sha512-iyRrM1Pzy9GFMDLsXn1iHUm18nhKnNMWscjmp4+hpafcZjrr2WbT//d20xaGljXDBYHqRcl8HnxbX6uaA/eGVw==",
      "cpu": [
        "mips64el"
      ],
      "dev": true,
      "license": "MIT",
      "optional": true,
      "os": [
        "linux"
      ],
      "engines": {
        "node": ">=18"
      }
    },
    "node_modules/@esbuild/linux-ppc64": {
      "version": "0.25.12",
      "resolved": "https://registry.npmjs.org/@esbuild/linux-ppc64/-/linux-ppc64-0.25.12.tgz",
      "integrity": "sha512-9meM/lRXxMi5PSUqEXRCtVjEZBGwB7P/D4yT8UG/mwIdze2aV4Vo6U5gD3+RsoHXKkHCfSxZKzmDssVlRj1QQA==",
      "cpu": [
        "ppc64"
      ],
      "dev": true,
      "license": "MIT",
      "optional": true,
      "os": [
        "linux"
      ],
      "engines": {
        "node": ">=18"
      }
    },
    "node_modules/@esbuild/linux-riscv64": {
      "version": "0.25.12",
      "resolved": "https://registry.npmjs.org/@esbuild/linux-riscv64/-/linux-riscv64-0.25.12.tgz",
      "integrity": "sha512-Zr7KR4hgKUpWAwb1f3o5ygT04MzqVrGEGXGLnj15YQDJErYu/BGg+wmFlIDOdJp0PmB0lLvxFIOXZgFRrdjR0w==",
      "cpu": [
        "riscv64"
      ],
      "dev": true,
      "license": "MIT",
      "optional": true,
      "os": [
        "linux"
      ],
      "engines": {
        "node": ">=18"
      }
    },
    "node_modules/@esbuild/linux-s390x": {
      "version": "0.25.12",
      "resolved": "https://registry.npmjs.org/@esbuild/linux-s390x/-/linux-s390x-0.25.12.tgz",
      "integrity": "sha512-MsKncOcgTNvdtiISc/jZs/Zf8d0cl/t3gYWX8J9ubBnVOwlk65UIEEvgBORTiljloIWnBzLs4qhzPkJcitIzIg==",
      "cpu": [
        "s390x"
      ],
      "dev": true,
      "license": "MIT",
      "optional": true,
      "os": [
        "linux"
      ],
      "engines": {
        "node": ">=18"
      }
    },
    "node_modules/@esbuild/linux-x64": {
      "version": "0.25.12",
      "resolved": "https://registry.npmjs.org/@esbuild/linux-x64/-/linux-x64-0.25.12.tgz",
      "integrity": "sha512-uqZMTLr/zR/ed4jIGnwSLkaHmPjOjJvnm6TVVitAa08SLS9Z0VM8wIRx7gWbJB5/J54YuIMInDquWyYvQLZkgw==",
      "cpu": [
        "x64"
      ],
      "dev": true,
      "license": "MIT",
      "optional": true,
      "os": [
        "linux"
      ],
      "engines": {
        "node": ">=18"
      }
    },
    "node_modules/@esbuild/netbsd-arm64": {
      "version": "0.25.12",
      "resolved": "https://registry.npmjs.org/@esbuild/netbsd-arm64/-/netbsd-arm64-0.25.12.tgz",
      "integrity": "sha512-xXwcTq4GhRM7J9A8Gv5boanHhRa/Q9KLVmcyXHCTaM4wKfIpWkdXiMog/KsnxzJ0A1+nD+zoecuzqPmCRyBGjg==",
      "cpu": [
        "arm64"
      ],
      "dev": true,
      "license": "MIT",
      "optional": true,
      "os": [
        "netbsd"
      ],
      "engines": {
        "node": ">=18"
      }
    },
    "node_modules/@esbuild/netbsd-x64": {
      "version": "0.25.12",
      "resolved": "https://registry.npmjs.org/@esbuild/netbsd-x64/-/netbsd-x64-0.25.12.tgz",
      "integrity": "sha512-Ld5pTlzPy3YwGec4OuHh1aCVCRvOXdH8DgRjfDy/oumVovmuSzWfnSJg+VtakB9Cm0gxNO9BzWkj6mtO1FMXkQ==",
      "cpu": [
        "x64"
      ],
      "dev": true,
      "license": "MIT",
      "optional": true,
      "os": [
        "netbsd"
      ],
      "engines": {
        "node": ">=18"
      }
    },
    "node_modules/@esbuild/openbsd-arm64": {
      "version": "0.25.12",
      "resolved": "https://registry.npmjs.org/@esbuild/openbsd-arm64/-/openbsd-arm64-0.25.12.tgz",
      "integrity": "sha512-fF96T6KsBo/pkQI950FARU9apGNTSlZGsv1jZBAlcLL1MLjLNIWPBkj5NlSz8aAzYKg+eNqknrUJ24QBybeR5A==",
      "cpu": [
        "arm64"
      ],
      "dev": true,
      "license": "MIT",
      "optional": true,
      "os": [
        "openbsd"
      ],
      "engines": {
        "node": ">=18"
      }
    },
    "node_modules/@esbuild/openbsd-x64": {
      "version": "0.25.12",
      "resolved": "https://registry.npmjs.org/@esbuild/openbsd-x64/-/openbsd-x64-0.25.12.tgz",
      "integrity": "sha512-MZyXUkZHjQxUvzK7rN8DJ3SRmrVrke8ZyRusHlP+kuwqTcfWLyqMOE3sScPPyeIXN/mDJIfGXvcMqCgYKekoQw==",
      "cpu": [
        "x64"
      ],
      "dev": true,
      "license": "MIT",
      "optional": true,
      "os": [
        "openbsd"
      ],
      "engines": {
        "node": ">=18"
      }
    },
    "node_modules/@esbuild/openharmony-arm64": {
      "version": "0.25.12",
      "resolved": "https://registry.npmjs.org/@esbuild/openharmony-arm64/-/openharmony-arm64-0.25.12.tgz",
      "integrity": "sha512-rm0YWsqUSRrjncSXGA7Zv78Nbnw4XL6/dzr20cyrQf7ZmRcsovpcRBdhD43Nuk3y7XIoW2OxMVvwuRvk9XdASg==",
      "cpu": [
        "arm64"
      ],
      "dev": true,
      "license": "MIT",
      "optional": true,
      "os": [
        "openharmony"
      ],
      "engines": {
        "node": ">=18"
      }
    },
    "node_modules/@esbuild/sunos-x64": {
      "version": "0.25.12",
      "resolved": "https://registry.npmjs.org/@esbuild/sunos-x64/-/sunos-x64-0.25.12.tgz",
      "integrity": "sha512-3wGSCDyuTHQUzt0nV7bocDy72r2lI33QL3gkDNGkod22EsYl04sMf0qLb8luNKTOmgF/eDEDP5BFNwoBKH441w==",
      "cpu": [
        "x64"
      ],
      "dev": true,
      "license": "MIT",
      "optional": true,
      "os": [
        "sunos"
      ],
      "engines": {
        "node": ">=18"
      }
    },
    "node_modules/@esbuild/win32-arm64": {
      "version": "0.25.12",
      "resolved": "https://registry.npmjs.org/@esbuild/win32-arm64/-/win32-arm64-0.25.12.tgz",
      "integrity": "sha512-rMmLrur64A7+DKlnSuwqUdRKyd3UE7oPJZmnljqEptesKM8wx9J8gx5u0+9Pq0fQQW8vqeKebwNXdfOyP+8Bsg==",
      "cpu": [
        "arm64"
      ],
      "dev": true,
      "license": "MIT",
      "optional": true,
      "os": [
        "win32"
      ],
      "engines": {
        "node": ">=18"
      }
    },
    "node_modules/@esbuild/win32-ia32": {
      "version": "0.25.12",
      "resolved": "https://registry.npmjs.org/@esbuild/win32-ia32/-/win32-ia32-0.25.12.tgz",
      "integrity": "sha512-HkqnmmBoCbCwxUKKNPBixiWDGCpQGVsrQfJoVGYLPT41XWF8lHuE5N6WhVia2n4o5QK5M4tYr21827fNhi4byQ==",
      "cpu": [
        "ia32"
      ],
      "dev": true,
      "license": "MIT",
      "optional": true,
      "os": [
        "win32"
      ],
      "engines": {
        "node": ">=18"
      }
    },
    "node_modules/@esbuild/win32-x64": {
      "version": "0.25.12",
      "resolved": "https://registry.npmjs.org/@esbuild/win32-x64/-/win32-x64-0.25.12.tgz",
      "integrity": "sha512-alJC0uCZpTFrSL0CCDjcgleBXPnCrEAhTBILpeAp7M/OFgoqtAetfBzX0xM00MUsVVPpVjlPuMbREqnZCXaTnA==",
      "cpu": [
        "x64"
      ],
      "dev": true,
      "license": "MIT",
      "optional": true,
      "os": [
        "win32"
      ],
      "engines": {
        "node": ">=18"
      }
    },
    "node_modules/@hono/node-server": {
      "version": "1.19.11",
      "resolved": "https://registry.npmjs.org/@hono/node-server/-/node-server-1.19.11.tgz",
      "integrity": "sha512-dr8/3zEaB+p0D2n/IUrlPF1HZm586qgJNXK1a9fhg/PzdtkK7Ksd5l312tJX2yBuALqDYBlG20QEbayqPyxn+g==",
      "dev": true,
      "license": "MIT",
      "engines": {
        "node": ">=18.14.1"
      },
      "peerDependencies": {
        "hono": "^4"
      }
    },
    "node_modules/@hono/vite-build": {
      "version": "1.10.0",
      "resolved": "https://registry.npmjs.org/@hono/vite-build/-/vite-build-1.10.0.tgz",
      "integrity": "sha512-pA6QgWAdFR2D+8ql1c7VB/ZKP++u3Al9SCdvhEB1gnTtKs7vY1poirVR3i/do/a6tWl9mfmRR5TK32oXMLHkZg==",
      "dev": true,
      "license": "MIT",
      "engines": {
        "node": ">=18.14.1"
      },
      "peerDependencies": {
        "hono": "*"
      }
    },
    "node_modules/@hono/vite-dev-server": {
      "version": "0.18.3",
      "resolved": "https://registry.npmjs.org/@hono/vite-dev-server/-/vite-dev-server-0.18.3.tgz",
      "integrity": "sha512-JztypLmq6qtQ3OAcz5vDzwXYBBymLztSbfDuNf4XTWkfppLjf6DHvYHtQZ5idOfNhUzdnbYY7/6QAKlVk6G3QQ==",
      "dev": true,
      "license": "MIT",
      "dependencies": {
        "@hono/node-server": "^1.12.0",
        "minimatch": "^9.0.3"
      },
      "engines": {
        "node": ">=18.14.1"
      },
      "peerDependencies": {
        "hono": "*",
        "miniflare": "*",
        "wrangler": "*"
      },
      "peerDependenciesMeta": {
        "hono": {
          "optional": false
        },
        "miniflare": {
          "optional": true
        },
        "wrangler": {
          "optional": true
        }
      }
    },
    "node_modules/@img/colour": {
      "version": "1.1.0",
      "resolved": "https://registry.npmjs.org/@img/colour/-/colour-1.1.0.tgz",
      "integrity": "sha512-Td76q7j57o/tLVdgS746cYARfSyxk8iEfRxewL9h4OMzYhbW4TAcppl0mT4eyqXddh6L/jwoM75mo7ixa/pCeQ==",
      "dev": true,
      "license": "MIT",
      "engines": {
        "node": ">=18"
      }
    },
    "node_modules/@img/sharp-darwin-arm64": {
      "version": "0.34.5",
      "resolved": "https://registry.npmjs.org/@img/sharp-darwin-arm64/-/sharp-darwin-arm64-0.34.5.tgz",
      "integrity": "sha512-imtQ3WMJXbMY4fxb/Ndp6HBTNVtWCUI0WdobyheGf5+ad6xX8VIDO8u2xE4qc/fr08CKG/7dDseFtn6M6g/r3w==",
      "cpu": [
        "arm64"
      ],
      "dev": true,
      "license": "Apache-2.0",
      "optional": true,
      "os": [
        "darwin"
      ],
      "engines": {
        "node": "^18.17.0 || ^20.3.0 || >=21.0.0"
      },
      "funding": {
        "url": "https://opencollective.com/libvips"
      },
      "optionalDependencies": {
        "@img/sharp-libvips-darwin-arm64": "1.2.4"
      }
    },
    "node_modules/@img/sharp-darwin-x64": {
      "version": "0.34.5",
      "resolved": "https://registry.npmjs.org/@img/sharp-darwin-x64/-/sharp-darwin-x64-0.34.5.tgz",
      "integrity": "sha512-YNEFAF/4KQ/PeW0N+r+aVVsoIY0/qxxikF2SWdp+NRkmMB7y9LBZAVqQ4yhGCm/H3H270OSykqmQMKLBhBJDEw==",
      "cpu": [
        "x64"
      ],
      "dev": true,
      "license": "Apache-2.0",
      "optional": true,
      "os": [
        "darwin"
      ],
      "engines": {
        "node": "^18.17.0 || ^20.3.0 || >=21.0.0"
      },
      "funding": {
        "url": "https://opencollective.com/libvips"
      },
      "optionalDependencies": {
        "@img/sharp-libvips-darwin-x64": "1.2.4"
      }
    },
    "node_modules/@img/sharp-libvips-darwin-arm64": {
      "version": "1.2.4",
      "resolved": "https://registry.npmjs.org/@img/sharp-libvips-darwin-arm64/-/sharp-libvips-darwin-arm64-1.2.4.tgz",
      "integrity": "sha512-zqjjo7RatFfFoP0MkQ51jfuFZBnVE2pRiaydKJ1G/rHZvnsrHAOcQALIi9sA5co5xenQdTugCvtb1cuf78Vf4g==",
      "cpu": [
        "arm64"
      ],
      "dev": true,
      "license": "LGPL-3.0-or-later",
      "optional": true,
      "os": [
        "darwin"
      ],
      "funding": {
        "url": "https://opencollective.com/libvips"
      }
    },
    "node_modules/@img/sharp-libvips-darwin-x64": {
      "version": "1.2.4",
      "resolved": "https://registry.npmjs.org/@img/sharp-libvips-darwin-x64/-/sharp-libvips-darwin-x64-1.2.4.tgz",
      "integrity": "sha512-1IOd5xfVhlGwX+zXv2N93k0yMONvUlANylbJw1eTah8K/Jtpi15KC+WSiaX/nBmbm2HxRM1gZ0nSdjSsrZbGKg==",
      "cpu": [
        "x64"
      ],
      "dev": true,
      "license": "LGPL-3.0-or-later",
      "optional": true,
      "os": [
        "darwin"
      ],
      "funding": {
        "url": "https://opencollective.com/libvips"
      }
    },
    "node_modules/@img/sharp-libvips-linux-arm": {
      "version": "1.2.4",
      "resolved": "https://registry.npmjs.org/@img/sharp-libvips-linux-arm/-/sharp-libvips-linux-arm-1.2.4.tgz",
      "integrity": "sha512-bFI7xcKFELdiNCVov8e44Ia4u2byA+l3XtsAj+Q8tfCwO6BQ8iDojYdvoPMqsKDkuoOo+X6HZA0s0q11ANMQ8A==",
      "cpu": [
        "arm"
      ],
      "dev": true,
      "license": "LGPL-3.0-or-later",
      "optional": true,
      "os": [
        "linux"
      ],
      "funding": {
        "url": "https://opencollective.com/libvips"
      }
    },
    "node_modules/@img/sharp-libvips-linux-arm64": {
      "version": "1.2.4",
      "resolved": "https://registry.npmjs.org/@img/sharp-libvips-linux-arm64/-/sharp-libvips-linux-arm64-1.2.4.tgz",
      "integrity": "sha512-excjX8DfsIcJ10x1Kzr4RcWe1edC9PquDRRPx3YVCvQv+U5p7Yin2s32ftzikXojb1PIFc/9Mt28/y+iRklkrw==",
      "cpu": [
        "arm64"
      ],
      "dev": true,
      "license": "LGPL-3.0-or-later",
      "optional": true,
      "os": [
        "linux"
      ],
      "funding": {
        "url": "https://opencollective.com/libvips"
      }
    },
    "node_modules/@img/sharp-libvips-linux-ppc64": {
      "version": "1.2.4",
      "resolved": "https://registry.npmjs.org/@img/sharp-libvips-linux-ppc64/-/sharp-libvips-linux-ppc64-1.2.4.tgz",
      "integrity": "sha512-FMuvGijLDYG6lW+b/UvyilUWu5Ayu+3r2d1S8notiGCIyYU/76eig1UfMmkZ7vwgOrzKzlQbFSuQfgm7GYUPpA==",
      "cpu": [
        "ppc64"
      ],
      "dev": true,
      "license": "LGPL-3.0-or-later",
      "optional": true,
      "os": [
        "linux"
      ],
      "funding": {
        "url": "https://opencollective.com/libvips"
      }
    },
    "node_modules/@img/sharp-libvips-linux-riscv64": {
      "version": "1.2.4",
      "resolved": "https://registry.npmjs.org/@img/sharp-libvips-linux-riscv64/-/sharp-libvips-linux-riscv64-1.2.4.tgz",
      "integrity": "sha512-oVDbcR4zUC0ce82teubSm+x6ETixtKZBh/qbREIOcI3cULzDyb18Sr/Wcyx7NRQeQzOiHTNbZFF1UwPS2scyGA==",
      "cpu": [
        "riscv64"
      ],
      "dev": true,
      "license": "LGPL-3.0-or-later",
      "optional": true,
      "os": [
        "linux"
      ],
      "funding": {
        "url": "https://opencollective.com/libvips"
      }
    },
    "node_modules/@img/sharp-libvips-linux-s390x": {
      "version": "1.2.4",
      "resolved": "https://registry.npmjs.org/@img/sharp-libvips-linux-s390x/-/sharp-libvips-linux-s390x-1.2.4.tgz",
      "integrity": "sha512-qmp9VrzgPgMoGZyPvrQHqk02uyjA0/QrTO26Tqk6l4ZV0MPWIW6LTkqOIov+J1yEu7MbFQaDpwdwJKhbJvuRxQ==",
      "cpu": [
        "s390x"
      ],
      "dev": true,
      "license": "LGPL-3.0-or-later",
      "optional": true,
      "os": [
        "linux"
      ],
      "funding": {
        "url": "https://opencollective.com/libvips"
      }
    },
    "node_modules/@img/sharp-libvips-linux-x64": {
      "version": "1.2.4",
      "resolved": "https://registry.npmjs.org/@img/sharp-libvips-linux-x64/-/sharp-libvips-linux-x64-1.2.4.tgz",
      "integrity": "sha512-tJxiiLsmHc9Ax1bz3oaOYBURTXGIRDODBqhveVHonrHJ9/+k89qbLl0bcJns+e4t4rvaNBxaEZsFtSfAdquPrw==",
      "cpu": [
        "x64"
      ],
      "dev": true,
      "license": "LGPL-3.0-or-later",
      "optional": true,
      "os": [
        "linux"
      ],
      "funding": {
        "url": "https://opencollective.com/libvips"
      }
    },
    "node_modules/@img/sharp-libvips-linuxmusl-arm64": {
      "version": "1.2.4",
      "resolved": "https://registry.npmjs.org/@img/sharp-libvips-linuxmusl-arm64/-/sharp-libvips-linuxmusl-arm64-1.2.4.tgz",
      "integrity": "sha512-FVQHuwx1IIuNow9QAbYUzJ+En8KcVm9Lk5+uGUQJHaZmMECZmOlix9HnH7n1TRkXMS0pGxIJokIVB9SuqZGGXw==",
      "cpu": [
        "arm64"
      ],
      "dev": true,
      "license": "LGPL-3.0-or-later",
      "optional": true,
      "os": [
        "linux"
      ],
      "funding": {
        "url": "https://opencollective.com/libvips"
      }
    },
    "node_modules/@img/sharp-libvips-linuxmusl-x64": {
      "version": "1.2.4",
      "resolved": "https://registry.npmjs.org/@img/sharp-libvips-linuxmusl-x64/-/sharp-libvips-linuxmusl-x64-1.2.4.tgz",
      "integrity": "sha512-+LpyBk7L44ZIXwz/VYfglaX/okxezESc6UxDSoyo2Ks6Jxc4Y7sGjpgU9s4PMgqgjj1gZCylTieNamqA1MF7Dg==",
      "cpu": [
        "x64"
      ],
      "dev": true,
      "license": "LGPL-3.0-or-later",
      "optional": true,
      "os": [
        "linux"
      ],
      "funding": {
        "url": "https://opencollective.com/libvips"
      }
    },
    "node_modules/@img/sharp-linux-arm": {
      "version": "0.34.5",
      "resolved": "https://registry.npmjs.org/@img/sharp-linux-arm/-/sharp-linux-arm-0.34.5.tgz",
      "integrity": "sha512-9dLqsvwtg1uuXBGZKsxem9595+ujv0sJ6Vi8wcTANSFpwV/GONat5eCkzQo/1O6zRIkh0m/8+5BjrRr7jDUSZw==",
      "cpu": [
        "arm"
      ],
      "dev": true,
      "license": "Apache-2.0",
      "optional": true,
      "os": [
        "linux"
      ],
      "engines": {
        "node": "^18.17.0 || ^20.3.0 || >=21.0.0"
      },
      "funding": {
        "url": "https://opencollective.com/libvips"
      },
      "optionalDependencies": {
        "@img/sharp-libvips-linux-arm": "1.2.4"
      }
    },
    "node_modules/@img/sharp-linux-arm64": {
      "version": "0.34.5",
      "resolved": "https://registry.npmjs.org/@img/sharp-linux-arm64/-/sharp-linux-arm64-0.34.5.tgz",
      "integrity": "sha512-bKQzaJRY/bkPOXyKx5EVup7qkaojECG6NLYswgktOZjaXecSAeCWiZwwiFf3/Y+O1HrauiE3FVsGxFg8c24rZg==",
      "cpu": [
        "arm64"
      ],
      "dev": true,
      "license": "Apache-2.0",
      "optional": true,
      "os": [
        "linux"
      ],
      "engines": {
        "node": "^18.17.0 || ^20.3.0 || >=21.0.0"
      },
      "funding": {
        "url": "https://opencollective.com/libvips"
      },
      "optionalDependencies": {
        "@img/sharp-libvips-linux-arm64": "1.2.4"
      }
    },
    "node_modules/@img/sharp-linux-ppc64": {
      "version": "0.34.5",
      "resolved": "https://registry.npmjs.org/@img/sharp-linux-ppc64/-/sharp-linux-ppc64-0.34.5.tgz",
      "integrity": "sha512-7zznwNaqW6YtsfrGGDA6BRkISKAAE1Jo0QdpNYXNMHu2+0dTrPflTLNkpc8l7MUP5M16ZJcUvysVWWrMefZquA==",
      "cpu": [
        "ppc64"
      ],
      "dev": true,
      "license": "Apache-2.0",
      "optional": true,
      "os": [
        "linux"
      ],
      "engines": {
        "node": "^18.17.0 || ^20.3.0 || >=21.0.0"
      },
      "funding": {
        "url": "https://opencollective.com/libvips"
      },
      "optionalDependencies": {
        "@img/sharp-libvips-linux-ppc64": "1.2.4"
      }
    },
    "node_modules/@img/sharp-linux-riscv64": {
      "version": "0.34.5",
      "resolved": "https://registry.npmjs.org/@img/sharp-linux-riscv64/-/sharp-linux-riscv64-0.34.5.tgz",
      "integrity": "sha512-51gJuLPTKa7piYPaVs8GmByo7/U7/7TZOq+cnXJIHZKavIRHAP77e3N2HEl3dgiqdD/w0yUfiJnII77PuDDFdw==",
      "cpu": [
        "riscv64"
      ],
      "dev": true,
      "license": "Apache-2.0",
      "optional": true,
      "os": [
        "linux"
      ],
      "engines": {
        "node": "^18.17.0 || ^20.3.0 || >=21.0.0"
      },
      "funding": {
        "url": "https://opencollective.com/libvips"
      },
      "optionalDependencies": {
        "@img/sharp-libvips-linux-riscv64": "1.2.4"
      }
    },
    "node_modules/@img/sharp-linux-s390x": {
      "version": "0.34.5",
      "resolved": "https://registry.npmjs.org/@img/sharp-linux-s390x/-/sharp-linux-s390x-0.34.5.tgz",
      "integrity": "sha512-nQtCk0PdKfho3eC5MrbQoigJ2gd1CgddUMkabUj+rBevs8tZ2cULOx46E7oyX+04WGfABgIwmMC0VqieTiR4jg==",
      "cpu": [
        "s390x"
      ],
      "dev": true,
      "license": "Apache-2.0",
      "optional": true,
      "os": [
        "linux"
      ],
      "engines": {
        "node": "^18.17.0 || ^20.3.0 || >=21.0.0"
      },
      "funding": {
        "url": "https://opencollective.com/libvips"
      },
      "optionalDependencies": {
        "@img/sharp-libvips-linux-s390x": "1.2.4"
      }
    },
    "node_modules/@img/sharp-linux-x64": {
      "version": "0.34.5",
      "resolved": "https://registry.npmjs.org/@img/sharp-linux-x64/-/sharp-linux-x64-0.34.5.tgz",
      "integrity": "sha512-MEzd8HPKxVxVenwAa+JRPwEC7QFjoPWuS5NZnBt6B3pu7EG2Ge0id1oLHZpPJdn3OQK+BQDiw9zStiHBTJQQQQ==",
      "cpu": [
        "x64"
      ],
      "dev": true,
      "license": "Apache-2.0",
      "optional": true,
      "os": [
        "linux"
      ],
      "engines": {
        "node": "^18.17.0 || ^20.3.0 || >=21.0.0"
      },
      "funding": {
        "url": "https://opencollective.com/libvips"
      },
      "optionalDependencies": {
        "@img/sharp-libvips-linux-x64": "1.2.4"
      }
    },
    "node_modules/@img/sharp-linuxmusl-arm64": {
      "version": "0.34.5",
      "resolved": "https://registry.npmjs.org/@img/sharp-linuxmusl-arm64/-/sharp-linuxmusl-arm64-0.34.5.tgz",
      "integrity": "sha512-fprJR6GtRsMt6Kyfq44IsChVZeGN97gTD331weR1ex1c1rypDEABN6Tm2xa1wE6lYb5DdEnk03NZPqA7Id21yg==",
      "cpu": [
        "arm64"
      ],
      "dev": true,
      "license": "Apache-2.0",
      "optional": true,
      "os": [
        "linux"
      ],
      "engines": {
        "node": "^18.17.0 || ^20.3.0 || >=21.0.0"
      },
      "funding": {
        "url": "https://opencollective.com/libvips"
      },
      "optionalDependencies": {
        "@img/sharp-libvips-linuxmusl-arm64": "1.2.4"
      }
    },
    "node_modules/@img/sharp-linuxmusl-x64": {
      "version": "0.34.5",
      "resolved": "https://registry.npmjs.org/@img/sharp-linuxmusl-x64/-/sharp-linuxmusl-x64-0.34.5.tgz",
      "integrity": "sha512-Jg8wNT1MUzIvhBFxViqrEhWDGzqymo3sV7z7ZsaWbZNDLXRJZoRGrjulp60YYtV4wfY8VIKcWidjojlLcWrd8Q==",
      "cpu": [
        "x64"
      ],
      "dev": true,
      "license": "Apache-2.0",
      "optional": true,
      "os": [
        "linux"
      ],
      "engines": {
        "node": "^18.17.0 || ^20.3.0 || >=21.0.0"
      },
      "funding": {
        "url": "https://opencollective.com/libvips"
      },
      "optionalDependencies": {
        "@img/sharp-libvips-linuxmusl-x64": "1.2.4"
      }
    },
    "node_modules/@img/sharp-wasm32": {
      "version": "0.34.5",
      "resolved": "https://registry.npmjs.org/@img/sharp-wasm32/-/sharp-wasm32-0.34.5.tgz",
      "integrity": "sha512-OdWTEiVkY2PHwqkbBI8frFxQQFekHaSSkUIJkwzclWZe64O1X4UlUjqqqLaPbUpMOQk6FBu/HtlGXNblIs0huw==",
      "cpu": [
        "wasm32"
      ],
      "dev": true,
      "license": "Apache-2.0 AND LGPL-3.0-or-later AND MIT",
      "optional": true,
      "dependencies": {
        "@emnapi/runtime": "^1.7.0"
      },
      "engines": {
        "node": "^18.17.0 || ^20.3.0 || >=21.0.0"
      },
      "funding": {
        "url": "https://opencollective.com/libvips"
      }
    },
    "node_modules/@img/sharp-win32-arm64": {
      "version": "0.34.5",
      "resolved": "https://registry.npmjs.org/@img/sharp-win32-arm64/-/sharp-win32-arm64-0.34.5.tgz",
      "integrity": "sha512-WQ3AgWCWYSb2yt+IG8mnC6Jdk9Whs7O0gxphblsLvdhSpSTtmu69ZG1Gkb6NuvxsNACwiPV6cNSZNzt0KPsw7g==",
      "cpu": [
        "arm64"
      ],
      "dev": true,
      "license": "Apache-2.0 AND LGPL-3.0-or-later",
      "optional": true,
      "os": [
        "win32"
      ],
      "engines": {
        "node": "^18.17.0 || ^20.3.0 || >=21.0.0"
      },
      "funding": {
        "url": "https://opencollective.com/libvips"
      }
    },
    "node_modules/@img/sharp-win32-ia32": {
      "version": "0.34.5",
      "resolved": "https://registry.npmjs.org/@img/sharp-win32-ia32/-/sharp-win32-ia32-0.34.5.tgz",
      "integrity": "sha512-FV9m/7NmeCmSHDD5j4+4pNI8Cp3aW+JvLoXcTUo0IqyjSfAZJ8dIUmijx1qaJsIiU+Hosw6xM5KijAWRJCSgNg==",
      "cpu": [
        "ia32"
      ],
      "dev": true,
      "license": "Apache-2.0 AND LGPL-3.0-or-later",
      "optional": true,
      "os": [
        "win32"
      ],
      "engines": {
        "node": "^18.17.0 || ^20.3.0 || >=21.0.0"
      },
      "funding": {
        "url": "https://opencollective.com/libvips"
      }
    },
    "node_modules/@img/sharp-win32-x64": {
      "version": "0.34.5",
      "resolved": "https://registry.npmjs.org/@img/sharp-win32-x64/-/sharp-win32-x64-0.34.5.tgz",
      "integrity": "sha512-+29YMsqY2/9eFEiW93eqWnuLcWcufowXewwSNIT6UwZdUUCrM3oFjMWH/Z6/TMmb4hlFenmfAVbpWeup2jryCw==",
      "cpu": [
        "x64"
      ],
      "dev": true,
      "license": "Apache-2.0 AND LGPL-3.0-or-later",
      "optional": true,
      "os": [
        "win32"
      ],
      "engines": {
        "node": "^18.17.0 || ^20.3.0 || >=21.0.0"
      },
      "funding": {
        "url": "https://opencollective.com/libvips"
      }
    },
    "node_modules/@jridgewell/resolve-uri": {
      "version": "3.1.2",
      "resolved": "https://registry.npmjs.org/@jridgewell/resolve-uri/-/resolve-uri-3.1.2.tgz",
      "integrity": "sha512-bRISgCIjP20/tbWSPWMEi54QVPRZExkuD9lJL+UIxUKtwVJA8wW1Trb1jMs1RFXo1CBTNZ/5hpC9QvmKWdopKw==",
      "dev": true,
      "license": "MIT",
      "engines": {
        "node": ">=6.0.0"
      }
    },
    "node_modules/@jridgewell/sourcemap-codec": {
      "version": "1.5.5",
      "resolved": "https://registry.npmjs.org/@jridgewell/sourcemap-codec/-/sourcemap-codec-1.5.5.tgz",
      "integrity": "sha512-cYQ9310grqxueWbl+WuIUIaiUaDcj7WOq5fVhEljNVgRfOUhY9fy2zTvfoqWsnebh8Sl70VScFbICvJnLKB0Og==",
      "dev": true,
      "license": "MIT"
    },
    "node_modules/@jridgewell/trace-mapping": {
      "version": "0.3.9",
      "resolved": "https://registry.npmjs.org/@jridgewell/trace-mapping/-/trace-mapping-0.3.9.tgz",
      "integrity": "sha512-3Belt6tdc8bPgAtbcmdtNJlirVoTmEb5e2gC94PnkwEW9jI6CAHUeoG85tjWP5WquqfavoMtMwiG4P926ZKKuQ==",
      "dev": true,
      "license": "MIT",
      "dependencies": {
        "@jridgewell/resolve-uri": "^3.0.3",
        "@jridgewell/sourcemap-codec": "^1.4.10"
      }
    },
    "node_modules/@poppinss/colors": {
      "version": "4.1.6",
      "resolved": "https://registry.npmjs.org/@poppinss/colors/-/colors-4.1.6.tgz",
      "integrity": "sha512-H9xkIdFswbS8n1d6vmRd8+c10t2Qe+rZITbbDHHkQixH5+2x1FDGmi/0K+WgWiqQFKPSlIYB7jlH6Kpfn6Fleg==",
      "dev": true,
      "license": "MIT",
      "dependencies": {
        "kleur": "^4.1.5"
      }
    },
    "node_modules/@poppinss/dumper": {
      "version": "0.6.5",
      "resolved": "https://registry.npmjs.org/@poppinss/dumper/-/dumper-0.6.5.tgz",
      "integrity": "sha512-NBdYIb90J7LfOI32dOewKI1r7wnkiH6m920puQ3qHUeZkxNkQiFnXVWoE6YtFSv6QOiPPf7ys6i+HWWecDz7sw==",
      "dev": true,
      "license": "MIT",
      "dependencies": {
        "@poppinss/colors": "^4.1.5",
        "@sindresorhus/is": "^7.0.2",
        "supports-color": "^10.0.0"
      }
    },
    "node_modules/@poppinss/exception": {
      "version": "1.2.3",
      "resolved": "https://registry.npmjs.org/@poppinss/exception/-/exception-1.2.3.tgz",
      "integrity": "sha512-dCED+QRChTVatE9ibtoaxc+WkdzOSjYTKi/+uacHWIsfodVfpsueo3+DKpgU5Px8qXjgmXkSvhXvSCz3fnP9lw==",
      "dev": true,
      "license": "MIT"
    },
    "node_modules/@portone/server-sdk": {
      "version": "0.15.0",
      "resolved": "https://registry.npmjs.org/@portone/server-sdk/-/server-sdk-0.15.0.tgz",
      "integrity": "sha512-eLRkC/BBoQ6yqi2iSAVwGWL6lYyXXXkYlwXnvTU6cqsWGy+k1jBp8Xmpl1sw7qJwrn4i9QQj/PWMavkgMiLSrg==",
      "license": "(Apache-2.0 OR MIT)"
    },
    "node_modules/@rollup/rollup-android-arm-eabi": {
      "version": "4.59.0",
      "resolved": "https://registry.npmjs.org/@rollup/rollup-android-arm-eabi/-/rollup-android-arm-eabi-4.59.0.tgz",
      "integrity": "sha512-upnNBkA6ZH2VKGcBj9Fyl9IGNPULcjXRlg0LLeaioQWueH30p6IXtJEbKAgvyv+mJaMxSm1l6xwDXYjpEMiLMg==",
      "cpu": [
        "arm"
      ],
      "dev": true,
      "license": "MIT",
      "optional": true,
      "os": [
        "android"
      ]
    },
    "node_modules/@rollup/rollup-android-arm64": {
      "version": "4.59.0",
      "resolved": "https://registry.npmjs.org/@rollup/rollup-android-arm64/-/rollup-android-arm64-4.59.0.tgz",
      "integrity": "sha512-hZ+Zxj3SySm4A/DylsDKZAeVg0mvi++0PYVceVyX7hemkw7OreKdCvW2oQ3T1FMZvCaQXqOTHb8qmBShoqk69Q==",
      "cpu": [
        "arm64"
      ],
      "dev": true,
      "license": "MIT",
      "optional": true,
      "os": [
        "android"
      ]
    },
    "node_modules/@rollup/rollup-darwin-arm64": {
      "version": "4.59.0",
      "resolved": "https://registry.npmjs.org/@rollup/rollup-darwin-arm64/-/rollup-darwin-arm64-4.59.0.tgz",
      "integrity": "sha512-W2Psnbh1J8ZJw0xKAd8zdNgF9HRLkdWwwdWqubSVk0pUuQkoHnv7rx4GiF9rT4t5DIZGAsConRE3AxCdJ4m8rg==",
      "cpu": [
        "arm64"
      ],
      "dev": true,
      "license": "MIT",
      "optional": true,
      "os": [
        "darwin"
      ]
    },
    "node_modules/@rollup/rollup-darwin-x64": {
      "version": "4.59.0",
      "resolved": "https://registry.npmjs.org/@rollup/rollup-darwin-x64/-/rollup-darwin-x64-4.59.0.tgz",
      "integrity": "sha512-ZW2KkwlS4lwTv7ZVsYDiARfFCnSGhzYPdiOU4IM2fDbL+QGlyAbjgSFuqNRbSthybLbIJ915UtZBtmuLrQAT/w==",
      "cpu": [
        "x64"
      ],
      "dev": true,
      "license": "MIT",
      "optional": true,
      "os": [
        "darwin"
      ]
    },
    "node_modules/@rollup/rollup-freebsd-arm64": {
      "version": "4.59.0",
      "resolved": "https://registry.npmjs.org/@rollup/rollup-freebsd-arm64/-/rollup-freebsd-arm64-4.59.0.tgz",
      "integrity": "sha512-EsKaJ5ytAu9jI3lonzn3BgG8iRBjV4LxZexygcQbpiU0wU0ATxhNVEpXKfUa0pS05gTcSDMKpn3Sx+QB9RlTTA==",
      "cpu": [
        "arm64"
      ],
      "dev": true,
      "license": "MIT",
      "optional": true,
      "os": [
        "freebsd"
      ]
    },
    "node_modules/@rollup/rollup-freebsd-x64": {
      "version": "4.59.0",
      "resolved": "https://registry.npmjs.org/@rollup/rollup-freebsd-x64/-/rollup-freebsd-x64-4.59.0.tgz",
      "integrity": "sha512-d3DuZi2KzTMjImrxoHIAODUZYoUUMsuUiY4SRRcJy6NJoZ6iIqWnJu9IScV9jXysyGMVuW+KNzZvBLOcpdl3Vg==",
      "cpu": [
        "x64"
      ],
      "dev": true,
      "license": "MIT",
      "optional": true,
      "os": [
        "freebsd"
      ]
    },
    "node_modules/@rollup/rollup-linux-arm-gnueabihf": {
      "version": "4.59.0",
      "resolved": "https://registry.npmjs.org/@rollup/rollup-linux-arm-gnueabihf/-/rollup-linux-arm-gnueabihf-4.59.0.tgz",
      "integrity": "sha512-t4ONHboXi/3E0rT6OZl1pKbl2Vgxf9vJfWgmUoCEVQVxhW6Cw/c8I6hbbu7DAvgp82RKiH7TpLwxnJeKv2pbsw==",
      "cpu": [
        "arm"
      ],
      "dev": true,
      "license": "MIT",
      "optional": true,
      "os": [
        "linux"
      ]
    },
    "node_modules/@rollup/rollup-linux-arm-musleabihf": {
      "version": "4.59.0",
      "resolved": "https://registry.npmjs.org/@rollup/rollup-linux-arm-musleabihf/-/rollup-linux-arm-musleabihf-4.59.0.tgz",
      "integrity": "sha512-CikFT7aYPA2ufMD086cVORBYGHffBo4K8MQ4uPS/ZnY54GKj36i196u8U+aDVT2LX4eSMbyHtyOh7D7Zvk2VvA==",
      "cpu": [
        "arm"
      ],
      "dev": true,
      "license": "MIT",
      "optional": true,
      "os": [
        "linux"
      ]
    },
    "node_modules/@rollup/rollup-linux-arm64-gnu": {
      "version": "4.59.0",
      "resolved": "https://registry.npmjs.org/@rollup/rollup-linux-arm64-gnu/-/rollup-linux-arm64-gnu-4.59.0.tgz",
      "integrity": "sha512-jYgUGk5aLd1nUb1CtQ8E+t5JhLc9x5WdBKew9ZgAXg7DBk0ZHErLHdXM24rfX+bKrFe+Xp5YuJo54I5HFjGDAA==",
      "cpu": [
        "arm64"
      ],
      "dev": true,
      "license": "MIT",
      "optional": true,
      "os": [
        "linux"
      ]
    },
    "node_modules/@rollup/rollup-linux-arm64-musl": {
      "version": "4.59.0",
      "resolved": "https://registry.npmjs.org/@rollup/rollup-linux-arm64-musl/-/rollup-linux-arm64-musl-4.59.0.tgz",
      "integrity": "sha512-peZRVEdnFWZ5Bh2KeumKG9ty7aCXzzEsHShOZEFiCQlDEepP1dpUl/SrUNXNg13UmZl+gzVDPsiCwnV1uI0RUA==",
      "cpu": [
        "arm64"
      ],
      "dev": true,
      "license": "MIT",
      "optional": true,
      "os": [
        "linux"
      ]
    },
    "node_modules/@rollup/rollup-linux-loong64-gnu": {
      "version": "4.59.0",
      "resolved": "https://registry.npmjs.org/@rollup/rollup-linux-loong64-gnu/-/rollup-linux-loong64-gnu-4.59.0.tgz",
      "integrity": "sha512-gbUSW/97f7+r4gHy3Jlup8zDG190AuodsWnNiXErp9mT90iCy9NKKU0Xwx5k8VlRAIV2uU9CsMnEFg/xXaOfXg==",
      "cpu": [
        "loong64"
      ],
      "dev": true,
      "license": "MIT",
      "optional": true,
      "os": [
        "linux"
      ]
    },
    "node_modules/@rollup/rollup-linux-loong64-musl": {
      "version": "4.59.0",
      "resolved": "https://registry.npmjs.org/@rollup/rollup-linux-loong64-musl/-/rollup-linux-loong64-musl-4.59.0.tgz",
      "integrity": "sha512-yTRONe79E+o0FWFijasoTjtzG9EBedFXJMl888NBEDCDV9I2wGbFFfJQQe63OijbFCUZqxpHz1GzpbtSFikJ4Q==",
      "cpu": [
        "loong64"
      ],
      "dev": true,
      "license": "MIT",
      "optional": true,
      "os": [
        "linux"
      ]
    },
    "node_modules/@rollup/rollup-linux-ppc64-gnu": {
      "version": "4.59.0",
      "resolved": "https://registry.npmjs.org/@rollup/rollup-linux-ppc64-gnu/-/rollup-linux-ppc64-gnu-4.59.0.tgz",
      "integrity": "sha512-sw1o3tfyk12k3OEpRddF68a1unZ5VCN7zoTNtSn2KndUE+ea3m3ROOKRCZxEpmT9nsGnogpFP9x6mnLTCaoLkA==",
      "cpu": [
        "ppc64"
      ],
      "dev": true,
      "license": "MIT",
      "optional": true,
      "os": [
        "linux"
      ]
    },
    "node_modules/@rollup/rollup-linux-ppc64-musl": {
      "version": "4.59.0",
      "resolved": "https://registry.npmjs.org/@rollup/rollup-linux-ppc64-musl/-/rollup-linux-ppc64-musl-4.59.0.tgz",
      "integrity": "sha512-+2kLtQ4xT3AiIxkzFVFXfsmlZiG5FXYW7ZyIIvGA7Bdeuh9Z0aN4hVyXS/G1E9bTP/vqszNIN/pUKCk/BTHsKA==",
      "cpu": [
        "ppc64"
      ],
      "dev": true,
      "license": "MIT",
      "optional": true,
      "os": [
        "linux"
      ]
    },
    "node_modules/@rollup/rollup-linux-riscv64-gnu": {
      "version": "4.59.0",
      "resolved": "https://registry.npmjs.org/@rollup/rollup-linux-riscv64-gnu/-/rollup-linux-riscv64-gnu-4.59.0.tgz",
      "integrity": "sha512-NDYMpsXYJJaj+I7UdwIuHHNxXZ/b/N2hR15NyH3m2qAtb/hHPA4g4SuuvrdxetTdndfj9b1WOmy73kcPRoERUg==",
      "cpu": [
        "riscv64"
      ],
      "dev": true,
      "license": "MIT",
      "optional": true,
      "os": [
        "linux"
      ]
    },
    "node_modules/@rollup/rollup-linux-riscv64-musl": {
      "version": "4.59.0",
      "resolved": "https://registry.npmjs.org/@rollup/rollup-linux-riscv64-musl/-/rollup-linux-riscv64-musl-4.59.0.tgz",
      "integrity": "sha512-nLckB8WOqHIf1bhymk+oHxvM9D3tyPndZH8i8+35p/1YiVoVswPid2yLzgX7ZJP0KQvnkhM4H6QZ5m0LzbyIAg==",
      "cpu": [
        "riscv64"
      ],
      "dev": true,
      "license": "MIT",
      "optional": true,
      "os": [
        "linux"
      ]
    },
    "node_modules/@rollup/rollup-linux-s390x-gnu": {
      "version": "4.59.0",
      "resolved": "https://registry.npmjs.org/@rollup/rollup-linux-s390x-gnu/-/rollup-linux-s390x-gnu-4.59.0.tgz",
      "integrity": "sha512-oF87Ie3uAIvORFBpwnCvUzdeYUqi2wY6jRFWJAy1qus/udHFYIkplYRW+wo+GRUP4sKzYdmE1Y3+rY5Gc4ZO+w==",
      "cpu": [
        "s390x"
      ],
      "dev": true,
      "license": "MIT",
      "optional": true,
      "os": [
        "linux"
      ]
    },
    "node_modules/@rollup/rollup-linux-x64-gnu": {
      "version": "4.59.0",
      "resolved": "https://registry.npmjs.org/@rollup/rollup-linux-x64-gnu/-/rollup-linux-x64-gnu-4.59.0.tgz",
      "integrity": "sha512-3AHmtQq/ppNuUspKAlvA8HtLybkDflkMuLK4DPo77DfthRb71V84/c4MlWJXixZz4uruIH4uaa07IqoAkG64fg==",
      "cpu": [
        "x64"
      ],
      "dev": true,
      "license": "MIT",
      "optional": true,
      "os": [
        "linux"
      ]
    },
    "node_modules/@rollup/rollup-linux-x64-musl": {
      "version": "4.59.0",
      "resolved": "https://registry.npmjs.org/@rollup/rollup-linux-x64-musl/-/rollup-linux-x64-musl-4.59.0.tgz",
      "integrity": "sha512-2UdiwS/9cTAx7qIUZB/fWtToJwvt0Vbo0zmnYt7ED35KPg13Q0ym1g442THLC7VyI6JfYTP4PiSOWyoMdV2/xg==",
      "cpu": [
        "x64"
      ],
      "dev": true,
      "license": "MIT",
      "optional": true,
      "os": [
        "linux"
      ]
    },
    "node_modules/@rollup/rollup-openbsd-x64": {
      "version": "4.59.0",
      "resolved": "https://registry.npmjs.org/@rollup/rollup-openbsd-x64/-/rollup-openbsd-x64-4.59.0.tgz",
      "integrity": "sha512-M3bLRAVk6GOwFlPTIxVBSYKUaqfLrn8l0psKinkCFxl4lQvOSz8ZrKDz2gxcBwHFpci0B6rttydI4IpS4IS/jQ==",
      "cpu": [
        "x64"
      ],
      "dev": true,
      "license": "MIT",
      "optional": true,
      "os": [
        "openbsd"
      ]
    },
    "node_modules/@rollup/rollup-openharmony-arm64": {
      "version": "4.59.0",
      "resolved": "https://registry.npmjs.org/@rollup/rollup-openharmony-arm64/-/rollup-openharmony-arm64-4.59.0.tgz",
      "integrity": "sha512-tt9KBJqaqp5i5HUZzoafHZX8b5Q2Fe7UjYERADll83O4fGqJ49O1FsL6LpdzVFQcpwvnyd0i+K/VSwu/o/nWlA==",
      "cpu": [
        "arm64"
      ],
      "dev": true,
      "license": "MIT",
      "optional": true,
      "os": [
        "openharmony"
      ]
    },
    "node_modules/@rollup/rollup-win32-arm64-msvc": {
      "version": "4.59.0",
      "resolved": "https://registry.npmjs.org/@rollup/rollup-win32-arm64-msvc/-/rollup-win32-arm64-msvc-4.59.0.tgz",
      "integrity": "sha512-V5B6mG7OrGTwnxaNUzZTDTjDS7F75PO1ae6MJYdiMu60sq0CqN5CVeVsbhPxalupvTX8gXVSU9gq+Rx1/hvu6A==",
      "cpu": [
        "arm64"
      ],
      "dev": true,
      "license": "MIT",
      "optional": true,
      "os": [
        "win32"
      ]
    },
    "node_modules/@rollup/rollup-win32-ia32-msvc": {
      "version": "4.59.0",
      "resolved": "https://registry.npmjs.org/@rollup/rollup-win32-ia32-msvc/-/rollup-win32-ia32-msvc-4.59.0.tgz",
      "integrity": "sha512-UKFMHPuM9R0iBegwzKF4y0C4J9u8C6MEJgFuXTBerMk7EJ92GFVFYBfOZaSGLu6COf7FxpQNqhNS4c4icUPqxA==",
      "cpu": [
        "ia32"
      ],
      "dev": true,
      "license": "MIT",
      "optional": true,
      "os": [
        "win32"
      ]
    },
    "node_modules/@rollup/rollup-win32-x64-gnu": {
      "version": "4.59.0",
      "resolved": "https://registry.npmjs.org/@rollup/rollup-win32-x64-gnu/-/rollup-win32-x64-gnu-4.59.0.tgz",
      "integrity": "sha512-laBkYlSS1n2L8fSo1thDNGrCTQMmxjYY5G0WFWjFFYZkKPjsMBsgJfGf4TLxXrF6RyhI60L8TMOjBMvXiTcxeA==",
      "cpu": [
        "x64"
      ],
      "dev": true,
      "license": "MIT",
      "optional": true,
      "os": [
        "win32"
      ]
    },
    "node_modules/@rollup/rollup-win32-x64-msvc": {
      "version": "4.59.0",
      "resolved": "https://registry.npmjs.org/@rollup/rollup-win32-x64-msvc/-/rollup-win32-x64-msvc-4.59.0.tgz",
      "integrity": "sha512-2HRCml6OztYXyJXAvdDXPKcawukWY2GpR5/nxKp4iBgiO3wcoEGkAaqctIbZcNB6KlUQBIqt8VYkNSj2397EfA==",
      "cpu": [
        "x64"
      ],
      "dev": true,
      "license": "MIT",
      "optional": true,
      "os": [
        "win32"
      ]
    },
    "node_modules/@sindresorhus/is": {
      "version": "7.2.0",
      "resolved": "https://registry.npmjs.org/@sindresorhus/is/-/is-7.2.0.tgz",
      "integrity": "sha512-P1Cz1dWaFfR4IR+U13mqqiGsLFf1KbayybWwdd2vfctdV6hDpUkgCY0nKOLLTMSoRd/jJNjtbqzf13K8DCCXQw==",
      "dev": true,
      "license": "MIT",
      "engines": {
        "node": ">=18"
      },
      "funding": {
        "url": "https://github.com/sindresorhus/is?sponsor=1"
      }
    },
    "node_modules/@speed-highlight/core": {
      "version": "1.2.14",
      "resolved": "https://registry.npmjs.org/@speed-highlight/core/-/core-1.2.14.tgz",
      "integrity": "sha512-G4ewlBNhUtlLvrJTb88d2mdy2KRijzs4UhnlrOSRT4bmjh/IqNElZa3zkrZ+TC47TwtlDWzVLFADljF1Ijp5hA==",
      "dev": true,
      "license": "CC0-1.0"
    },
    "node_modules/@types/estree": {
      "version": "1.0.8",
      "resolved": "https://registry.npmjs.org/@types/estree/-/estree-1.0.8.tgz",
      "integrity": "sha512-dWHzHa2WqEXI/O1E9OjrocMTKJl2mSrEolh1Iomrv6U+JuNwaHXsXx9bLu5gG7BUWFIN0skIQJQ/L1rIex4X6w==",
      "dev": true,
      "license": "MIT"
    },
    "node_modules/balanced-match": {
      "version": "1.0.2",
      "resolved": "https://registry.npmjs.org/balanced-match/-/balanced-match-1.0.2.tgz",
      "integrity": "sha512-3oSeUO0TMV67hN1AmbXsK4yaqU7tjiHlbxRDZOpH0KW9+CeX4bRAaX0Anxt0tx2MrpRpWwQaPwIlISEJhYU5Pw==",
      "dev": true,
      "license": "MIT"
    },
    "node_modules/blake3-wasm": {
      "version": "2.1.5",
      "resolved": "https://registry.npmjs.org/blake3-wasm/-/blake3-wasm-2.1.5.tgz",
      "integrity": "sha512-F1+K8EbfOZE49dtoPtmxUQrpXaBIl3ICvasLh+nJta0xkz+9kF/7uet9fLnwKqhDrmj6g+6K3Tw9yQPUg2ka5g==",
      "dev": true,
      "license": "MIT"
    },
    "node_modules/brace-expansion": {
      "version": "2.0.2",
      "resolved": "https://registry.npmjs.org/brace-expansion/-/brace-expansion-2.0.2.tgz",
      "integrity": "sha512-Jt0vHyM+jmUBqojB7E1NIYadt0vI0Qxjxd2TErW94wDz+E2LAm5vKMXXwg6ZZBTHPuUlDgQHKXvjGBdfcF1ZDQ==",
      "dev": true,
      "license": "MIT",
      "dependencies": {
        "balanced-match": "^1.0.0"
      }
    },
    "node_modules/cookie": {
      "version": "1.1.1",
      "resolved": "https://registry.npmjs.org/cookie/-/cookie-1.1.1.tgz",
      "integrity": "sha512-ei8Aos7ja0weRpFzJnEA9UHJ/7XQmqglbRwnf2ATjcB9Wq874VKH9kfjjirM6UhU2/E5fFYadylyhFldcqSidQ==",
      "dev": true,
      "license": "MIT",
      "engines": {
        "node": ">=18"
      },
      "funding": {
        "type": "opencollective",
        "url": "https://opencollective.com/express"
      }
    },
    "node_modules/detect-libc": {
      "version": "2.1.2",
      "resolved": "https://registry.npmjs.org/detect-libc/-/detect-libc-2.1.2.tgz",
      "integrity": "sha512-Btj2BOOO83o3WyH59e8MgXsxEQVcarkUOpEYrubB0urwnN10yQ364rsiByU11nZlqWYZm05i/of7io4mzihBtQ==",
      "dev": true,
      "license": "Apache-2.0",
      "engines": {
        "node": ">=8"
      }
    },
    "node_modules/error-stack-parser-es": {
      "version": "1.0.5",
      "resolved": "https://registry.npmjs.org/error-stack-parser-es/-/error-stack-parser-es-1.0.5.tgz",
      "integrity": "sha512-5qucVt2XcuGMcEGgWI7i+yZpmpByQ8J1lHhcL7PwqCwu9FPP3VUXzT4ltHe5i2z9dePwEHcDVOAfSnHsOlCXRA==",
      "dev": true,
      "license": "MIT",
      "funding": {
        "url": "https://github.com/sponsors/antfu"
      }
    },
    "node_modules/esbuild": {
      "version": "0.25.12",
      "resolved": "https://registry.npmjs.org/esbuild/-/esbuild-0.25.12.tgz",
      "integrity": "sha512-bbPBYYrtZbkt6Os6FiTLCTFxvq4tt3JKall1vRwshA3fdVztsLAatFaZobhkBC8/BrPetoa0oksYoKXoG4ryJg==",
      "dev": true,
      "hasInstallScript": true,
      "license": "MIT",
      "bin": {
        "esbuild": "bin/esbuild"
      },
      "engines": {
        "node": ">=18"
      },
      "optionalDependencies": {
        "@esbuild/aix-ppc64": "0.25.12",
        "@esbuild/android-arm": "0.25.12",
        "@esbuild/android-arm64": "0.25.12",
        "@esbuild/android-x64": "0.25.12",
        "@esbuild/darwin-arm64": "0.25.12",
        "@esbuild/darwin-x64": "0.25.12",
        "@esbuild/freebsd-arm64": "0.25.12",
        "@esbuild/freebsd-x64": "0.25.12",
        "@esbuild/linux-arm": "0.25.12",
        "@esbuild/linux-arm64": "0.25.12",
        "@esbuild/linux-ia32": "0.25.12",
        "@esbuild/linux-loong64": "0.25.12",
        "@esbuild/linux-mips64el": "0.25.12",
        "@esbuild/linux-ppc64": "0.25.12",
        "@esbuild/linux-riscv64": "0.25.12",
        "@esbuild/linux-s390x": "0.25.12",
        "@esbuild/linux-x64": "0.25.12",
        "@esbuild/netbsd-arm64": "0.25.12",
        "@esbuild/netbsd-x64": "0.25.12",
        "@esbuild/openbsd-arm64": "0.25.12",
        "@esbuild/openbsd-x64": "0.25.12",
        "@esbuild/openharmony-arm64": "0.25.12",
        "@esbuild/sunos-x64": "0.25.12",
        "@esbuild/win32-arm64": "0.25.12",
        "@esbuild/win32-ia32": "0.25.12",
        "@esbuild/win32-x64": "0.25.12"
      }
    },
    "node_modules/fdir": {
      "version": "6.5.0",
      "resolved": "https://registry.npmjs.org/fdir/-/fdir-6.5.0.tgz",
      "integrity": "sha512-tIbYtZbucOs0BRGqPJkshJUYdL+SDH7dVM8gjy+ERp3WAUjLEFJE+02kanyHtwjWOnwrKYBiwAmM0p4kLJAnXg==",
      "dev": true,
      "license": "MIT",
      "engines": {
        "node": ">=12.0.0"
      },
      "peerDependencies": {
        "picomatch": "^3 || ^4"
      },
      "peerDependenciesMeta": {
        "picomatch": {
          "optional": true
        }
      }
    },
    "node_modules/fsevents": {
      "version": "2.3.3",
      "resolved": "https://registry.npmjs.org/fsevents/-/fsevents-2.3.3.tgz",
      "integrity": "sha512-5xoDfX+fL7faATnagmWPpbFtwh/R77WmMMqqHGS65C3vvB0YHrgF+B1YmZ3441tMj5n63k0212XNoJwzlhffQw==",
      "dev": true,
      "hasInstallScript": true,
      "license": "MIT",
      "optional": true,
      "os": [
        "darwin"
      ],
      "engines": {
        "node": "^8.16.0 || ^10.6.0 || >=11.0.0"
      }
    },
    "node_modules/hono": {
      "version": "4.12.6",
      "resolved": "https://registry.npmjs.org/hono/-/hono-4.12.6.tgz",
      "integrity": "sha512-KljEp+MeEEEIOT75qBo1UjqqB29fRMtlDEwCxcexOzdkUq6LR/vRvHk5pdROcxyOYyW1niq7Gb5pFVGy5R1eBw==",
      "license": "MIT",
      "engines": {
        "node": ">=16.9.0"
      }
    },
    "node_modules/kleur": {
      "version": "4.1.5",
      "resolved": "https://registry.npmjs.org/kleur/-/kleur-4.1.5.tgz",
      "integrity": "sha512-o+NO+8WrRiQEE4/7nwRJhN1HWpVmJm511pBHUxPLtp0BUISzlBplORYSmTclCnJvQq2tKu/sgl3xVpkc7ZWuQQ==",
      "dev": true,
      "license": "MIT",
      "engines": {
        "node": ">=6"
      }
    },
    "node_modules/miniflare": {
      "version": "4.20260301.1",
      "resolved": "https://registry.npmjs.org/miniflare/-/miniflare-4.20260301.1.tgz",
      "integrity": "sha512-fqkHx0QMKswRH9uqQQQOU/RoaS3Wjckxy3CUX3YGJr0ZIMu7ObvI+NovdYi6RIsSPthNtq+3TPmRNxjeRiasog==",
      "dev": true,
      "license": "MIT",
      "dependencies": {
        "@cspotcode/source-map-support": "0.8.1",
        "sharp": "^0.34.5",
        "undici": "7.18.2",
        "workerd": "1.20260301.1",
        "ws": "8.18.0",
        "youch": "4.1.0-beta.10"
      },
      "bin": {
        "miniflare": "bootstrap.js"
      },
      "engines": {
        "node": ">=18.0.0"
      }
    },
    "node_modules/minimatch": {
      "version": "9.0.9",
      "resolved": "https://registry.npmjs.org/minimatch/-/minimatch-9.0.9.tgz",
      "integrity": "sha512-OBwBN9AL4dqmETlpS2zasx+vTeWclWzkblfZk7KTA5j3jeOONz/tRCnZomUyvNg83wL5Zv9Ss6HMJXAgL8R2Yg==",
      "dev": true,
      "license": "ISC",
      "dependencies": {
        "brace-expansion": "^2.0.2"
      },
      "engines": {
        "node": ">=16 || 14 >=14.17"
      },
      "funding": {
        "url": "https://github.com/sponsors/isaacs"
      }
    },
    "node_modules/nanoid": {
      "version": "3.3.11",
      "resolved": "https://registry.npmjs.org/nanoid/-/nanoid-3.3.11.tgz",
      "integrity": "sha512-N8SpfPUnUp1bK+PMYW8qSWdl9U+wwNWI4QKxOYDy9JAro3WMX7p2OeVRF9v+347pnakNevPmiHhNmZ2HbFA76w==",
      "dev": true,
      "funding": [
        {
          "type": "github",
          "url": "https://github.com/sponsors/ai"
        }
      ],
      "license": "MIT",
      "bin": {
        "nanoid": "bin/nanoid.cjs"
      },
      "engines": {
        "node": "^10 || ^12 || ^13.7 || ^14 || >=15.0.1"
      }
    },
    "node_modules/path-to-regexp": {
      "version": "6.3.0",
      "resolved": "https://registry.npmjs.org/path-to-regexp/-/path-to-regexp-6.3.0.tgz",
      "integrity": "sha512-Yhpw4T9C6hPpgPeA28us07OJeqZ5EzQTkbfwuhsUg0c237RomFoETJgmp2sa3F/41gfLE6G5cqcYwznmeEeOlQ==",
      "dev": true,
      "license": "MIT"
    },
    "node_modules/pathe": {
      "version": "2.0.3",
      "resolved": "https://registry.npmjs.org/pathe/-/pathe-2.0.3.tgz",
      "integrity": "sha512-WUjGcAqP1gQacoQe+OBJsFA7Ld4DyXuUIjZ5cc75cLHvJ7dtNsTugphxIADwspS+AraAUePCKrSVtPLFj/F88w==",
      "dev": true,
      "license": "MIT"
    },
    "node_modules/picocolors": {
      "version": "1.1.1",
      "resolved": "https://registry.npmjs.org/picocolors/-/picocolors-1.1.1.tgz",
      "integrity": "sha512-xceH2snhtb5M9liqDsmEw56le376mTZkEX/jEb/RxNFyegNul7eNslCXP9FDj/Lcu0X8KEyMceP2ntpaHrDEVA==",
      "dev": true,
      "license": "ISC"
    },
    "node_modules/picomatch": {
      "version": "4.0.3",
      "resolved": "https://registry.npmjs.org/picomatch/-/picomatch-4.0.3.tgz",
      "integrity": "sha512-5gTmgEY/sqK6gFXLIsQNH19lWb4ebPDLA4SdLP7dsWkIXHWlG66oPuVvXSGFPppYZz8ZDZq0dYYrbHfBCVUb1Q==",
      "dev": true,
      "license": "MIT",
      "engines": {
        "node": ">=12"
      },
      "funding": {
        "url": "https://github.com/sponsors/jonschlinkert"
      }
    },
    "node_modules/playwright": {
      "version": "1.58.2",
      "resolved": "https://registry.npmjs.org/playwright/-/playwright-1.58.2.tgz",
      "integrity": "sha512-vA30H8Nvkq/cPBnNw4Q8TWz1EJyqgpuinBcHET0YVJVFldr8JDNiU9LaWAE1KqSkRYazuaBhTpB5ZzShOezQ6A==",
      "dev": true,
      "license": "Apache-2.0",
      "dependencies": {
        "playwright-core": "1.58.2"
      },
      "bin": {
        "playwright": "cli.js"
      },
      "engines": {
        "node": ">=18"
      },
      "optionalDependencies": {
        "fsevents": "2.3.2"
      }
    },
    "node_modules/playwright-core": {
      "version": "1.58.2",
      "resolved": "https://registry.npmjs.org/playwright-core/-/playwright-core-1.58.2.tgz",
      "integrity": "sha512-yZkEtftgwS8CsfYo7nm0KE8jsvm6i/PTgVtB8DL726wNf6H2IMsDuxCpJj59KDaxCtSnrWan2AeDqM7JBaultg==",
      "dev": true,
      "license": "Apache-2.0",
      "bin": {
        "playwright-core": "cli.js"
      },
      "engines": {
        "node": ">=18"
      }
    },
    "node_modules/playwright/node_modules/fsevents": {
      "version": "2.3.2",
      "resolved": "https://registry.npmjs.org/fsevents/-/fsevents-2.3.2.tgz",
      "integrity": "sha512-xiqMQR4xAeHTuB9uWm+fFRcIOgKBMiOBP+eXiyT7jsgVCq1bkVygt00oASowB7EdtpOHaaPgKt812P9ab+DDKA==",
      "dev": true,
      "hasInstallScript": true,
      "license": "MIT",
      "optional": true,
      "os": [
        "darwin"
      ],
      "engines": {
        "node": "^8.16.0 || ^10.6.0 || >=11.0.0"
      }
    },
    "node_modules/postcss": {
      "version": "8.5.8",
      "resolved": "https://registry.npmjs.org/postcss/-/postcss-8.5.8.tgz",
      "integrity": "sha512-OW/rX8O/jXnm82Ey1k44pObPtdblfiuWnrd8X7GJ7emImCOstunGbXUpp7HdBrFQX6rJzn3sPT397Wp5aCwCHg==",
      "dev": true,
      "funding": [
        {
          "type": "opencollective",
          "url": "https://opencollective.com/postcss/"
        },
        {
          "type": "tidelift",
          "url": "https://tidelift.com/funding/github/npm/postcss"
        },
        {
          "type": "github",
          "url": "https://github.com/sponsors/ai"
        }
      ],
      "license": "MIT",
      "dependencies": {
        "nanoid": "^3.3.11",
        "picocolors": "^1.1.1",
        "source-map-js": "^1.2.1"
      },
      "engines": {
        "node": "^10 || ^12 || >=14"
      }
    },
    "node_modules/rollup": {
      "version": "4.59.0",
      "resolved": "https://registry.npmjs.org/rollup/-/rollup-4.59.0.tgz",
      "integrity": "sha512-2oMpl67a3zCH9H79LeMcbDhXW/UmWG/y2zuqnF2jQq5uq9TbM9TVyXvA4+t+ne2IIkBdrLpAaRQAvo7YI/Yyeg==",
      "dev": true,
      "license": "MIT",
      "dependencies": {
        "@types/estree": "1.0.8"
      },
      "bin": {
        "rollup": "dist/bin/rollup"
      },
      "engines": {
        "node": ">=18.0.0",
        "npm": ">=8.0.0"
      },
      "optionalDependencies": {
        "@rollup/rollup-android-arm-eabi": "4.59.0",
        "@rollup/rollup-android-arm64": "4.59.0",
        "@rollup/rollup-darwin-arm64": "4.59.0",
        "@rollup/rollup-darwin-x64": "4.59.0",
        "@rollup/rollup-freebsd-arm64": "4.59.0",
        "@rollup/rollup-freebsd-x64": "4.59.0",
        "@rollup/rollup-linux-arm-gnueabihf": "4.59.0",
        "@rollup/rollup-linux-arm-musleabihf": "4.59.0",
        "@rollup/rollup-linux-arm64-gnu": "4.59.0",
        "@rollup/rollup-linux-arm64-musl": "4.59.0",
        "@rollup/rollup-linux-loong64-gnu": "4.59.0",
        "@rollup/rollup-linux-loong64-musl": "4.59.0",
        "@rollup/rollup-linux-ppc64-gnu": "4.59.0",
        "@rollup/rollup-linux-ppc64-musl": "4.59.0",
        "@rollup/rollup-linux-riscv64-gnu": "4.59.0",
        "@rollup/rollup-linux-riscv64-musl": "4.59.0",
        "@rollup/rollup-linux-s390x-gnu": "4.59.0",
        "@rollup/rollup-linux-x64-gnu": "4.59.0",
        "@rollup/rollup-linux-x64-musl": "4.59.0",
        "@rollup/rollup-openbsd-x64": "4.59.0",
        "@rollup/rollup-openharmony-arm64": "4.59.0",
        "@rollup/rollup-win32-arm64-msvc": "4.59.0",
        "@rollup/rollup-win32-ia32-msvc": "4.59.0",
        "@rollup/rollup-win32-x64-gnu": "4.59.0",
        "@rollup/rollup-win32-x64-msvc": "4.59.0",
        "fsevents": "~2.3.2"
      }
    },
    "node_modules/semver": {
      "version": "7.7.4",
      "resolved": "https://registry.npmjs.org/semver/-/semver-7.7.4.tgz",
      "integrity": "sha512-vFKC2IEtQnVhpT78h1Yp8wzwrf8CM+MzKMHGJZfBtzhZNycRFnXsHk6E5TxIkkMsgNS7mdX3AGB7x2QM2di4lA==",
      "dev": true,
      "license": "ISC",
      "bin": {
        "semver": "bin/semver.js"
      },
      "engines": {
        "node": ">=10"
      }
    },
    "node_modules/sharp": {
      "version": "0.34.5",
      "resolved": "https://registry.npmjs.org/sharp/-/sharp-0.34.5.tgz",
      "integrity": "sha512-Ou9I5Ft9WNcCbXrU9cMgPBcCK8LiwLqcbywW3t4oDV37n1pzpuNLsYiAV8eODnjbtQlSDwZ2cUEeQz4E54Hltg==",
      "dev": true,
      "hasInstallScript": true,
      "license": "Apache-2.0",
      "dependencies": {
        "@img/colour": "^1.0.0",
        "detect-libc": "^2.1.2",
        "semver": "^7.7.3"
      },
      "engines": {
        "node": "^18.17.0 || ^20.3.0 || >=21.0.0"
      },
      "funding": {
        "url": "https://opencollective.com/libvips"
      },
      "optionalDependencies": {
        "@img/sharp-darwin-arm64": "0.34.5",
        "@img/sharp-darwin-x64": "0.34.5",
        "@img/sharp-libvips-darwin-arm64": "1.2.4",
        "@img/sharp-libvips-darwin-x64": "1.2.4",
        "@img/sharp-libvips-linux-arm": "1.2.4",
        "@img/sharp-libvips-linux-arm64": "1.2.4",
        "@img/sharp-libvips-linux-ppc64": "1.2.4",
        "@img/sharp-libvips-linux-riscv64": "1.2.4",
        "@img/sharp-libvips-linux-s390x": "1.2.4",
        "@img/sharp-libvips-linux-x64": "1.2.4",
        "@img/sharp-libvips-linuxmusl-arm64": "1.2.4",
        "@img/sharp-libvips-linuxmusl-x64": "1.2.4",
        "@img/sharp-linux-arm": "0.34.5",
        "@img/sharp-linux-arm64": "0.34.5",
        "@img/sharp-linux-ppc64": "0.34.5",
        "@img/sharp-linux-riscv64": "0.34.5",
        "@img/sharp-linux-s390x": "0.34.5",
        "@img/sharp-linux-x64": "0.34.5",
        "@img/sharp-linuxmusl-arm64": "0.34.5",
        "@img/sharp-linuxmusl-x64": "0.34.5",
        "@img/sharp-wasm32": "0.34.5",
        "@img/sharp-win32-arm64": "0.34.5",
        "@img/sharp-win32-ia32": "0.34.5",
        "@img/sharp-win32-x64": "0.34.5"
      }
    },
    "node_modules/source-map-js": {
      "version": "1.2.1",
      "resolved": "https://registry.npmjs.org/source-map-js/-/source-map-js-1.2.1.tgz",
      "integrity": "sha512-UXWMKhLOwVKb728IUtQPXxfYU+usdybtUrK/8uGE8CQMvrhOpwvzDBwj0QhSL7MQc7vIsISBG8VQ8+IDQxpfQA==",
      "dev": true,
      "license": "BSD-3-Clause",
      "engines": {
        "node": ">=0.10.0"
      }
    },
    "node_modules/supports-color": {
      "version": "10.2.2",
      "resolved": "https://registry.npmjs.org/supports-color/-/supports-color-10.2.2.tgz",
      "integrity": "sha512-SS+jx45GF1QjgEXQx4NJZV9ImqmO2NPz5FNsIHrsDjh2YsHnawpan7SNQ1o8NuhrbHZy9AZhIoCUiCeaW/C80g==",
      "dev": true,
      "license": "MIT",
      "engines": {
        "node": ">=18"
      },
      "funding": {
        "url": "https://github.com/chalk/supports-color?sponsor=1"
      }
    },
    "node_modules/tinyglobby": {
      "version": "0.2.15",
      "resolved": "https://registry.npmjs.org/tinyglobby/-/tinyglobby-0.2.15.tgz",
      "integrity": "sha512-j2Zq4NyQYG5XMST4cbs02Ak8iJUdxRM0XI5QyxXuZOzKOINmWurp3smXu3y5wDcJrptwpSjgXHzIQxR0omXljQ==",
      "dev": true,
      "license": "MIT",
      "dependencies": {
        "fdir": "^6.5.0",
        "picomatch": "^4.0.3"
      },
      "engines": {
        "node": ">=12.0.0"
      },
      "funding": {
        "url": "https://github.com/sponsors/SuperchupuDev"
      }
    },
    "node_modules/tslib": {
      "version": "2.8.1",
      "resolved": "https://registry.npmjs.org/tslib/-/tslib-2.8.1.tgz",
      "integrity": "sha512-oJFu94HQb+KVduSUQL7wnpmqnfmLsOA/nAh6b6EH0wCEoK0/mPeXU6c3wKDV83MkOuHPRHtSXKKU99IBazS/2w==",
      "dev": true,
      "license": "0BSD",
      "optional": true
    },
    "node_modules/undici": {
      "version": "7.18.2",
      "resolved": "https://registry.npmjs.org/undici/-/undici-7.18.2.tgz",
      "integrity": "sha512-y+8YjDFzWdQlSE9N5nzKMT3g4a5UBX1HKowfdXh0uvAnTaqqwqB92Jt4UXBAeKekDs5IaDKyJFR4X1gYVCgXcw==",
      "dev": true,
      "license": "MIT",
      "engines": {
        "node": ">=20.18.1"
      }
    },
    "node_modules/unenv": {
      "version": "2.0.0-rc.24",
      "resolved": "https://registry.npmjs.org/unenv/-/unenv-2.0.0-rc.24.tgz",
      "integrity": "sha512-i7qRCmY42zmCwnYlh9H2SvLEypEFGye5iRmEMKjcGi7zk9UquigRjFtTLz0TYqr0ZGLZhaMHl/foy1bZR+Cwlw==",
      "dev": true,
      "license": "MIT",
      "dependencies": {
        "pathe": "^2.0.3"
      }
    },
    "node_modules/vite": {
      "version": "6.4.1",
      "resolved": "https://registry.npmjs.org/vite/-/vite-6.4.1.tgz",
      "integrity": "sha512-+Oxm7q9hDoLMyJOYfUYBuHQo+dkAloi33apOPP56pzj+vsdJDzr+j1NISE5pyaAuKL4A3UD34qd0lx5+kfKp2g==",
      "dev": true,
      "license": "MIT",
      "dependencies": {
        "esbuild": "^0.25.0",
        "fdir": "^6.4.4",
        "picomatch": "^4.0.2",
        "postcss": "^8.5.3",
        "rollup": "^4.34.9",
        "tinyglobby": "^0.2.13"
      },
      "bin": {
        "vite": "bin/vite.js"
      },
      "engines": {
        "node": "^18.0.0 || ^20.0.0 || >=22.0.0"
      },
      "funding": {
        "url": "https://github.com/vitejs/vite?sponsor=1"
      },
      "optionalDependencies": {
        "fsevents": "~2.3.3"
      },
      "peerDependencies": {
        "@types/node": "^18.0.0 || ^20.0.0 || >=22.0.0",
        "jiti": ">=1.21.0",
        "less": "*",
        "lightningcss": "^1.21.0",
        "sass": "*",
        "sass-embedded": "*",
        "stylus": "*",
        "sugarss": "*",
        "terser": "^5.16.0",
        "tsx": "^4.8.1",
        "yaml": "^2.4.2"
      },
      "peerDependenciesMeta": {
        "@types/node": {
          "optional": true
        },
        "jiti": {
          "optional": true
        },
        "less": {
          "optional": true
        },
        "lightningcss": {
          "optional": true
        },
        "sass": {
          "optional": true
        },
        "sass-embedded": {
          "optional": true
        },
        "stylus": {
          "optional": true
        },
        "sugarss": {
          "optional": true
        },
        "terser": {
          "optional": true
        },
        "tsx": {
          "optional": true
        },
        "yaml": {
          "optional": true
        }
      }
    },
    "node_modules/workerd": {
      "version": "1.20260301.1",
      "resolved": "https://registry.npmjs.org/workerd/-/workerd-1.20260301.1.tgz",
      "integrity": "sha512-oterQ1IFd3h7PjCfT4znSFOkJCvNQ6YMOyZ40YsnO3nrSpgB4TbJVYWFOnyJAw71/RQuupfVqZZWKvsy8GO3fw==",
      "dev": true,
      "hasInstallScript": true,
      "license": "Apache-2.0",
      "bin": {
        "workerd": "bin/workerd"
      },
      "engines": {
        "node": ">=16"
      },
      "optionalDependencies": {
        "@cloudflare/workerd-darwin-64": "1.20260301.1",
        "@cloudflare/workerd-darwin-arm64": "1.20260301.1",
        "@cloudflare/workerd-linux-64": "1.20260301.1",
        "@cloudflare/workerd-linux-arm64": "1.20260301.1",
        "@cloudflare/workerd-windows-64": "1.20260301.1"
      }
    },
    "node_modules/wrangler": {
      "version": "4.71.0",
      "resolved": "https://registry.npmjs.org/wrangler/-/wrangler-4.71.0.tgz",
      "integrity": "sha512-j6pSGAncOLNQDRzqtp0EqzYj52CldDP7uz/C9cxVrIgqa5p+cc0b4pIwnapZZAGv9E1Loa3tmPD0aXonH7KTkw==",
      "dev": true,
      "license": "MIT OR Apache-2.0",
      "dependencies": {
        "@cloudflare/kv-asset-handler": "0.4.2",
        "@cloudflare/unenv-preset": "2.15.0",
        "blake3-wasm": "2.1.5",
        "esbuild": "0.27.3",
        "miniflare": "4.20260301.1",
        "path-to-regexp": "6.3.0",
        "unenv": "2.0.0-rc.24",
        "workerd": "1.20260301.1"
      },
      "bin": {
        "wrangler": "bin/wrangler.js",
        "wrangler2": "bin/wrangler.js"
      },
      "engines": {
        "node": ">=20.0.0"
      },
      "optionalDependencies": {
        "fsevents": "~2.3.2"
      },
      "peerDependencies": {
        "@cloudflare/workers-types": "^4.20260226.1"
      },
      "peerDependenciesMeta": {
        "@cloudflare/workers-types": {
          "optional": true
        }
      }
    },
    "node_modules/wrangler/node_modules/@esbuild/aix-ppc64": {
      "version": "0.27.3",
      "resolved": "https://registry.npmjs.org/@esbuild/aix-ppc64/-/aix-ppc64-0.27.3.tgz",
      "integrity": "sha512-9fJMTNFTWZMh5qwrBItuziu834eOCUcEqymSH7pY+zoMVEZg3gcPuBNxH1EvfVYe9h0x/Ptw8KBzv7qxb7l8dg==",
      "cpu": [
        "ppc64"
      ],
      "dev": true,
      "license": "MIT",
      "optional": true,
      "os": [
        "aix"
      ],
      "engines": {
        "node": ">=18"
      }
    },
    "node_modules/wrangler/node_modules/@esbuild/android-arm": {
      "version": "0.27.3",
      "resolved": "https://registry.npmjs.org/@esbuild/android-arm/-/android-arm-0.27.3.tgz",
      "integrity": "sha512-i5D1hPY7GIQmXlXhs2w8AWHhenb00+GxjxRncS2ZM7YNVGNfaMxgzSGuO8o8SJzRc/oZwU2bcScvVERk03QhzA==",
      "cpu": [
        "arm"
      ],
      "dev": true,
      "license": "MIT",
      "optional": true,
      "os": [
        "android"
      ],
      "engines": {
        "node": ">=18"
      }
    },
    "node_modules/wrangler/node_modules/@esbuild/android-arm64": {
      "version": "0.27.3",
      "resolved": "https://registry.npmjs.org/@esbuild/android-arm64/-/android-arm64-0.27.3.tgz",
      "integrity": "sha512-YdghPYUmj/FX2SYKJ0OZxf+iaKgMsKHVPF1MAq/P8WirnSpCStzKJFjOjzsW0QQ7oIAiccHdcqjbHmJxRb/dmg==",
      "cpu": [
        "arm64"
      ],
      "dev": true,
      "license": "MIT",
      "optional": true,
      "os": [
        "android"
      ],
      "engines": {
        "node": ">=18"
      }
    },
    "node_modules/wrangler/node_modules/@esbuild/android-x64": {
      "version": "0.27.3",
      "resolved": "https://registry.npmjs.org/@esbuild/android-x64/-/android-x64-0.27.3.tgz",
      "integrity": "sha512-IN/0BNTkHtk8lkOM8JWAYFg4ORxBkZQf9zXiEOfERX/CzxW3Vg1ewAhU7QSWQpVIzTW+b8Xy+lGzdYXV6UZObQ==",
      "cpu": [
        "x64"
      ],
      "dev": true,
      "license": "MIT",
      "optional": true,
      "os": [
        "android"
      ],
      "engines": {
        "node": ">=18"
      }
    },
    "node_modules/wrangler/node_modules/@esbuild/darwin-arm64": {
      "version": "0.27.3",
      "resolved": "https://registry.npmjs.org/@esbuild/darwin-arm64/-/darwin-arm64-0.27.3.tgz",
      "integrity": "sha512-Re491k7ByTVRy0t3EKWajdLIr0gz2kKKfzafkth4Q8A5n1xTHrkqZgLLjFEHVD+AXdUGgQMq+Godfq45mGpCKg==",
      "cpu": [
        "arm64"
      ],
      "dev": true,
      "license": "MIT",
      "optional": true,
      "os": [
        "darwin"
      ],
      "engines": {
        "node": ">=18"
      }
    },
    "node_modules/wrangler/node_modules/@esbuild/darwin-x64": {
      "version": "0.27.3",
      "resolved": "https://registry.npmjs.org/@esbuild/darwin-x64/-/darwin-x64-0.27.3.tgz",
      "integrity": "sha512-vHk/hA7/1AckjGzRqi6wbo+jaShzRowYip6rt6q7VYEDX4LEy1pZfDpdxCBnGtl+A5zq8iXDcyuxwtv3hNtHFg==",
      "cpu": [
        "x64"
      ],
      "dev": true,
      "license": "MIT",
      "optional": true,
      "os": [
        "darwin"
      ],
      "engines": {
        "node": ">=18"
      }
    },
    "node_modules/wrangler/node_modules/@esbuild/freebsd-arm64": {
      "version": "0.27.3",
      "resolved": "https://registry.npmjs.org/@esbuild/freebsd-arm64/-/freebsd-arm64-0.27.3.tgz",
      "integrity": "sha512-ipTYM2fjt3kQAYOvo6vcxJx3nBYAzPjgTCk7QEgZG8AUO3ydUhvelmhrbOheMnGOlaSFUoHXB6un+A7q4ygY9w==",
      "cpu": [
        "arm64"
      ],
      "dev": true,
      "license": "MIT",
      "optional": true,
      "os": [
        "freebsd"
      ],
      "engines": {
        "node": ">=18"
      }
    },
    "node_modules/wrangler/node_modules/@esbuild/freebsd-x64": {
      "version": "0.27.3",
      "resolved": "https://registry.npmjs.org/@esbuild/freebsd-x64/-/freebsd-x64-0.27.3.tgz",
      "integrity": "sha512-dDk0X87T7mI6U3K9VjWtHOXqwAMJBNN2r7bejDsc+j03SEjtD9HrOl8gVFByeM0aJksoUuUVU9TBaZa2rgj0oA==",
      "cpu": [
        "x64"
      ],
      "dev": true,
      "license": "MIT",
      "optional": true,
      "os": [
        "freebsd"
      ],
      "engines": {
        "node": ">=18"
      }
    },
    "node_modules/wrangler/node_modules/@esbuild/linux-arm": {
      "version": "0.27.3",
      "resolved": "https://registry.npmjs.org/@esbuild/linux-arm/-/linux-arm-0.27.3.tgz",
      "integrity": "sha512-s6nPv2QkSupJwLYyfS+gwdirm0ukyTFNl3KTgZEAiJDd+iHZcbTPPcWCcRYH+WlNbwChgH2QkE9NSlNrMT8Gfw==",
      "cpu": [
        "arm"
      ],
      "dev": true,
      "license": "MIT",
      "optional": true,
      "os": [
        "linux"
      ],
      "engines": {
        "node": ">=18"
      }
    },
    "node_modules/wrangler/node_modules/@esbuild/linux-arm64": {
      "version": "0.27.3",
      "resolved": "https://registry.npmjs.org/@esbuild/linux-arm64/-/linux-arm64-0.27.3.tgz",
      "integrity": "sha512-sZOuFz/xWnZ4KH3YfFrKCf1WyPZHakVzTiqji3WDc0BCl2kBwiJLCXpzLzUBLgmp4veFZdvN5ChW4Eq/8Fc2Fg==",
      "cpu": [
        "arm64"
      ],
      "dev": true,
      "license": "MIT",
      "optional": true,
      "os": [
        "linux"
      ],
      "engines": {
        "node": ">=18"
      }
    },
    "node_modules/wrangler/node_modules/@esbuild/linux-ia32": {
      "version": "0.27.3",
      "resolved": "https://registry.npmjs.org/@esbuild/linux-ia32/-/linux-ia32-0.27.3.tgz",
      "integrity": "sha512-yGlQYjdxtLdh0a3jHjuwOrxQjOZYD/C9PfdbgJJF3TIZWnm/tMd/RcNiLngiu4iwcBAOezdnSLAwQDPqTmtTYg==",
      "cpu": [
        "ia32"
      ],
      "dev": true,
      "license": "MIT",
      "optional": true,
      "os": [
        "linux"
      ],
      "engines": {
        "node": ">=18"
      }
    },
    "node_modules/wrangler/node_modules/@esbuild/linux-loong64": {
      "version": "0.27.3",
      "resolved": "https://registry.npmjs.org/@esbuild/linux-loong64/-/linux-loong64-0.27.3.tgz",
      "integrity": "sha512-WO60Sn8ly3gtzhyjATDgieJNet/KqsDlX5nRC5Y3oTFcS1l0KWba+SEa9Ja1GfDqSF1z6hif/SkpQJbL63cgOA==",
      "cpu": [
        "loong64"
      ],
      "dev": true,
      "license": "MIT",
      "optional": true,
      "os": [
        "linux"
      ],
      "engines": {
        "node": ">=18"
      }
    },
    "node_modules/wrangler/node_modules/@esbuild/linux-mips64el": {
      "version": "0.27.3",
      "resolved": "https://registry.npmjs.org/@esbuild/linux-mips64el/-/linux-mips64el-0.27.3.tgz",
      "integrity": "sha512-APsymYA6sGcZ4pD6k+UxbDjOFSvPWyZhjaiPyl/f79xKxwTnrn5QUnXR5prvetuaSMsb4jgeHewIDCIWljrSxw==",
      "cpu": [
        "mips64el"
      ],
      "dev": true,
      "license": "MIT",
      "optional": true,
      "os": [
        "linux"
      ],
      "engines": {
        "node": ">=18"
      }
    },
    "node_modules/wrangler/node_modules/@esbuild/linux-ppc64": {
      "version": "0.27.3",
      "resolved": "https://registry.npmjs.org/@esbuild/linux-ppc64/-/linux-ppc64-0.27.3.tgz",
      "integrity": "sha512-eizBnTeBefojtDb9nSh4vvVQ3V9Qf9Df01PfawPcRzJH4gFSgrObw+LveUyDoKU3kxi5+9RJTCWlj4FjYXVPEA==",
      "cpu": [
        "ppc64"
      ],
      "dev": true,
      "license": "MIT",
      "optional": true,
      "os": [
        "linux"
      ],
      "engines": {
        "node": ">=18"
      }
    },
    "node_modules/wrangler/node_modules/@esbuild/linux-riscv64": {
      "version": "0.27.3",
      "resolved": "https://registry.npmjs.org/@esbuild/linux-riscv64/-/linux-riscv64-0.27.3.tgz",
      "integrity": "sha512-3Emwh0r5wmfm3ssTWRQSyVhbOHvqegUDRd0WhmXKX2mkHJe1SFCMJhagUleMq+Uci34wLSipf8Lagt4LlpRFWQ==",
      "cpu": [
        "riscv64"
      ],
      "dev": true,
      "license": "MIT",
      "optional": true,
      "os": [
        "linux"
      ],
      "engines": {
        "node": ">=18"
      }
    },
    "node_modules/wrangler/node_modules/@esbuild/linux-s390x": {
      "version": "0.27.3",
      "resolved": "https://registry.npmjs.org/@esbuild/linux-s390x/-/linux-s390x-0.27.3.tgz",
      "integrity": "sha512-pBHUx9LzXWBc7MFIEEL0yD/ZVtNgLytvx60gES28GcWMqil8ElCYR4kvbV2BDqsHOvVDRrOxGySBM9Fcv744hw==",
      "cpu": [
        "s390x"
      ],
      "dev": true,
      "license": "MIT",
      "optional": true,
      "os": [
        "linux"
      ],
      "engines": {
        "node": ">=18"
      }
    },
    "node_modules/wrangler/node_modules/@esbuild/linux-x64": {
      "version": "0.27.3",
      "resolved": "https://registry.npmjs.org/@esbuild/linux-x64/-/linux-x64-0.27.3.tgz",
      "integrity": "sha512-Czi8yzXUWIQYAtL/2y6vogER8pvcsOsk5cpwL4Gk5nJqH5UZiVByIY8Eorm5R13gq+DQKYg0+JyQoytLQas4dA==",
      "cpu": [
        "x64"
      ],
      "dev": true,
      "license": "MIT",
      "optional": true,
      "os": [
        "linux"
      ],
      "engines": {
        "node": ">=18"
      }
    },
    "node_modules/wrangler/node_modules/@esbuild/netbsd-arm64": {
      "version": "0.27.3",
      "resolved": "https://registry.npmjs.org/@esbuild/netbsd-arm64/-/netbsd-arm64-0.27.3.tgz",
      "integrity": "sha512-sDpk0RgmTCR/5HguIZa9n9u+HVKf40fbEUt+iTzSnCaGvY9kFP0YKBWZtJaraonFnqef5SlJ8/TiPAxzyS+UoA==",
      "cpu": [
        "arm64"
      ],
      "dev": true,
      "license": "MIT",
      "optional": true,
      "os": [
        "netbsd"
      ],
      "engines": {
        "node": ">=18"
      }
    },
    "node_modules/wrangler/node_modules/@esbuild/netbsd-x64": {
      "version": "0.27.3",
      "resolved": "https://registry.npmjs.org/@esbuild/netbsd-x64/-/netbsd-x64-0.27.3.tgz",
      "integrity": "sha512-P14lFKJl/DdaE00LItAukUdZO5iqNH7+PjoBm+fLQjtxfcfFE20Xf5CrLsmZdq5LFFZzb5JMZ9grUwvtVYzjiA==",
      "cpu": [
        "x64"
      ],
      "dev": true,
      "license": "MIT",
      "optional": true,
      "os": [
        "netbsd"
      ],
      "engines": {
        "node": ">=18"
      }
    },
    "node_modules/wrangler/node_modules/@esbuild/openbsd-arm64": {
      "version": "0.27.3",
      "resolved": "https://registry.npmjs.org/@esbuild/openbsd-arm64/-/openbsd-arm64-0.27.3.tgz",
      "integrity": "sha512-AIcMP77AvirGbRl/UZFTq5hjXK+2wC7qFRGoHSDrZ5v5b8DK/GYpXW3CPRL53NkvDqb9D+alBiC/dV0Fb7eJcw==",
      "cpu": [
        "arm64"
      ],
      "dev": true,
      "license": "MIT",
      "optional": true,
      "os": [
        "openbsd"
      ],
      "engines": {
        "node": ">=18"
      }
    },
    "node_modules/wrangler/node_modules/@esbuild/openbsd-x64": {
      "version": "0.27.3",
      "resolved": "https://registry.npmjs.org/@esbuild/openbsd-x64/-/openbsd-x64-0.27.3.tgz",
      "integrity": "sha512-DnW2sRrBzA+YnE70LKqnM3P+z8vehfJWHXECbwBmH/CU51z6FiqTQTHFenPlHmo3a8UgpLyH3PT+87OViOh1AQ==",
      "cpu": [
        "x64"
      ],
      "dev": true,
      "license": "MIT",
      "optional": true,
      "os": [
        "openbsd"
      ],
      "engines": {
        "node": ">=18"
      }
    },
    "node_modules/wrangler/node_modules/@esbuild/openharmony-arm64": {
      "version": "0.27.3",
      "resolved": "https://registry.npmjs.org/@esbuild/openharmony-arm64/-/openharmony-arm64-0.27.3.tgz",
      "integrity": "sha512-NinAEgr/etERPTsZJ7aEZQvvg/A6IsZG/LgZy+81wON2huV7SrK3e63dU0XhyZP4RKGyTm7aOgmQk0bGp0fy2g==",
      "cpu": [
        "arm64"
      ],
      "dev": true,
      "license": "MIT",
      "optional": true,
      "os": [
        "openharmony"
      ],
      "engines": {
        "node": ">=18"
      }
    },
    "node_modules/wrangler/node_modules/@esbuild/sunos-x64": {
      "version": "0.27.3",
      "resolved": "https://registry.npmjs.org/@esbuild/sunos-x64/-/sunos-x64-0.27.3.tgz",
      "integrity": "sha512-PanZ+nEz+eWoBJ8/f8HKxTTD172SKwdXebZ0ndd953gt1HRBbhMsaNqjTyYLGLPdoWHy4zLU7bDVJztF5f3BHA==",
      "cpu": [
        "x64"
      ],
      "dev": true,
      "license": "MIT",
      "optional": true,
      "os": [
        "sunos"
      ],
      "engines": {
        "node": ">=18"
      }
    },
    "node_modules/wrangler/node_modules/@esbuild/win32-arm64": {
      "version": "0.27.3",
      "resolved": "https://registry.npmjs.org/@esbuild/win32-arm64/-/win32-arm64-0.27.3.tgz",
      "integrity": "sha512-B2t59lWWYrbRDw/tjiWOuzSsFh1Y/E95ofKz7rIVYSQkUYBjfSgf6oeYPNWHToFRr2zx52JKApIcAS/D5TUBnA==",
      "cpu": [
        "arm64"
      ],
      "dev": true,
      "license": "MIT",
      "optional": true,
      "os": [
        "win32"
      ],
      "engines": {
        "node": ">=18"
      }
    },
    "node_modules/wrangler/node_modules/@esbuild/win32-ia32": {
      "version": "0.27.3",
      "resolved": "https://registry.npmjs.org/@esbuild/win32-ia32/-/win32-ia32-0.27.3.tgz",
      "integrity": "sha512-QLKSFeXNS8+tHW7tZpMtjlNb7HKau0QDpwm49u0vUp9y1WOF+PEzkU84y9GqYaAVW8aH8f3GcBck26jh54cX4Q==",
      "cpu": [
        "ia32"
      ],
      "dev": true,
      "license": "MIT",
      "optional": true,
      "os": [
        "win32"
      ],
      "engines": {
        "node": ">=18"
      }
    },
    "node_modules/wrangler/node_modules/@esbuild/win32-x64": {
      "version": "0.27.3",
      "resolved": "https://registry.npmjs.org/@esbuild/win32-x64/-/win32-x64-0.27.3.tgz",
      "integrity": "sha512-4uJGhsxuptu3OcpVAzli+/gWusVGwZZHTlS63hh++ehExkVT8SgiEf7/uC/PclrPPkLhZqGgCTjd0VWLo6xMqA==",
      "cpu": [
        "x64"
      ],
      "dev": true,
      "license": "MIT",
      "optional": true,
      "os": [
        "win32"
      ],
      "engines": {
        "node": ">=18"
      }
    },
    "node_modules/wrangler/node_modules/esbuild": {
      "version": "0.27.3",
      "resolved": "https://registry.npmjs.org/esbuild/-/esbuild-0.27.3.tgz",
      "integrity": "sha512-8VwMnyGCONIs6cWue2IdpHxHnAjzxnw2Zr7MkVxB2vjmQ2ivqGFb4LEG3SMnv0Gb2F/G/2yA8zUaiL1gywDCCg==",
      "dev": true,
      "hasInstallScript": true,
      "license": "MIT",
      "bin": {
        "esbuild": "bin/esbuild"
      },
      "engines": {
        "node": ">=18"
      },
      "optionalDependencies": {
        "@esbuild/aix-ppc64": "0.27.3",
        "@esbuild/android-arm": "0.27.3",
        "@esbuild/android-arm64": "0.27.3",
        "@esbuild/android-x64": "0.27.3",
        "@esbuild/darwin-arm64": "0.27.3",
        "@esbuild/darwin-x64": "0.27.3",
        "@esbuild/freebsd-arm64": "0.27.3",
        "@esbuild/freebsd-x64": "0.27.3",
        "@esbuild/linux-arm": "0.27.3",
        "@esbuild/linux-arm64": "0.27.3",
        "@esbuild/linux-ia32": "0.27.3",
        "@esbuild/linux-loong64": "0.27.3",
        "@esbuild/linux-mips64el": "0.27.3",
        "@esbuild/linux-ppc64": "0.27.3",
        "@esbuild/linux-riscv64": "0.27.3",
        "@esbuild/linux-s390x": "0.27.3",
        "@esbuild/linux-x64": "0.27.3",
        "@esbuild/netbsd-arm64": "0.27.3",
        "@esbuild/netbsd-x64": "0.27.3",
        "@esbuild/openbsd-arm64": "0.27.3",
        "@esbuild/openbsd-x64": "0.27.3",
        "@esbuild/openharmony-arm64": "0.27.3",
        "@esbuild/sunos-x64": "0.27.3",
        "@esbuild/win32-arm64": "0.27.3",
        "@esbuild/win32-ia32": "0.27.3",
        "@esbuild/win32-x64": "0.27.3"
      }
    },
    "node_modules/ws": {
      "version": "8.18.0",
      "resolved": "https://registry.npmjs.org/ws/-/ws-8.18.0.tgz",
      "integrity": "sha512-8VbfWfHLbbwu3+N6OKsOMpBdT4kXPDDB9cJk2bJ6mh9ucxdlnNvH1e+roYkKmN9Nxw2yjz7VzeO9oOz2zJ04Pw==",
      "dev": true,
      "license": "MIT",
      "engines": {
        "node": ">=10.0.0"
      },
      "peerDependencies": {
        "bufferutil": "^4.0.1",
        "utf-8-validate": ">=5.0.2"
      },
      "peerDependenciesMeta": {
        "bufferutil": {
          "optional": true
        },
        "utf-8-validate": {
          "optional": true
        }
      }
    },
    "node_modules/youch": {
      "version": "4.1.0-beta.10",
      "resolved": "https://registry.npmjs.org/youch/-/youch-4.1.0-beta.10.tgz",
      "integrity": "sha512-rLfVLB4FgQneDr0dv1oddCVZmKjcJ6yX6mS4pU82Mq/Dt9a3cLZQ62pDBL4AUO+uVrCvtWz3ZFUL2HFAFJ/BXQ==",
      "dev": true,
      "license": "MIT",
      "dependencies": {
        "@poppinss/colors": "^4.1.5",
        "@poppinss/dumper": "^0.6.4",
        "@speed-highlight/core": "^1.2.7",
        "cookie": "^1.0.2",
        "youch-core": "^0.3.3"
      }
    },
    "node_modules/youch-core": {
      "version": "0.3.3",
      "resolved": "https://registry.npmjs.org/youch-core/-/youch-core-0.3.3.tgz",
      "integrity": "sha512-ho7XuGjLaJ2hWHoK8yFnsUGy2Y5uDpqSTq1FkHLK4/oqKtyUU1AFbOOxY4IpC9f0fTLjwYbslUz0Po5BpD1wrA==",
      "dev": true,
      "license": "MIT",
      "dependencies": {
        "@poppinss/exception": "^1.2.2",
        "error-stack-parser-es": "^1.0.5"
      }
    }
  }
}

```

## FILE: package.json
```json
{
  "name": "webapp",
  "type": "module",
  "scripts": {
    "dev": "vite",
    "build": "vite build",
    "test": "node --test --experimental-strip-types --experimental-specifier-resolution=node src/services/auth.test.ts src/routes/api.smoke.test.ts",
    "test:e2e": "node scripts/local-e2e.mjs",
    "doctor:prod": "node scripts/production-doctor.mjs",
    "preview": "wrangler pages dev",
    "deploy": "npm run build && wrangler pages deploy",
    "cf-typegen": "wrangler types --env-interface CloudflareBindings"
  },
  "dependencies": {
    "@portone/server-sdk": "^0.15.0",
    "hono": "^4.12.6"
  },
  "devDependencies": {
    "@cloudflare/workers-types": "^4.20260310.1",
    "@hono/vite-build": "^1.2.0",
    "@hono/vite-dev-server": "^0.18.2",
    "playwright": "^1.58.2",
    "vite": "^6.3.5",
    "wrangler": "^4.4.0"
  }
}

```

## FILE: public/static/style.css
```css
/* Respondio - Custom Styles */
:root {
  --brand-50: #FFF7ED;
  --brand-100: #FFEDD5;
  --brand-500: #F97316;
  --brand-600: #EA580C;
}

* {
  -webkit-tap-highlight-color: transparent;
}

html {
  scroll-behavior: smooth;
}

body {
  -webkit-font-smoothing: antialiased;
  -moz-osx-font-smoothing: grayscale;
}

/* PWA standalone mode adjustments */
@media all and (display-mode: standalone) {
  body {
    padding-top: env(safe-area-inset-top);
  }
}

```

## FILE: public/sw.js
```js
const CACHE_NAME = 'respondio-v1';
const URLS_TO_CACHE = [
  '/',
  '/dashboard',
  '/reviews',
  '/billing',
  '/static/style.css',
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(URLS_TO_CACHE))
  );
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((k) => k !== CACHE_NAME).map((k) => caches.delete(k)))
    )
  );
  self.clients.claim();
});

self.addEventListener('fetch', (event) => {
  if (event.request.url.includes('/api/')) return;
  event.respondWith(
    caches.match(event.request).then((cached) => {
      return cached || fetch(event.request).then((response) => {
        const clone = response.clone();
        caches.open(CACHE_NAME).then((cache) => cache.put(event.request, clone));
        return response;
      });
    }).catch(() => caches.match('/'))
  );
});

```

## FILE: README.md
```md
# Respondio - AI 배달 리뷰 자동답변 SaaS

## Project Overview
- **Name**: Respondio
- **Goal**: 배달 플랫폼(배민/쿠팡이츠/요기요) 리뷰를 AI로 자동 관리하는 SaaS
- **Tech Stack**: Hono + TypeScript + Cloudflare Pages + Playwright + Tailwind CSS

## Current Architecture Direction
- **메인 웹앱/API는 Hono + D1 + Cloudflare Pages/Workers 유지**
- **크롤러는 Node.js + Playwright 별도 프로세스로 유지**
- **Next.js + Redis + R2 + worker 분리는 장기 확장안**이며, 즉시 마이그레이션 대상이 아님
- **젠스파크 AI개발자 배포 기준으로는 현재 구조를 고도화하는 편이 더 안전**

## URLs
- **웹앱**: https://3000-ir517r00gc4sr4252u90m-82b888ba.sandbox.novita.ai
- **크롤러 API**: https://4000-ir517r00gc4sr4252u90m-82b888ba.sandbox.novita.ai

## 완료된 기능

### 사용자 (사장님) 페이지
| 경로 | 설명 |
|------|------|
| `/` | 랜딩 페이지 (기능 소개, 요금제, FAQ) |
| `/login` | 로그인/회원가입 (사장님/관리자 빠른 로그인) |
| `/dashboard` | 메인 대시보드 (KPI 6개, 최근 리뷰, 메뉴 평판 차트, 충성 고객, 트렌드) |
| `/reviews` | 리뷰 관리 (필터, AI 답변 생성/승인, 리뷰 수집) |
| `/customers` | 고객 분석 (단골/재방문 고객 목록) |
| `/billing` | 구독/결제 (요금제 비교, 결제 내역, 결제 수단) |
| `/settings` | 설정 (매장 정보, 답변 스타일, 자동 응답) |

### 관리자 페이지
| 경로 | 설명 |
|------|------|
| `/admin` | 운영 대시보드 (KPI, 에러 로그, 에러율 차트, 작업 큐, DLQ, 사용자 관리, 크롤러 상태) |

### 접속 방법
- **사장님**: `/login` → 사장님 로그인 버튼 (owner@test.com / password)
- **관리자**: `/login` → 관리자 로그인 버튼 (admin@respondio.com / admin123)

### 백엔드 API (base: /api/v1)
| 엔드포인트 | 메서드 | 설명 |
|-----------|--------|------|
| `/auth/login` | POST | 로그인 |
| `/auth/signup` | POST | 회원가입 |
| `/auth/refresh` | POST | refresh token으로 access token 재발급 |
| `/auth/logout` | POST | 로그아웃 및 세션 폐기 |
| `/auth/me` | GET | 현재 로그인 사용자 조회 |
| `/reviews` | GET | 리뷰 목록 (필터: status, platform, sentiment) |
| `/reviews/:id/generate` | POST | AI 답변 생성 (GPT/템플릿) |
| `/reviews/:id/analyze` | POST | 감정 분석 |
| `/reviews/batch-generate` | POST | 미답변 리뷰 일괄 AI 생성 |
| `/reviews/batch-analyze` | POST | 일괄 감정 분석 |
| `/reviews/approve` | POST | 답변 승인 |
| `/reviews/:id/post` | POST | 승인된 답변 수동 등록 |
| `/reviews/:id/reply` | PATCH | 답변 수정 |
| `/reviews/sync` | POST | 크롤러를 통한 리뷰 수집 |
| `/dashboard/summary` | GET | 대시보드 KPI |
| `/dashboard/menus` | GET | 메뉴 평판 분석 |
| `/dashboard/repeat_customers` | GET | 재방문/단골 고객 |
| `/dashboard/daily_trend` | GET | 7일 리뷰 트렌드 |
| `/plans` | GET | 요금제 목록 |
| `/subscriptions` | GET | 현재 구독 정보 |
| `/payments` | GET | 결제 내역 |
| `/crawler/status` | GET | 크롤러 서버 상태 |
| `/crawler/reviews` | POST | 크롤러에서 수집한 리뷰 DB 저장 |
| `/admin/users` | GET | 사용자 관리 |
| `/admin/logs` | GET | 작업 로그 |
| `/admin/stats` | GET | 관리자 통계 |
| `/admin/jobs/:id/retry` | POST | 실패 작업 재시도 |

### 크롤링 서버 API (port 4000)
| 엔드포인트 | 메서드 | 설명 |
|-----------|--------|------|
| `/health` | GET | 서버 상태 |
| `/platforms` | GET | 지원 플랫폼 목록 |
| `/sessions` | GET | 세션 상태 |
| `/login` | POST | 플랫폼 로그인 |
| `/fetch-reviews` | POST | 리뷰 수집 (단일 플랫폼) |
| `/fetch-all` | POST | 전체 플랫폼 리뷰 수집 |
| `/post-reply` | POST | 답변 게시 |
| `/sync-to-webapp` | POST | 수집 + DB 동기화 |
| `/auto-sync/start` | POST | 자동 동기화 시작 |
| `/auto-sync/stop` | POST | 자동 동기화 중지 |
| `/jobs` | GET | 작업 이력 |

## 데이터 아키텍처
- **Database**: Cloudflare D1 (SQLite)
- **테이블**: users, stores, store_platform_connections, reviews, reply_candidates, replies, customers, banned_words, plans, subscriptions, payments, payment_methods, dashboard_daily_summaries, job_logs

## AI 기능
- GPT 기반 리뷰 답변 생성 (gpt-5-mini via GenSpark LLM Proxy)
- 감정 분석 (positive/neutral/negative)
- 품질 점수 산정 (1.0~10.0, 5가지 기준)
- 사장님 말투 학습 (reply_tone_sample)
- 4가지 답변 스타일 (친근/정중/캐주얼/커스텀)
- 고객 유형별 맞춤 답변 (신규/재방문/단골)
- 금칙어 필터링
- 리뷰당 최대 3회 재생성
- API 오류 시 템플릿 폴백

## 현재 제한사항
1. **JWT access token + refresh token/httpOnly cookie는 구현됨** - 다만 기기별 세션 관리/강제 로그아웃 UI는 아직 없음
2. **API 스코프는 사용자/매장 기준으로 정리됨** - 일부 UI 문구와 시드 데이터는 여전히 데모 전제
3. **크롤러 URL은 설정 가능** - 프로덕션에서는 `CRAWLER_API_BASE`, `CRAWLER_SHARED_SECRET`, `CREDENTIALS_ENCRYPTION_KEY` 배선이 필요
4. **PortOne 결제 경로는 구현됨** - 실제 결제 검증/웹훅 운영은 `PORTONE_STORE_ID`, `PORTONE_CHANNEL_KEY`, `PORTONE_API_SECRET`, `PORTONE_WEBHOOK_SECRET`, `APP_BASE_URL` 설정이 있어야 동작
5. **테스트는 확장됨** - auth/API 스모크와 로컬 Cloudflare+Crawler 브라우저 E2E(`npm run test:e2e`)가 추가됨
6. **PWA는 부분 구현** - 서비스워커 등록은 추가됐지만 설치/오프라인 동작 검증은 아직 필요

## Required Environment Variables
- **Cloudflare Pages / Workers secrets**: `OPENAI_API_KEY`, `JWT_SECRET`, `CRAWLER_SHARED_SECRET`, `CREDENTIALS_ENCRYPTION_KEY`, `PORTONE_API_SECRET`, `PORTONE_WEBHOOK_SECRET`
- **Cloudflare Pages / Workers vars**: `OPENAI_BASE_URL`, `CRAWLER_API_BASE`, `APP_BASE_URL`, `PORTONE_STORE_ID`, `PORTONE_CHANNEL_KEY`
- **Crawler server vars**: `WEBAPP_API`, `CRAWLER_SHARED_SECRET`, `CRAWLER_PORT`, `CRAWLER_TEST_MODE`

## 서버 실행
```bash
# 웹앱 (port 3000)
cd /Users/junho/Documents/Respondio && npm run build && pm2 start ecosystem.config.cjs

# 크롤러 (port 4000)
pm2 start crawler/ecosystem.config.cjs

# 상태 확인
pm2 list
```

## 테스트
```bash
# auth + API smoke
npm test

# production readiness
npm run doctor:prod

# 로컬 Cloudflare Pages + D1 + crawler + browser E2E
npm run test:e2e
```

## Deployment
- **Platform**: Cloudflare Pages
- **Status**: Sandbox에서 실행 중
- **Last Updated**: 2026-03-11

### Recommended Deployment Split
- **웹앱/API**: Cloudflare Pages + Workers + D1
- **크롤러**: 별도 Node.js 서버(Render/VPS/PM2 등)
- **추후 필요 시 추가**: R2 for failure artifacts, Redis for queueing

### Production Deploy Note
- **로컬 smoke는 통과**: `wrangler pages dev` + D1 migration/seed + crawler 운영 경로 + browser E2E 확인
- **원격 배포는 현재 보류**: 이 환경에서 `wrangler whoami` 결과가 `You are not authenticated. Please run wrangler login.` 이므로 실제 Cloudflare 배포는 인증 후 진행 가능
- **사용자 가이드북**: [docs/PRODUCTION_SETUP_GUIDE.md](/Users/junho/Documents/Respondio%20/docs/PRODUCTION_SETUP_GUIDE.md)

```

## FILE: scripts/local-e2e.mjs
```js
import { mkdtemp, mkdir } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { spawn } from 'node:child_process'
import process from 'node:process'
import { chromium } from 'playwright'

const cwd = process.cwd()
const baseUrl = 'http://127.0.0.1:8789'
const crawlerUrl = 'http://127.0.0.1:4010'
const crawlerSecret = 'respondio-e2e-secret'

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

function createLogger(name) {
  const chunks = []

  return {
    push(chunk) {
      const text = String(chunk || '')
      if (!text) return
      chunks.push(text)
      if (chunks.length > 200) chunks.shift()
      process.stdout.write(`[${name}] ${text}`)
    },
    tail() {
      return chunks.join('').trim()
    }
  }
}

function runCommand(command, args, options = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      cwd,
      env: { ...process.env, ...(options.env || {}) },
      stdio: ['ignore', 'pipe', 'pipe']
    })

    let stdout = ''
    let stderr = ''

    child.stdout.on('data', (chunk) => {
      stdout += String(chunk)
    })
    child.stderr.on('data', (chunk) => {
      stderr += String(chunk)
    })
    child.on('error', reject)
    child.on('close', (code) => {
      if (code === 0) {
        resolve({ stdout, stderr })
        return
      }

      reject(new Error(`${command} ${args.join(' ')} failed with code ${code}\n${stdout}\n${stderr}`))
    })
  })
}

function startProcess(name, command, args, env = {}) {
  const logger = createLogger(name)
  const child = spawn(command, args, {
    cwd,
    env: { ...process.env, ...env },
    stdio: ['ignore', 'pipe', 'pipe']
  })

  child.stdout.on('data', (chunk) => logger.push(chunk))
  child.stderr.on('data', (chunk) => logger.push(chunk))

  return { child, logger }
}

async function waitForUrl(url, label, timeoutMs = 30_000) {
  const startedAt = Date.now()
  let lastError = null

  while (Date.now() - startedAt < timeoutMs) {
    try {
      const response = await fetch(url)
      if (response.ok) return
      lastError = new Error(`${label} returned ${response.status}`)
    } catch (error) {
      lastError = error
    }

    await sleep(500)
  }

  throw new Error(`${label} did not become ready: ${lastError?.message || 'unknown error'}`)
}

async function stopProcess(handle) {
  if (!handle?.child || handle.child.exitCode !== null) return

  handle.child.kill('SIGTERM')
  await Promise.race([
    new Promise((resolve) => handle.child.once('close', resolve)),
    sleep(3_000)
  ])

  if (handle.child.exitCode === null) {
    handle.child.kill('SIGKILL')
    await Promise.race([
      new Promise((resolve) => handle.child.once('close', resolve)),
      sleep(1_000)
    ])
  }
}

async function captureDialog(page, action) {
  const dialogPromise = page.waitForEvent('dialog', { timeout: 20_000 })
  await action()
  const dialog = await dialogPromise
  const message = dialog.message()
  await dialog.accept()
  return message
}

async function connectPlatform(page, platform, email, password, platformStoreId) {
  const labels = {
    baemin: '배달의민족',
    coupang_eats: '쿠팡이츠',
    yogiyo: '요기요'
  }
  await page.locator(`#${platform}-email`).waitFor({ timeout: 20_000 })
  await page.fill(`#${platform}-email`, email)
  await page.fill(`#${platform}-password`, password)
  await page.fill(`#${platform}-store-id`, platformStoreId)

  await page.evaluate(async (platformName) => {
    await window.connectPlatform(platformName)
  }, platform)
  await page.locator('#settings-alert').filter({ hasText: `${labels[platform]} 계정이 연결되었습니다.` }).waitFor({ timeout: 15_000 })
}

async function main() {
  const tempRoot = await mkdtemp(join(tmpdir(), 'respondio-e2e-'))
  const wranglerHome = join(tempRoot, 'wrangler-home')
  const persistDir = join(tempRoot, 'wrangler-state')
  await mkdir(wranglerHome, { recursive: true })
  await mkdir(persistDir, { recursive: true })

  const env = {
    HOME: wranglerHome
  }

  const results = {
    build: false,
    apiTests: false,
    billingPage: false,
    platformConnect: false,
    liveSync: false,
    manualPost: false
  }

  let crawlerHandle = null
  let webHandle = null
  let browser = null

  try {
    console.log('Running unit/API smoke tests...')
    await runCommand('npm', ['test'], { env })
    results.apiTests = true

    console.log('Building production bundle...')
    await runCommand('npm', ['run', 'build'], { env })
    results.build = true

    console.log('Applying local D1 migrations...')
    await runCommand('npx', ['wrangler', 'd1', 'migrations', 'apply', 'respondio-production', '--local', '--persist-to', persistDir], { env })
    console.log('Seeding local D1...')
    await runCommand('npx', ['wrangler', 'd1', 'execute', 'respondio-production', '--local', '--persist-to', persistDir, '--file=./seed.sql'], { env })

    console.log('Starting crawler in operational test mode...')
    crawlerHandle = startProcess('crawler', 'node', ['crawler/index.js'], {
      CRAWLER_PORT: '4010',
      CRAWLER_SHARED_SECRET: crawlerSecret,
      CRAWLER_TEST_MODE: '1',
      WEBAPP_API: `${baseUrl}/api/v1`
    })
    await waitForUrl(`${crawlerUrl}/health`, 'crawler', 20_000)

    console.log('Starting local Cloudflare Pages runtime...')
    webHandle = startProcess('pages', 'npx', [
      'wrangler',
      'pages',
      'dev',
      'dist',
      '--d1=respondio-production',
      '--local',
      '--persist-to',
      persistDir,
      '--ip',
      '127.0.0.1',
      '--port',
      '8789',
      '--binding',
      `JWT_SECRET=respondio-e2e-jwt-secret`,
      '--binding',
      `CRAWLER_API_BASE=${crawlerUrl}`,
      '--binding',
      `CRAWLER_SHARED_SECRET=${crawlerSecret}`,
      '--binding',
      `CREDENTIALS_ENCRYPTION_KEY=respondio-e2e-credentials-key`,
      '--binding',
      `APP_BASE_URL=${baseUrl}`,
      '--show-interactive-dev-session=false'
    ], env)
    await waitForUrl(`${baseUrl}/login`, 'webapp', 30_000)

    browser = await chromium.launch({ headless: true })
    const page = await browser.newPage()
    page.setDefaultTimeout(20_000)

    const pageErrors = []
    page.on('pageerror', (error) => {
      pageErrors.push(error.message)
    })

    console.log('Executing browser E2E flow...')

    await page.goto(`${baseUrl}/login`, { waitUntil: 'domcontentloaded' })
    await page.fill('#login-email', 'owner@test.com')
    await page.fill('#login-pw', 'password')
    await page.locator('#form-login button[type="submit"]').click()
    await page.waitForURL(`${baseUrl}/dashboard`, { timeout: 20_000 })
    await page.getByRole('heading', { name: /안녕하세요/ }).waitFor()

    await page.goto(`${baseUrl}/billing`, { waitUntil: 'domcontentloaded' })
    await page.locator('#current-plan-name').filter({ hasText: '프로' }).waitFor()
    await page.locator('#billing-alert').filter({ hasText: 'PortOne 설정이 아직 완료되지 않았습니다.' }).waitFor()
    results.billingPage = true

    await page.goto(`${baseUrl}/settings`, { waitUntil: 'domcontentloaded' })
    await page.locator('#store-name').waitFor()
    await connectPlatform(page, 'baemin', 'baemin@test.local', 'pw-test-1', 'BM-LIVE-001')
    await connectPlatform(page, 'coupang_eats', 'coupang@test.local', 'pw-test-2', 'CP-LIVE-001')
    await connectPlatform(page, 'yogiyo', 'yogiyo@test.local', 'pw-test-3', 'YG-LIVE-001')
    results.platformConnect = true

    await page.goto(`${baseUrl}/reviews`, { waitUntil: 'domcontentloaded' })
    await page.locator('#review-list').waitFor()
    await page.selectOption('#sync-mode', 'live')
    const syncMessage = await captureDialog(page, async () => {
      await page.locator('#btn-sync').click()
    })

    if (!syncMessage.includes('새 리뷰')) {
      throw new Error(`Unexpected sync dialog: ${syncMessage}`)
    }

    await page.waitForLoadState('domcontentloaded')
    await page.locator('#review-list > div', { hasText: '실전 운영 테스트 리뷰입니다.' }).waitFor({ timeout: 20_000 })
    results.liveSync = true

    await page.locator('#review-list > div', { hasText: '피자가 조금 식어서 왔어요. 그래도 맛은 괜찮았습니다.' }).click()
    const approveButton = page.locator('#ai-response-content button', { hasText: '승인' })
    await approveButton.waitFor()
    const approveResponsePromise = page.waitForResponse((response) =>
      response.url().includes('/api/v1/reviews/approve') && response.request().method() === 'POST'
    )
    await approveButton.click()
    const approveResponse = await approveResponsePromise
    if (!approveResponse.ok()) {
      throw new Error(`Reply approval request failed with status ${approveResponse.status()}`)
    }
    await page.waitForTimeout(500)
    const postedReview = await page.evaluate(async () => {
      const response = await window.apiFetch('/api/v1/reviews?limit=50')
      const data = await response.json()
      return (data.reviews || []).find((review) =>
        String(review.review_text || '').includes('피자가 조금 식어서 왔어요. 그래도 맛은 괜찮았습니다.')
      ) || null
    })
    if (!postedReview || postedReview.status !== 'posted') {
      throw new Error(`Reply post status mismatch: ${JSON.stringify(postedReview)}`)
    }
    results.manualPost = true

    console.log('E2E completed successfully.')
    if (pageErrors.length) {
      console.log('Ignored browser page errors:')
      console.log(pageErrors.join('\n'))
    }
    console.log(JSON.stringify(results, null, 2))
  } finally {
    if (browser) await browser.close().catch(() => {})
    await stopProcess(webHandle)
    await stopProcess(crawlerHandle)

    if (webHandle?.logger?.tail()) {
      console.log('\n[pages tail]')
      console.log(webHandle.logger.tail())
    }
    if (crawlerHandle?.logger?.tail()) {
      console.log('\n[crawler tail]')
      console.log(crawlerHandle.logger.tail())
    }
  }
}

main().catch((error) => {
  console.error(error.stack || error.message)
  process.exitCode = 1
})

```

## FILE: scripts/production-doctor.mjs
```js
import { access } from 'node:fs/promises'
import { spawn } from 'node:child_process'
import process from 'node:process'

const workerSecrets = [
  'OPENAI_API_KEY',
  'JWT_SECRET',
  'CRAWLER_SHARED_SECRET',
  'CREDENTIALS_ENCRYPTION_KEY',
  'PORTONE_API_SECRET',
  'PORTONE_WEBHOOK_SECRET'
]

const workerVars = [
  'OPENAI_BASE_URL',
  'CRAWLER_API_BASE',
  'APP_BASE_URL',
  'PORTONE_STORE_ID',
  'PORTONE_CHANNEL_KEY'
]

const crawlerVars = [
  'WEBAPP_API',
  'CRAWLER_SHARED_SECRET',
  'CRAWLER_PORT'
]

function run(command, args, envOverrides = {}) {
  return new Promise((resolve) => {
    const child = spawn(command, args, {
      cwd: process.cwd(),
      env: { ...process.env, ...envOverrides },
      stdio: ['ignore', 'pipe', 'pipe']
    })

    let stdout = ''
    let stderr = ''

    child.stdout.on('data', (chunk) => {
      stdout += String(chunk)
    })
    child.stderr.on('data', (chunk) => {
      stderr += String(chunk)
    })

    child.on('close', (code) => {
      resolve({ code, stdout, stderr })
    })
  })
}

async function fileExists(path) {
  try {
    await access(path)
    return true
  } catch {
    return false
  }
}

function formatStatus(label, ok, detail) {
  const icon = ok ? 'OK ' : 'NO '
  return `${icon} ${label}: ${detail}`
}

function checkEnvGroup(name, keys) {
  const missing = keys.filter((key) => !process.env[key])
  return {
    name,
    ok: missing.length === 0,
    missing
  }
}

async function main() {
  const buildReady = await fileExists('dist/_worker.js')
  const wranglerConfigReady = await fileExists('wrangler.jsonc')
  const crawlerDepsReady = await fileExists('crawler/node_modules/express/index.js')

  const authCheck = await run('npx', ['wrangler', 'whoami'], {
    HOME: process.env.HOME || '/tmp/respondio-wrangler-home'
  })
  const wranglerAuthed = authCheck.code === 0 && !authCheck.stdout.includes('You are not authenticated')

  const groups = [
    checkEnvGroup('Cloudflare secrets', workerSecrets),
    checkEnvGroup('Cloudflare vars', workerVars),
    checkEnvGroup('Crawler vars', crawlerVars)
  ]

  console.log('Respondio Production Doctor')
  console.log('')
  console.log(formatStatus('wrangler.jsonc', wranglerConfigReady, wranglerConfigReady ? 'found' : 'missing'))
  console.log(formatStatus('dist/_worker.js', buildReady, buildReady ? 'build artifact ready' : 'run npm run build'))
  console.log(formatStatus('crawler dependencies', crawlerDepsReady, crawlerDepsReady ? 'installed' : 'run npm install in crawler/'))
  console.log(formatStatus('Cloudflare auth', wranglerAuthed, wranglerAuthed ? 'authenticated' : 'wrangler login required'))
  console.log('')

  for (const group of groups) {
    const detail = group.ok
      ? 'all required values are present in the current shell'
      : `missing ${group.missing.join(', ')}`
    console.log(formatStatus(group.name, group.ok, detail))
  }

  const blockers = []
  if (!wranglerConfigReady) blockers.push('wrangler config missing')
  if (!buildReady) blockers.push('build artifact missing')
  if (!crawlerDepsReady) blockers.push('crawler dependencies missing')
  if (!wranglerAuthed) blockers.push('wrangler login required')
  for (const group of groups) {
    if (!group.ok) blockers.push(`${group.name} incomplete`)
  }

  console.log('')
  if (blockers.length === 0) {
    console.log('Ready for production deployment.')
    return
  }

  console.log('Current blockers:')
  for (const blocker of blockers) {
    console.log(`- ${blocker}`)
  }

  console.log('')
  console.log('Guide: docs/PRODUCTION_SETUP_GUIDE.md')
  process.exitCode = 1
}

main().catch((error) => {
  console.error(error.stack || error.message)
  process.exitCode = 1
})

```

## FILE: seed.sql
```sql
-- Respondio Seed Data

-- 요금제 데이터
INSERT OR IGNORE INTO plans (name, slug, price, review_limit, features) VALUES
  ('베이직', 'basic', 29000, 300, '{"analytics":"basic","reply_style":"default"}'),
  ('프로', 'pro', 59000, 800, '{"analytics":"advanced","reply_style":"custom","tone_learning":true}'),
  ('프리미엄', 'premium', 99000, 2000, '{"analytics":"premium","reply_style":"custom","tone_learning":true,"priority_support":true}');

-- 테스트 사용자
INSERT OR IGNORE INTO users (email, password_hash, name, role) VALUES
  ('owner@test.com', 'hashed_password_123', '김사장', 'owner'),
  ('admin@respondio.com', 'hashed_admin_123', '관리자', 'super_admin');

-- 테스트 매장
INSERT OR IGNORE INTO stores (user_id, store_name, business_number_masked, reply_style) VALUES
  (1, '맛있는 치킨집', '123-45-***', 'friendly');

-- 플랫폼 연결
INSERT OR IGNORE INTO store_platform_connections (store_id, platform, connection_status, platform_store_id) VALUES
  (1, 'baemin', 'connected', 'BM-12345'),
  (1, 'coupang_eats', 'connected', 'CE-67890'),
  (1, 'yogiyo', 'connected', 'YG-11111');

-- 테스트 리뷰 데이터
INSERT OR IGNORE INTO reviews (store_id, platform, platform_review_id, customer_name, rating, review_text, menu_items, sentiment, status, is_repeat_customer, customer_type, created_at) VALUES
  (1, 'baemin', 'baemin-seed-001', '김민수', 5.0, '치킨이 진짜 맛있어요! 배달도 빠르고 감자튀김도 바삭해요. 항상 만족합니다.', '["양념치킨","감자튀김"]', 'positive', 'posted', 1, 'loyal', datetime('now', '-2 hours')),
  (1, 'yogiyo', 'yogiyo-seed-002', '이영희', 4.0, '피자가 조금 식어서 왔어요. 그래도 맛은 괜찮았습니다.', '["페퍼로니 피자","콜라 1.25L"]', 'neutral', 'generated', 0, 'new', datetime('now', '-4 hours')),
  (1, 'coupang_eats', 'coupang-seed-003', '박지훈', 5.0, '항상 시켜 먹는 집이에요. 오늘도 맛있게 잘 먹었어요!', '["제육볶음","김치찌개"]', 'positive', 'approved', 1, 'loyal', datetime('now', '-6 hours')),
  (1, 'baemin', 'baemin-seed-004', '최수진', 3.0, '음식이 너무 늦게 왔어요. 가격에 비해 양도 적어요.', '["불고기 덮밥"]', 'negative', 'pending', 0, 'new', datetime('now', '-8 hours')),
  (1, 'baemin', 'baemin-seed-005', '정유진', 5.0, '여기 치킨은 언제 먹어도 맛있어요! 소스도 맛있고 양도 충분해요.', '["후라이드치킨","양념소스"]', 'positive', 'posted', 1, 'repeat', datetime('now', '-1 day')),
  (1, 'coupang_eats', 'coupang-seed-006', '한민지', 4.0, '배달은 빨랐는데 국물이 좀 쏟아져 왔어요. 맛은 좋아요.', '["김치찌개","공기밥"]', 'neutral', 'pending', 0, 'new', datetime('now', '-1 day')),
  (1, 'yogiyo', 'yogiyo-seed-007', '오세훈', 5.0, '사장님이 서비스도 넣어주시고 감동이에요. 단골될게요!', '["떡볶이","순대","튀김"]', 'positive', 'posted', 0, 'new', datetime('now', '-2 days')),
  (1, 'baemin', 'baemin-seed-008', '이원지', 4.0, '음식이 너무 늦게 왔어요. 가성비는 괜찮습니다.', '["비빔밥","된장찌개"]', 'negative', 'pending', 0, 'new', datetime('now', '-3 hours')),
  (1, 'baemin', 'baemin-seed-009', '박형준', 5.0, '항상 여기서 주문해요! 최고에요~', '["간장치킨","맥주"]', 'positive', 'posted', 1, 'loyal', datetime('now', '-2 days')),
  (1, 'coupang_eats', 'coupang-seed-010', '김태영', 4.5, '맛있게 잘 먹었습니다. 다음에도 주문할게요.', '["돈까스","우동"]', 'positive', 'generated', 1, 'repeat', datetime('now', '-3 days')),
  (1, 'yogiyo', 'yogiyo-seed-011', '윤서연', 2.0, '기대보다 별로였어요. 양도 적고 맛도 그냥 그래요.', '["짜장면"]', 'negative', 'pending', 0, 'new', datetime('now', '-4 days')),
  (1, 'baemin', 'baemin-seed-012', '장현우', 5.0, '매번 주문하는데 한번도 실망한 적이 없어요!', '["양념치킨","치즈볼"]', 'positive', 'posted', 1, 'loyal', datetime('now', '-5 days'));

-- AI 답변 후보 데이터
INSERT OR IGNORE INTO reply_candidates (review_id, reply_text, style_type, quality_score, is_selected) VALUES
  (1, '리뷰 남겨주셔서 감사합니다! 빠른 배달과 맛있는 치킨이 만족스러우셨다니 다행입니다. 앞으로도 맛있는 음식과 빠른 서비스로 보답하겠습니다. 언제든 찾아주세요!', 'friendly', 9.1, 1),
  (2, '리뷰 감사합니다! 피자가 식어서 도착했다니 정말 죄송합니다. 다음에는 더 빠르게 배달될 수 있도록 노력하겠습니다. 맛은 괜찮으셨다니 다행이에요!', 'polite', 8.5, 1),
  (3, '항상 찾아주셔서 감사합니다! 오늘도 맛있게 드셨다니 기분 좋습니다. 단골 고객님께 항상 최고의 맛을 드리겠습니다!', 'friendly', 9.3, 1),
  (4, '소중한 리뷰 감사합니다. 배달이 늦어져서 정말 죄송합니다. 양과 가격에 대해서도 다시 검토해보겠습니다. 다음엔 더 좋은 모습 보여드리겠습니다.', 'polite', 8.8, 0);

-- 최종 답변 데이터
INSERT OR IGNORE INTO replies (review_id, candidate_id, final_reply_text, posted_at, post_status) VALUES
  (1, 1, '리뷰 남겨주셔서 감사합니다! 빠른 배달과 맛있는 치킨이 만족스러우셨다니 다행입니다. 앞으로도 맛있는 음식과 빠른 서비스로 보답하겠습니다. 언제든 찾아주세요!', datetime('now', '-1 hour'), 'posted'),
  (5, NULL, '항상 찾아주셔서 정말 감사합니다! 치킨과 소스 모두 마음에 드셨다니 보람차네요. 단골 고객님 덕분에 힘을 내고 있답니다!', datetime('now', '-20 hours'), 'posted'),
  (7, NULL, '감동적인 리뷰 감사합니다! 서비스가 마음에 드셨다니 기쁩니다. 꼭 단골 되어주세요, 항상 정성껏 준비하겠습니다!', datetime('now', '-2 days'), 'posted'),
  (9, NULL, '항상 믿고 주문해주셔서 감사합니다! 앞으로도 변함없는 맛으로 보답하겠습니다. 간장치킨 최고죠!', datetime('now', '-2 days'), 'posted'),
  (12, NULL, '매번 찾아주시는 단골 고객님! 한번도 실망시키지 않았다니 정말 감사합니다. 앞으로도 더 맛있는 치킨 만들겠습니다!', datetime('now', '-5 days'), 'posted');

-- 고객 데이터
INSERT OR IGNORE INTO customers (store_id, customer_key, customer_name, customer_type, order_count, last_order_at, favorite_menu) VALUES
  (1, 'baemin-김민수', '김민수', 'loyal', 12, datetime('now', '-2 hours'), '양념치킨'),
  (1, 'coupang-박지훈', '박지훈', 'loyal', 15, datetime('now', '-6 hours'), '제육볶음'),
  (1, 'baemin-정유진', '정유진', 'repeat', 8, datetime('now', '-1 day'), '후라이드치킨'),
  (1, 'coupang-김태영', '김태영', 'repeat', 5, datetime('now', '-3 days'), '돈까스'),
  (1, 'baemin-박형준', '박형준', 'loyal', 20, datetime('now', '-2 days'), '간장치킨'),
  (1, 'baemin-장현우', '장현우', 'loyal', 18, datetime('now', '-5 days'), '양념치킨');

-- 구독 데이터
INSERT OR IGNORE INTO subscriptions (user_id, plan_id, status, current_period_start, current_period_end) VALUES
  (1, 2, 'active', datetime('now', '-30 days'), datetime('now', '+30 days'));

-- 결제 데이터
INSERT OR IGNORE INTO payments (user_id, subscription_id, amount, status, payment_method, paid_at) VALUES
  (1, 1, 59000, 'completed', 'card', datetime('now', '-30 days')),
  (1, 1, 59000, 'completed', 'card', datetime('now', '-60 days')),
  (1, 1, 59000, 'completed', 'card', datetime('now', '-90 days')),
  (1, 1, 59000, 'completed', 'card', datetime('now', '-120 days'));

-- 결제 수단
INSERT OR IGNORE INTO payment_methods (user_id, type, card_last4, card_brand, expiry_date, is_default) VALUES
  (1, 'card', '4242', 'VISA', '08/27', 1);

-- 대시보드 일별 요약 (최근 7일)
INSERT OR IGNORE INTO dashboard_daily_summaries (store_id, summary_date, total_reviews, responded_reviews, avg_rating, positive_count, negative_count, neutral_count, repeat_customer_count, new_customer_count) VALUES
  (1, date('now'), 8, 5, 4.6, 5, 2, 1, 3, 5),
  (1, date('now', '-1 day'), 12, 10, 4.4, 8, 2, 2, 4, 8),
  (1, date('now', '-2 days'), 10, 9, 4.5, 7, 1, 2, 3, 7),
  (1, date('now', '-3 days'), 15, 14, 4.3, 9, 3, 3, 5, 10),
  (1, date('now', '-4 days'), 9, 8, 4.7, 7, 1, 1, 2, 7),
  (1, date('now', '-5 days'), 11, 10, 4.2, 6, 3, 2, 4, 7),
  (1, date('now', '-6 days'), 13, 12, 4.5, 8, 2, 3, 5, 8);

-- 작업 로그
INSERT OR IGNORE INTO job_logs (job_type, status, payload, error_message, created_at) VALUES
  ('review_sync', 'completed', '{"platform":"baemin","store_id":1}', NULL, datetime('now', '-1 hour')),
  ('ai_generate', 'completed', '{"review_id":1}', NULL, datetime('now', '-50 minutes')),
  ('reply_post', 'completed', '{"reply_id":1}', NULL, datetime('now', '-45 minutes')),
  ('review_sync', 'failed', '{"platform":"yogiyo","store_id":1}', 'API Timeout: Request timed out.', datetime('now', '-30 minutes')),
  ('reply_post', 'failed', '{"reply_id":99}', 'Payment declined: Card expired.', datetime('now', '-20 minutes')),
  ('review_sync', 'processing', '{"platform":"coupang_eats","store_id":1}', NULL, datetime('now', '-5 minutes')),
  ('ai_generate', 'failed', '{"review_id":999}', 'Database Connection Error.', datetime('now', '-15 minutes')),
  ('review_sync', 'dlq', '{"platform":"baemin","store_id":2}', 'Login Failed: Invalid password.', datetime('now', '-10 minutes'));

-- 금칙어 데이터
INSERT OR IGNORE INTO banned_words (word, created_by) VALUES
  ('비속어1', 2),
  ('광고', 2),
  ('경쟁사이름', 2);

```

## FILE: src/index.tsx
```tsx
import { Hono } from 'hono'
import { cors } from 'hono/cors'
import { apiRoutes } from './routes/api.ts'

type Bindings = {
  DB: D1Database
  OPENAI_API_KEY: string
  OPENAI_BASE_URL: string
  JWT_SECRET: string
  CRAWLER_API_BASE: string
  CRAWLER_SHARED_SECRET: string
  CREDENTIALS_ENCRYPTION_KEY: string
  PORTONE_API_SECRET: string
  PORTONE_STORE_ID: string
  PORTONE_CHANNEL_KEY: string
  PORTONE_WEBHOOK_SECRET: string
  APP_BASE_URL: string
}

const app = new Hono<{ Bindings: Bindings }>()

app.use('/api/*', cors())

// API routes
app.route('/api/v1', apiRoutes)

// ============ LANDING PAGE ============
app.get('/', (c) => {
  return c.html(landingPage())
})

// ============ USER PAGES ============
app.get('/login', (c) => c.html(loginPage()))
app.get('/dashboard', (c) => c.html(dashboardPage()))
app.get('/reviews', (c) => c.html(reviewsPage()))
app.get('/billing', (c) => c.html(billingPage()))
app.get('/settings', (c) => c.html(settingsPage()))
app.get('/customers', (c) => c.html(customersPage()))

// ============ ADMIN PAGES ============
app.get('/admin', (c) => c.html(adminDashboardPage()))
app.get('/admin/users', (c) => c.html(adminDashboardPage()))
app.get('/admin/logs', (c) => c.html(adminDashboardPage()))
app.get('/admin/queue', (c) => c.html(adminDashboardPage()))

// ============ PWA ============
app.get('/manifest.json', (c) => {
  return c.json({
    name: 'Respondio - AI 배달 리뷰 자동답변',
    short_name: 'Respondio',
    description: '배달 리뷰를 AI로 자동 관리하세요',
    start_url: '/dashboard',
    display: 'standalone',
    background_color: '#FFF7ED',
    theme_color: '#F97316',
    icons: [
      { src: '/static/icon-192.png', sizes: '192x192', type: 'image/png' },
      { src: '/static/icon-512.png', sizes: '512x512', type: 'image/png' }
    ]
  })
})

export default app

// ============================================================
//  SHARED HTML UTILITIES
// ============================================================
function baseHead(title: string, extraHead = '') {
  return `<!DOCTYPE html>
<html lang="ko">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <meta name="theme-color" content="#F97316">
  <link rel="manifest" href="/manifest.json">
  <title>${title} | Respondio</title>
  <script src="https://cdn.tailwindcss.com"></script>
  <script>
    tailwind.config = {
      theme: {
        extend: {
          colors: {
            brand: { 50:'#FFF7ED',100:'#FFEDD5',200:'#FED7AA',300:'#FDBA74',400:'#FB923C',500:'#F97316',600:'#EA580C',700:'#C2410C',800:'#9A3412',900:'#7C2D12' },
            dark: { 50:'#F8FAFC',100:'#F1F5F9',200:'#E2E8F0',300:'#CBD5E1',400:'#94A3B8',500:'#64748B',600:'#475569',700:'#334155',800:'#1E293B',900:'#0F172A',950:'#0B1120' }
          }
        }
      }
    }
  </script>
  <link href="https://cdn.jsdelivr.net/npm/@fortawesome/fontawesome-free@6.5.0/css/all.min.css" rel="stylesheet">
  <script src="https://cdn.jsdelivr.net/npm/chart.js@4.4.0/dist/chart.umd.min.js"></script>
  <style>
    @import url('https://fonts.googleapis.com/css2?family=Noto+Sans+KR:wght@300;400;500;600;700;800&display=swap');
    * { font-family: 'Noto Sans KR', sans-serif; }
    ::-webkit-scrollbar { width: 6px; }
    ::-webkit-scrollbar-thumb { background: #CBD5E1; border-radius: 3px; }
    .fade-in { animation: fadeIn 0.3s ease-in; }
    @keyframes fadeIn { from { opacity: 0; transform: translateY(10px); } to { opacity: 1; transform: translateY(0); } }
    .card-hover { transition: all 0.2s ease; }
    .card-hover:hover { transform: translateY(-2px); box-shadow: 0 8px 25px rgba(0,0,0,0.1); }
  </style>
  <script>
    let authRefreshPromise = null;

    function getAuthSession() {
      try {
        return JSON.parse(localStorage.getItem('respondio_auth') || 'null');
      } catch (e) {
        return null;
      }
    }

    function getCurrentUser() {
      const session = getAuthSession();
      return session?.user || null;
    }

    function saveAuthSession(payload) {
      const session = {
        access_token: payload?.access_token || '',
        user: payload?.user || null
      };
      localStorage.setItem('respondio_auth', JSON.stringify(session));
      if (session.user) {
        localStorage.setItem('respondio_user', JSON.stringify(session.user));
      }
    }

    function clearAuthSession() {
      localStorage.removeItem('respondio_auth');
      localStorage.removeItem('respondio_user');
    }

    function isAdminUser(user) {
      return user && (user.role === 'admin' || user.role === 'super_admin');
    }

    function ensureAuthenticated(requiredRole) {
      const session = getAuthSession();
      if (!session?.access_token || !session?.user) {
        refreshAuthSession().then(function(restored) {
          if (restored) {
            window.location.reload();
            return;
          }

          if (window.location.pathname !== '/login') {
            window.location.href = '/login';
          }
        });
        return false;
      }

      if (requiredRole === 'admin' && !isAdminUser(session.user)) {
        window.location.href = '/dashboard';
        return false;
      }

      return true;
    }

    async function refreshAuthSession() {
      if (authRefreshPromise) {
        return authRefreshPromise;
      }

      authRefreshPromise = fetch('/api/v1/auth/refresh', { method: 'POST' })
        .then(async function(response) {
          const data = await response.json().catch(function() { return {}; });
          if (!response.ok || !data?.access_token || !data?.user) {
            clearAuthSession();
            return false;
          }

          saveAuthSession(data);
          return true;
        })
        .catch(function() {
          clearAuthSession();
          return false;
        })
        .finally(function() {
          authRefreshPromise = null;
        });

      return authRefreshPromise;
    }

    async function apiFetch(url, options) {
      const session = getAuthSession();
      const requestOptions = Object.assign({}, options || {});
      const retriedAfterRefresh = !!requestOptions._retriedAfterRefresh;
      delete requestOptions._retriedAfterRefresh;
      const headers = Object.assign({}, requestOptions.headers || {});

      if (session?.access_token) {
        headers.Authorization = 'Bearer ' + session.access_token;
      }

      if (requestOptions.body && !(requestOptions.body instanceof FormData) && !headers['Content-Type']) {
        headers['Content-Type'] = 'application/json';
      }

      const response = await fetch(url, Object.assign({}, requestOptions, { headers }));
      if (response.status === 401 && !retriedAfterRefresh) {
        const refreshed = await refreshAuthSession();
        if (refreshed) {
          return apiFetch(url, Object.assign({}, requestOptions, { _retriedAfterRefresh: true }));
        }
      }

      if (response.status === 401) {
        clearAuthSession();
        if (window.location.pathname !== '/login') {
          window.location.href = '/login';
        }
      }

      return response;
    }

    async function logout() {
      try {
        await fetch('/api/v1/auth/logout', { method: 'POST' });
      } catch (e) {}
      clearAuthSession();
      window.location.href = '/login';
    }

    if ('serviceWorker' in navigator) {
      window.addEventListener('load', function() {
        navigator.serviceWorker.register('/sw.js').catch(function() {});
      });
    }
  </script>
  ${extraHead}
</head>`
}

// ============================================================
//  LANDING PAGE
// ============================================================
function landingPage() {
  return `${baseHead('쉽고 빠르게 리뷰 관리')}
<body class="bg-white">
  <!-- Nav -->
  <nav class="fixed top-0 w-full bg-white/80 backdrop-blur-md z-50 border-b border-gray-100">
    <div class="max-w-7xl mx-auto px-6 h-16 flex items-center justify-between">
      <div class="flex items-center gap-2">
        <div class="w-9 h-9 bg-brand-500 rounded-xl flex items-center justify-center">
          <i class="fas fa-comment-dots text-white text-sm"></i>
        </div>
        <span class="text-xl font-bold text-gray-900">Respondio</span>
      </div>
      <div class="hidden md:flex items-center gap-8 text-sm text-gray-600">
        <a href="#features" class="hover:text-brand-500">기능</a>
        <a href="#workflow" class="hover:text-brand-500">워크플로우</a>
        <a href="#pricing" class="hover:text-brand-500">요금제</a>
        <a href="#faq" class="hover:text-brand-500">FAQ</a>
      </div>
      <div class="flex items-center gap-3">
        <a href="/login" class="text-sm text-gray-600 hover:text-brand-500">로그인</a>
        <a href="/login" class="bg-brand-500 text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-brand-600 transition">무료 시작</a>
      </div>
    </div>
  </nav>

  <!-- Hero -->
  <section class="pt-28 pb-20 bg-gradient-to-br from-brand-50 via-white to-brand-50">
    <div class="max-w-7xl mx-auto px-6 grid md:grid-cols-2 gap-12 items-center">
      <div class="fade-in">
        <div class="inline-flex items-center gap-2 bg-brand-100 text-brand-700 px-3 py-1 rounded-full text-xs font-medium mb-6">
          <i class="fas fa-sparkles"></i> AI 기반 리뷰 자동답변 SaaS
        </div>
        <h1 class="text-4xl md:text-5xl font-extrabold text-gray-900 leading-tight mb-6">
          쉽고 빠르게<br><span class="text-brand-500">리뷰 관리!</span>
        </h1>
        <p class="text-lg text-gray-600 mb-8 leading-relaxed">
          배달 리뷰를 자동으로 목소리에 맞는 답변 작성,<br>시간을 아끼고 고객 만족을 챙기세요!
        </p>
        <div class="flex flex-wrap gap-4">
          <a href="/login" class="bg-brand-500 text-white px-8 py-3.5 rounded-xl font-semibold hover:bg-brand-600 transition shadow-lg shadow-brand-500/30">
            <i class="fas fa-rocket mr-2"></i>무료로 시작하기
          </a>
          <a href="#workflow" class="border-2 border-gray-300 text-gray-700 px-8 py-3.5 rounded-xl font-semibold hover:border-brand-500 hover:text-brand-500 transition">
            데모 보기
          </a>
        </div>
        <div class="flex items-center gap-6 mt-8 text-sm text-gray-500">
          <span><i class="fas fa-check text-green-500 mr-1"></i>신용카드 불필요</span>
          <span><i class="fas fa-check text-green-500 mr-1"></i>14일 무료 체험</span>
          <span><i class="fas fa-check text-green-500 mr-1"></i>즉시 시작</span>
        </div>
      </div>
      <div class="fade-in relative">
        <div class="bg-white rounded-2xl shadow-2xl p-6 border border-gray-100">
          <div class="flex items-center gap-3 mb-4">
            <div class="w-10 h-10 bg-brand-500 rounded-full flex items-center justify-center"><i class="fas fa-chart-line text-white text-sm"></i></div>
            <div><div class="font-semibold text-gray-900">Overview</div><div class="text-xs text-gray-400">실시간 리뷰 현황</div></div>
          </div>
          <div class="grid grid-cols-3 gap-3 mb-4">
            <div class="bg-brand-50 rounded-xl p-3 text-center"><div class="text-2xl font-bold text-brand-600">2,450</div><div class="text-xs text-gray-500">총 리뷰</div></div>
            <div class="bg-green-50 rounded-xl p-3 text-center"><div class="text-2xl font-bold text-green-600">97%</div><div class="text-xs text-gray-500">응답률</div></div>
            <div class="bg-blue-50 rounded-xl p-3 text-center"><div class="text-2xl font-bold text-blue-600">4.6</div><div class="text-xs text-gray-500">평균 평점</div></div>
          </div>
          <div class="space-y-2">
            <div class="bg-gray-50 rounded-lg p-3 flex items-start gap-3">
              <div class="w-8 h-8 bg-green-100 rounded-full flex items-center justify-center flex-shrink-0"><i class="fas fa-star text-yellow-500 text-xs"></i></div>
              <div class="flex-1"><div class="text-xs font-medium text-gray-700">★★★★★ 배달 빠르고 맛있어요!</div><div class="text-xs text-brand-500 mt-1 bg-brand-50 rounded p-2">AI 응답: 감사합니다! 항상 빠른 배달로 보답하겠습니다 😊</div></div>
            </div>
          </div>
        </div>
        <div class="absolute -top-4 -right-4 w-20 h-20 bg-brand-400 rounded-full opacity-20 blur-xl"></div>
        <div class="absolute -bottom-4 -left-4 w-32 h-32 bg-yellow-400 rounded-full opacity-10 blur-xl"></div>
      </div>
    </div>
  </section>

  <!-- Features -->
  <section id="features" class="py-20 bg-white">
    <div class="max-w-7xl mx-auto px-6">
      <div class="text-center mb-16">
        <h2 class="text-3xl font-bold text-gray-900 mb-4">리뷰 응답 자동화 워크플로우</h2>
        <p class="text-gray-500">AI가 알아서, 사장님은 확인만 하세요</p>
      </div>
      <div class="grid md:grid-cols-3 gap-8">
        ${[
          { icon: 'fa-robot', title: '자동 응답 생성', desc: 'AI가 감정과 리뷰 내용을 분석해 자연스러운 답변을 자동 생성합니다.', color: 'brand' },
          { icon: 'fa-heart', title: '고객 맞춤 답변', desc: '단골 고객을 자동 감지하고, 재방문 고객에게 특별한 답변을 제공합니다.', color: 'pink' },
          { icon: 'fa-clock', title: '시간 절약', desc: '리뷰 답변 시간을 90% 절감! AI가 초안을 쓰고 사장님은 승인만 하세요.', color: 'blue' }
        ].map(f => `
          <div class="bg-white border border-gray-100 rounded-2xl p-8 text-center card-hover">
            <div class="w-16 h-16 bg-${f.color}-100 rounded-2xl flex items-center justify-center mx-auto mb-5">
              <i class="fas ${f.icon} text-${f.color === 'brand' ? 'brand' : f.color}-500 text-2xl"></i>
            </div>
            <h3 class="text-lg font-bold text-gray-900 mb-3">${f.title}</h3>
            <p class="text-gray-500 text-sm leading-relaxed">${f.desc}</p>
          </div>
        `).join('')}
      </div>
    </div>
  </section>

  <!-- Workflow -->
  <section id="workflow" class="py-20 bg-brand-50">
    <div class="max-w-7xl mx-auto px-6">
      <div class="text-center mb-16">
        <h2 class="text-3xl font-bold text-gray-900 mb-4">리뷰 응답 자동화 워크플로우</h2>
        <p class="text-gray-500">4단계로 리뷰 답변 완료!</p>
      </div>
      <div class="grid md:grid-cols-4 gap-6">
        ${[
          { num: '1', title: '리뷰 수집', desc: '배민/쿠팡이츠/요기요에서 리뷰를 자동 수집', icon: 'fa-inbox' },
          { num: '2', title: 'AI 답변 생성', desc: 'AI가 사장님 말투로 맞춤 답변 작성', icon: 'fa-wand-magic-sparkles' },
          { num: '3', title: '자동 응답 전송', desc: '승인된 답변을 플랫폼에 자동 등록', icon: 'fa-paper-plane' },
          { num: '4', title: '성과 확인', desc: '대시보드에서 리뷰 성과를 한눈에 확인', icon: 'fa-chart-bar' }
        ].map((s, i) => `
          <div class="relative">
            <div class="bg-white rounded-2xl p-8 text-center shadow-sm card-hover">
              <div class="w-12 h-12 bg-brand-500 text-white rounded-full flex items-center justify-center mx-auto mb-4 text-lg font-bold">${s.num}</div>
              <div class="w-14 h-14 bg-brand-50 rounded-xl flex items-center justify-center mx-auto mb-4">
                <i class="fas ${s.icon} text-brand-500 text-xl"></i>
              </div>
              <h3 class="font-bold text-gray-900 mb-2">${s.title}</h3>
              <p class="text-sm text-gray-500">${s.desc}</p>
            </div>
            ${i < 3 ? '<div class="hidden md:block absolute top-1/2 -right-3 transform -translate-y-1/2 text-brand-300 text-2xl"><i class="fas fa-chevron-right"></i></div>' : ''}
          </div>
        `).join('')}
      </div>
    </div>
  </section>

  <!-- Pricing -->
  <section id="pricing" class="py-20 bg-white">
    <div class="max-w-7xl mx-auto px-6">
      <div class="text-center mb-16">
        <h2 class="text-3xl font-bold text-gray-900 mb-4">요금제 안내</h2>
        <p class="text-gray-500">매장 규모에 맞는 플랜을 선택하세요</p>
      </div>
      <div class="grid md:grid-cols-3 gap-8 max-w-5xl mx-auto">
        ${[
          { name: '베이직', price: '29,000', reviews: '300', features: ['리뷰 응답 300건/월', '기본 분석 리포트', '1개 플랫폼 연결'], popular: false },
          { name: '프로', price: '59,000', reviews: '800', features: ['리뷰 응답 800건/월', '고급 분석 대시보드', '3개 플랫폼 연결', '말투 학습 기능', '단골 고객 분석'], popular: true },
          { name: '프리미엄', price: '99,000', reviews: '2,000', features: ['리뷰 응답 2,000건/월', '프리미엄 분석', '무제한 플랫폼', '우선 지원', 'API 연동'], popular: false }
        ].map(p => `
          <div class="relative bg-white rounded-2xl border-2 ${p.popular ? 'border-brand-500 shadow-xl shadow-brand-500/10' : 'border-gray-100'} p-8 card-hover">
            ${p.popular ? '<div class="absolute -top-4 left-1/2 -translate-x-1/2 bg-brand-500 text-white text-xs font-bold px-4 py-1 rounded-full">가장 인기</div>' : ''}
            <h3 class="text-xl font-bold text-gray-900 mb-2">${p.name}</h3>
            <div class="mb-6">
              <span class="text-4xl font-extrabold text-gray-900">₩${p.price}</span>
              <span class="text-gray-400">/월</span>
            </div>
            <ul class="space-y-3 mb-8">
              ${p.features.map(f => `<li class="flex items-center gap-2 text-sm text-gray-600"><i class="fas fa-check text-brand-500 text-xs"></i>${f}</li>`).join('')}
            </ul>
            <a href="/login" class="block text-center py-3 rounded-xl font-semibold transition ${p.popular ? 'bg-brand-500 text-white hover:bg-brand-600 shadow-lg shadow-brand-500/30' : 'bg-gray-100 text-gray-700 hover:bg-gray-200'}">
              지금 시작하기
            </a>
          </div>
        `).join('')}
      </div>
    </div>
  </section>

  <!-- Testimonials -->
  <section class="py-20 bg-brand-50">
    <div class="max-w-5xl mx-auto px-6">
      <div class="text-center mb-12"><h2 class="text-3xl font-bold text-gray-900">사장님들의 후기</h2></div>
      <div class="grid md:grid-cols-2 gap-8">
        ${[
          { name: '김모우', role: '임차서넌 사장님', text: '"리뷰 관리 누가 훅 줄었어요! AI가 알아서 답변해주니까 정말 편해요."' },
          { name: '여수정', role: '김밥들릭소가 사장님', text: '"고민 응답이 진짜 줄었습니다! 단골 고객 관리까지 되니 매출도 올랐어요."' }
        ].map(t => `
          <div class="bg-white rounded-2xl p-8 shadow-sm">
            <div class="flex items-center gap-4 mb-4">
              <div class="w-12 h-12 bg-brand-200 rounded-full flex items-center justify-center"><i class="fas fa-user text-brand-600"></i></div>
              <div><div class="font-bold text-gray-900">${t.name}</div><div class="text-xs text-gray-400">${t.role}</div></div>
            </div>
            <p class="text-gray-600 leading-relaxed">${t.text}</p>
            <div class="mt-4 text-yellow-400"><i class="fas fa-star"></i><i class="fas fa-star"></i><i class="fas fa-star"></i><i class="fas fa-star"></i><i class="fas fa-star"></i></div>
          </div>
        `).join('')}
      </div>
    </div>
  </section>

  <!-- FAQ -->
  <section id="faq" class="py-20 bg-white">
    <div class="max-w-3xl mx-auto px-6">
      <div class="text-center mb-12"><h2 class="text-3xl font-bold text-gray-900">자주 묻는 질문</h2></div>
      <div class="space-y-4" id="faq-list">
        ${[
          { q: 'AI 답변은 얼마나 자연스러운가요?', a: 'GPT 기반으로 사장님의 말투를 학습하여 AI 티가 나지 않는 자연스러운 답변을 생성합니다. 품질 점수 시스템으로 답변 품질도 확인 가능합니다.' },
          { q: '리뷰 응답으로 저장할 수 있나요?', a: '네! 모든 리뷰와 답변은 자동으로 저장되며, 대시보드에서 언제든 확인할 수 있습니다. 메뉴별, 기간별 분석 리포트도 제공합니다.' },
          { q: '다른 배달 플랫폼도 지원하나요?', a: '현재 배달의민족, 쿠팡이츠, 요기요 3대 플랫폼을 모두 지원합니다. 향후 더 많은 플랫폼을 추가할 예정입니다.' },
          { q: '무료 체험 기간이 있나요?', a: '네, 14일 무료 체험을 제공합니다. 신용카드 정보 없이 바로 시작하실 수 있어요.' }
        ].map((faq, i) => `
          <div class="border border-gray-200 rounded-xl overflow-hidden">
            <button onclick="toggleFaq(${i})" class="w-full flex items-center justify-between p-5 text-left hover:bg-gray-50 transition">
              <span class="font-medium text-gray-900">${faq.q}</span>
              <i class="fas fa-chevron-down text-gray-400 transition-transform" id="faq-icon-${i}"></i>
            </button>
            <div class="hidden px-5 pb-5 text-sm text-gray-600 leading-relaxed" id="faq-answer-${i}">${faq.a}</div>
          </div>
        `).join('')}
      </div>
    </div>
  </section>

  <!-- CTA -->
  <section class="py-20 bg-gradient-to-r from-brand-500 to-brand-600">
    <div class="max-w-4xl mx-auto px-6 text-center">
      <h2 class="text-3xl md:text-4xl font-bold text-white mb-4">지금 바로 시작해보세요!</h2>
      <p class="text-brand-100 mb-8 text-lg">14일 무료 체험 · 신용카드 불필요 · 즉시 시작</p>
      <div class="flex flex-wrap justify-center gap-4">
        <a href="/login" class="bg-white text-brand-600 px-8 py-3.5 rounded-xl font-bold hover:shadow-lg transition">무료로 시작하기 <i class="fas fa-arrow-right ml-2"></i></a>
        <a href="/login" class="border-2 border-white/50 text-white px-8 py-3.5 rounded-xl font-semibold hover:bg-white/10 transition">데모 요청하기</a>
      </div>
    </div>
  </section>

  <!-- Footer -->
  <footer class="bg-gray-900 text-gray-400 py-12">
    <div class="max-w-7xl mx-auto px-6">
      <div class="flex flex-col md:flex-row items-center justify-between">
        <div class="flex items-center gap-2 mb-4 md:mb-0">
          <div class="w-8 h-8 bg-brand-500 rounded-lg flex items-center justify-center"><i class="fas fa-comment-dots text-white text-xs"></i></div>
          <span class="text-white font-bold">Respondio</span>
        </div>
        <p class="text-sm">© 2024 Respondio. All rights reserved.</p>
      </div>
    </div>
  </footer>

  <script>
    function toggleFaq(i) {
      const answer = document.getElementById('faq-answer-' + i);
      const icon = document.getElementById('faq-icon-' + i);
      answer.classList.toggle('hidden');
      icon.style.transform = answer.classList.contains('hidden') ? '' : 'rotate(180deg)';
    }
  </script>
</body>
</html>`
}

// ============================================================
//  LOGIN PAGE
// ============================================================
function loginPage() {
  return `${baseHead('로그인')}
<body class="bg-brand-50 min-h-screen flex items-center justify-center p-4">
  <div class="w-full max-w-md">
    <div class="text-center mb-8">
      <div class="w-14 h-14 bg-brand-500 rounded-2xl flex items-center justify-center mx-auto mb-4">
        <i class="fas fa-comment-dots text-white text-2xl"></i>
      </div>
      <h1 class="text-2xl font-bold text-gray-900">Respondio</h1>
      <p class="text-gray-500 text-sm mt-1">AI 배달 리뷰 자동답변</p>
    </div>
    <div class="bg-white rounded-2xl shadow-xl p-8 border border-gray-100">
      <div class="flex bg-gray-100 rounded-xl p-1 mb-6">
        <button id="tab-login" onclick="switchTab('login')" class="flex-1 py-2.5 rounded-lg text-sm font-semibold bg-white shadow text-gray-900">로그인</button>
        <button id="tab-signup" onclick="switchTab('signup')" class="flex-1 py-2.5 rounded-lg text-sm font-semibold text-gray-500">회원가입</button>
      </div>
      <form id="form-login" onsubmit="handleLogin(event)">
        <div class="space-y-4">
          <div>
            <label class="text-sm font-medium text-gray-700 mb-1 block">이메일</label>
            <input type="email" id="login-email" value="owner@test.com" class="w-full px-4 py-3 border border-gray-200 rounded-xl focus:ring-2 focus:ring-brand-500 focus:border-brand-500 outline-none transition" placeholder="email@example.com">
          </div>
          <div>
            <label class="text-sm font-medium text-gray-700 mb-1 block">비밀번호</label>
            <input type="password" id="login-pw" value="password" class="w-full px-4 py-3 border border-gray-200 rounded-xl focus:ring-2 focus:ring-brand-500 focus:border-brand-500 outline-none transition" placeholder="비밀번호">
          </div>
          <button type="submit" class="w-full bg-brand-500 text-white py-3 rounded-xl font-semibold hover:bg-brand-600 transition shadow-lg shadow-brand-500/30">
            <i class="fas fa-sign-in-alt mr-2"></i>로그인
          </button>
        </div>
      </form>
      <form id="form-signup" class="hidden" onsubmit="handleSignup(event)">
        <div class="space-y-4">
          <div>
            <label class="text-sm font-medium text-gray-700 mb-1 block">이름</label>
            <input type="text" id="signup-name" class="w-full px-4 py-3 border border-gray-200 rounded-xl focus:ring-2 focus:ring-brand-500 focus:border-brand-500 outline-none transition" placeholder="사장님 이름">
          </div>
          <div>
            <label class="text-sm font-medium text-gray-700 mb-1 block">이메일</label>
            <input type="email" id="signup-email" class="w-full px-4 py-3 border border-gray-200 rounded-xl focus:ring-2 focus:ring-brand-500 focus:border-brand-500 outline-none transition" placeholder="email@example.com">
          </div>
          <div>
            <label class="text-sm font-medium text-gray-700 mb-1 block">비밀번호</label>
            <input type="password" id="signup-pw" class="w-full px-4 py-3 border border-gray-200 rounded-xl focus:ring-2 focus:ring-brand-500 focus:border-brand-500 outline-none transition" placeholder="비밀번호 (8자 이상)">
          </div>
          <div class="flex items-start gap-2">
            <input type="checkbox" id="agree" class="mt-1 rounded text-brand-500">
            <label for="agree" class="text-xs text-gray-500">서비스 이용약관 및 개인정보 처리방침에 동의합니다.</label>
          </div>
          <button type="submit" class="w-full bg-brand-500 text-white py-3 rounded-xl font-semibold hover:bg-brand-600 transition shadow-lg shadow-brand-500/30">
            <i class="fas fa-user-plus mr-2"></i>가입하기
          </button>
        </div>
      </form>
      <div class="mt-4 text-center space-y-2">
        <a href="/login?demo=1" class="text-xs text-gray-400 hover:text-brand-500 block">테스트 계정으로 바로 로그인 →</a>
        <div class="border-t border-gray-100 pt-3 mt-3">
          <p class="text-[10px] text-gray-400 mb-2">테스트 계정</p>
          <div class="flex gap-2 justify-center">
            <button onclick="fillOwner()" class="text-[10px] bg-brand-50 text-brand-600 px-3 py-1.5 rounded-lg hover:bg-brand-100 transition font-medium">
              <i class="fas fa-store mr-1"></i>사장님 로그인
            </button>
            <button onclick="fillAdmin()" class="text-[10px] bg-dark-800 text-white px-3 py-1.5 rounded-lg hover:bg-dark-700 transition font-medium">
              <i class="fas fa-shield-alt mr-1"></i>관리자 로그인
            </button>
          </div>
        </div>
      </div>
    </div>
  </div>
  <script>
    const existingSession = getAuthSession();
    if (existingSession?.access_token && existingSession?.user) {
      window.location.href = isAdminUser(existingSession.user) ? '/admin' : '/dashboard';
    } else {
      refreshAuthSession().then(function(restored) {
        if (!restored) return;
        const restoredSession = getAuthSession();
        if (!restoredSession?.user) return;
        window.location.href = isAdminUser(restoredSession.user) ? '/admin' : '/dashboard';
      });
    }

    if (window.location.search.includes('demo=1')) {
      fillOwner();
    }

    function switchTab(tab) {
      document.getElementById('form-login').classList.toggle('hidden', tab !== 'login');
      document.getElementById('form-signup').classList.toggle('hidden', tab !== 'signup');
      document.getElementById('tab-login').className = 'flex-1 py-2.5 rounded-lg text-sm font-semibold ' + (tab === 'login' ? 'bg-white shadow text-gray-900' : 'text-gray-500');
      document.getElementById('tab-signup').className = 'flex-1 py-2.5 rounded-lg text-sm font-semibold ' + (tab === 'signup' ? 'bg-white shadow text-gray-900' : 'text-gray-500');
    }
    function fillOwner() {
      document.getElementById('login-email').value = 'owner@test.com';
      document.getElementById('login-pw').value = 'password';
      switchTab('login');
    }
    function fillAdmin() {
      document.getElementById('login-email').value = 'admin@respondio.com';
      document.getElementById('login-pw').value = 'admin123';
      switchTab('login');
    }
    async function handleLogin(e) {
      e.preventDefault();
      const email = document.getElementById('login-email').value.trim();
      const password = document.getElementById('login-pw').value;

      try {
        const response = await apiFetch('/api/v1/auth/login', {
          method: 'POST',
          body: JSON.stringify({ email, password })
        });
        const data = await response.json();

        if (!response.ok) {
          alert(data?.error?.message || '로그인에 실패했습니다.');
          return;
        }

        saveAuthSession(data);
        window.location.href = isAdminUser(data.user) ? '/admin' : '/dashboard';
      } catch (error) {
        alert('로그인에 실패했습니다: ' + error.message);
      }
    }
    async function handleSignup(e) {
      e.preventDefault();

      const name = document.getElementById('signup-name').value.trim();
      const email = document.getElementById('signup-email').value.trim();
      const password = document.getElementById('signup-pw').value;
      const agreed = document.getElementById('agree').checked;

      if (!agreed) {
        alert('약관 동의가 필요합니다.');
        return;
      }

      try {
        const response = await apiFetch('/api/v1/auth/signup', {
          method: 'POST',
          body: JSON.stringify({ name, email, password })
        });
        const data = await response.json();

        if (!response.ok) {
          alert(data?.error?.message || '회원가입에 실패했습니다.');
          return;
        }

        saveAuthSession(data);
        window.location.href = '/dashboard';
      } catch (error) {
        alert('회원가입에 실패했습니다: ' + error.message);
      }
    }
  </script>
</body>
</html>`
}

// ============================================================
//  SIDEBAR COMPONENT
// ============================================================
function userSidebar(active: string) {
  const items = [
    { id: 'dashboard', icon: 'fa-chart-pie', label: '대시보드', href: '/dashboard' },
    { id: 'reviews', icon: 'fa-comments', label: '리뷰 관리', href: '/reviews' },
    { id: 'customers', icon: 'fa-users', label: '고객 분석', href: '/customers' },
    { id: 'billing', icon: 'fa-credit-card', label: '구독/결제', href: '/billing' },
    { id: 'settings', icon: 'fa-cog', label: '설정', href: '/settings' },
  ]
  return `
  <aside class="fixed left-0 top-0 h-screen w-[72px] hover:w-[220px] bg-white border-r border-gray-100 z-40 transition-all duration-300 group overflow-hidden flex flex-col">
    <div class="h-16 flex items-center px-4 border-b border-gray-50 flex-shrink-0">
      <div class="w-10 h-10 bg-brand-500 rounded-xl flex items-center justify-center flex-shrink-0"><i class="fas fa-comment-dots text-white"></i></div>
      <span class="ml-3 font-bold text-gray-900 whitespace-nowrap opacity-0 group-hover:opacity-100 transition-opacity">Respondio</span>
    </div>
    <nav class="flex-1 py-4 px-2 space-y-1">
      ${items.map(it => `
        <a href="${it.href}" class="flex items-center gap-3 px-3 py-3 rounded-xl transition ${active === it.id ? 'bg-brand-500 text-white shadow-lg shadow-brand-500/30' : 'text-gray-500 hover:bg-gray-50 hover:text-gray-900'}">
          <i class="fas ${it.icon} text-base w-5 text-center flex-shrink-0"></i>
          <span class="text-sm font-medium whitespace-nowrap opacity-0 group-hover:opacity-100 transition-opacity">${it.label}</span>
        </a>
      `).join('')}
    </nav>
    <div class="p-2 border-t border-gray-50 flex-shrink-0">
      <a href="/login" onclick="logout(); return false;" class="flex items-center gap-3 px-3 py-3 rounded-xl text-gray-400 hover:text-red-500 hover:bg-red-50 transition">
        <i class="fas fa-sign-out-alt text-base w-5 text-center flex-shrink-0"></i>
        <span class="text-sm whitespace-nowrap opacity-0 group-hover:opacity-100 transition-opacity">로그아웃</span>
      </a>
    </div>
  </aside>`
}

// ============================================================
//  DASHBOARD PAGE
// ============================================================
function dashboardPage() {
  return `${baseHead('대시보드')}
<body class="bg-gray-50 min-h-screen">
  ${userSidebar('dashboard')}
  <main class="ml-[72px] p-6">
    <!-- Header -->
    <div class="flex items-center justify-between mb-6">
      <div>
        <h1 class="text-2xl font-bold text-gray-900">안녕하세요, 김사장님 👋</h1>
        <p class="text-sm text-gray-500 mt-1">맛있는 치킨집 · 오늘의 리뷰 현황</p>
      </div>
      <div class="flex items-center gap-3">
        <select class="text-sm border border-gray-200 rounded-xl px-4 py-2.5 bg-white focus:ring-2 focus:ring-brand-500 outline-none">
          <option>자동응답 켜짐</option>
          <option>자동응답 꺼짐</option>
        </select>
        <div class="w-10 h-10 bg-brand-100 rounded-full flex items-center justify-center">
          <i class="fas fa-bell text-brand-500"></i>
        </div>
      </div>
    </div>

    <!-- KPI Cards -->
    <div class="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4 mb-6">
      ${[
        { key: 'total_reviews', label: '총 리뷰', value: '2,450', sub: '건', icon: 'fa-comments', color: 'brand', bg: 'brand-50' },
        { key: 'pending_reviews', label: '미응답 리뷰', value: '3', sub: '건', icon: 'fa-clock', color: 'red', bg: 'red-50' },
        { key: 'avg_rating', label: '평균 평점', value: '4.6', sub: '점', icon: 'fa-star', color: 'yellow', bg: 'yellow-50' },
        { key: 'positive_ratio', label: '긍정 비율', value: '82', sub: '%', icon: 'fa-smile', color: 'green', bg: 'green-50' },
        { key: 'repeat_customer_ratio', label: '재방문 고객', value: '45', sub: '%', icon: 'fa-user-check', color: 'blue', bg: 'blue-50' },
        { key: 'ai_quality_score', label: 'AI 품질점수', value: '9.2', sub: '점', icon: 'fa-robot', color: 'brand', bg: 'brand-50' }
      ].map(kpi => `
        <div class="bg-white rounded-2xl p-5 border border-gray-100 card-hover">
          <div class="flex items-center gap-2 mb-3">
            <div class="w-8 h-8 bg-${kpi.bg} rounded-lg flex items-center justify-center">
              <i class="fas ${kpi.icon} text-${kpi.color}-500 text-sm"></i>
            </div>
            <span class="text-xs text-gray-400 font-medium">${kpi.label}</span>
          </div>
          <div class="flex items-end gap-1">
            <span class="text-2xl font-bold text-gray-900" data-kpi-value="${kpi.key}">${kpi.value}</span>
            <span class="text-sm text-gray-400 mb-0.5" data-kpi-unit="${kpi.key}">${kpi.sub}</span>
          </div>
        </div>
      `).join('')}
    </div>

    <!-- Main Grid: 3 columns -->
    <div class="grid lg:grid-cols-3 gap-6">
      <!-- 최근 리뷰 -->
      <div class="bg-white rounded-2xl p-6 border border-gray-100">
        <div class="flex items-center justify-between mb-5">
          <h2 class="text-lg font-bold text-gray-900">최근 리뷰</h2>
          <a href="/reviews" class="text-xs text-brand-500 font-medium hover:underline">전체 보기 →</a>
        </div>
        <div class="space-y-4" id="recent-reviews">
          <!-- Loaded via JS -->
        </div>
      </div>

      <!-- 메뉴 평판 분석 -->
      <div class="bg-white rounded-2xl p-6 border border-gray-100">
        <div class="flex items-center justify-between mb-5">
          <h2 class="text-lg font-bold text-gray-900">메뉴 평판 분석</h2>
          <select class="text-xs border border-gray-200 rounded-lg px-2 py-1"><option>최근 30일</option></select>
        </div>
        <canvas id="menuChart" height="200"></canvas>
        <div class="mt-6">
          <h3 class="text-sm font-semibold text-gray-700 mb-3">플랫폼 연결 상태</h3>
          <div class="grid grid-cols-3 gap-3">
            ${[
              { name: '배달의민족', color: '#00C4B4', abbr: '배민' },
              { name: '쿠팡이츠', color: '#E4002B', abbr: '쿠팡' },
              { name: '요기요', color: '#FA0050', abbr: '요기요' }
            ].map(p => `
              <div class="text-center p-3 bg-gray-50 rounded-xl">
                <div class="w-10 h-10 rounded-full mx-auto mb-2 flex items-center justify-center text-white text-xs font-bold" style="background:${p.color}">${p.abbr}</div>
                <div class="flex items-center justify-center gap-1 text-xs text-green-600"><i class="fas fa-check-circle"></i>연결됨</div>
              </div>
            `).join('')}
          </div>
        </div>
      </div>

      <!-- 충성 고객 인사이트 -->
      <div class="bg-white rounded-2xl p-6 border border-gray-100">
        <h2 class="text-lg font-bold text-gray-900 mb-5">충성 고객 인사이트</h2>
        <div class="mb-6">
          <h3 class="text-sm text-gray-500 mb-3">재방문 TOP 고객</h3>
          <div class="space-y-3" id="top-customers"></div>
        </div>
        <div class="mb-6">
          <h3 class="text-sm text-gray-500 mb-3">즐겨 찾는 주문 시간</h3>
          <div class="bg-brand-50 rounded-xl p-4 flex items-center gap-4">
            <div class="w-12 h-12 bg-brand-500 rounded-full flex items-center justify-center"><i class="fas fa-clock text-white"></i></div>
            <div>
              <div class="font-bold text-gray-900">오후 6시 - 8시</div>
              <div class="text-xs text-gray-500">전체 주문의 38%</div>
            </div>
          </div>
        </div>
        <div>
          <h3 class="text-sm text-gray-500 mb-3">리뷰 트렌드 (7일)</h3>
          <canvas id="trendChart" height="120"></canvas>
        </div>
      </div>
    </div>
  </main>

  <script>
    ensureAuthenticated();
    const currentUser = getCurrentUser();
    if (currentUser?.name) {
      const greeting = document.querySelector('h1.text-2xl.font-bold.text-gray-900');
      if (greeting) {
        greeting.textContent = '안녕하세요, ' + currentUser.name + '님 👋';
      }
    }

    // Menu Rating Chart
    new Chart(document.getElementById('menuChart'), {
      type: 'bar',
      data: {
        labels: ['양념치킨', '후라이드', '김치찌개', '제육볶음', '돈까스'],
        datasets: [{
          data: [4.8, 4.6, 4.3, 4.5, 4.2],
          backgroundColor: ['#F97316','#FB923C','#FDBA74','#FED7AA','#FFEDD5'],
          borderRadius: 8,
          barThickness: 36
        }]
      },
      options: {
        responsive: true,
        plugins: { legend: { display: false } },
        scales: {
          y: { beginAtZero: true, max: 5, grid: { color: '#F3F4F6' }, ticks: { font: { size: 11 } } },
          x: { grid: { display: false }, ticks: { font: { size: 11 } } }
        }
      }
    });

    // Trend Chart
    new Chart(document.getElementById('trendChart'), {
      type: 'line',
      data: {
        labels: ['월', '화', '수', '목', '금', '토', '일'],
        datasets: [{
          data: [13, 11, 15, 9, 10, 12, 8],
          borderColor: '#F97316',
          backgroundColor: 'rgba(249,115,22,0.1)',
          fill: true,
          tension: 0.4,
          pointRadius: 4,
          pointBackgroundColor: '#F97316'
        }]
      },
      options: {
        responsive: true,
        plugins: { legend: { display: false } },
        scales: {
          y: { beginAtZero: true, grid: { color: '#F3F4F6' }, ticks: { font: { size: 10 } } },
          x: { grid: { display: false }, ticks: { font: { size: 10 } } }
        }
      }
    });

    apiFetch('/api/v1/dashboard/summary').then(r=>r.json()).then(data => {
      if (!data || data.error) return;

      const unitOverrides = {
        total_reviews: '건',
        pending_reviews: '건',
        avg_rating: '점',
        positive_ratio: '%',
        repeat_customer_ratio: '%',
        ai_quality_score: '점'
      };

      Object.entries(unitOverrides).forEach(([key, unit]) => {
        const valueEl = document.querySelector('[data-kpi-value="' + key + '"]');
        const unitEl = document.querySelector('[data-kpi-unit="' + key + '"]');
        if (valueEl && data[key] !== undefined) {
          valueEl.textContent = String(data[key]);
        }
        if (unitEl) {
          unitEl.textContent = unit;
        }
      });
    }).catch(() => {});

    // Load recent reviews from API
    apiFetch('/api/v1/reviews?limit=4').then(r=>r.json()).then(data => {
      const reviews = data.reviews || data;
      const container = document.getElementById('recent-reviews');
      if(!container || !Array.isArray(reviews)) return;
      container.innerHTML = reviews.slice(0,4).map(r => {
        const stars = '★'.repeat(Math.floor(r.rating)) + (r.rating % 1 ? '½' : '');
        const sentimentColor = r.sentiment === 'positive' ? 'green' : r.sentiment === 'negative' ? 'red' : 'gray';
        const platformColors = { baemin: '#00C4B4', coupang_eats: '#E4002B', yogiyo: '#FA0050' };
        const platformNames = { baemin: '배민', coupang_eats: '쿠팡', yogiyo: '요기요' };
        const aiReply = r.reply_text || '';
        return \`
          <div class="p-4 bg-gray-50 rounded-xl fade-in">
            <div class="flex items-center gap-2 mb-2">
              <span class="w-6 h-6 rounded-full text-white text-[10px] flex items-center justify-center font-bold" style="background:\${platformColors[r.platform]}">\${platformNames[r.platform]?.[0]||'?'}</span>
              <span class="font-medium text-sm text-gray-900">\${r.customer_name}</span>
              <span class="text-yellow-500 text-xs">\${stars}</span>
              \${r.customer_type==='loyal'?'<span class="text-[10px] bg-green-100 text-green-700 px-2 py-0.5 rounded-full font-medium">단골</span>':''}
              \${r.customer_type==='repeat'?'<span class="text-[10px] bg-blue-100 text-blue-700 px-2 py-0.5 rounded-full font-medium">재방문</span>':''}
            </div>
            <p class="text-sm text-gray-600 mb-2">\${r.review_text}</p>
            \${aiReply ? \`<div class="bg-brand-50 rounded-lg p-3 text-xs text-brand-700"><i class="fas fa-robot mr-1"></i>AI: \${aiReply}</div>\` : \`<div class="flex gap-2 mt-2"><button onclick="generateReply(\${r.id})" class="text-xs bg-brand-500 text-white px-3 py-1.5 rounded-lg hover:bg-brand-600 transition"><i class="fas fa-magic mr-1"></i>답변 생성</button></div>\`}
          </div>\`;
      }).join('');
    });

    // Load top customers
    apiFetch('/api/v1/dashboard/repeat_customers').then(r=>r.json()).then(data => {
      const customers = data.customers || data;
      const container = document.getElementById('top-customers');
      if(!container || !Array.isArray(customers)) return;
      container.innerHTML = customers.slice(0,3).map(c => \`
        <div class="flex items-center justify-between p-3 bg-gray-50 rounded-xl">
          <div class="flex items-center gap-3">
            <div class="w-9 h-9 bg-brand-200 rounded-full flex items-center justify-center"><i class="fas fa-user text-brand-600 text-sm"></i></div>
            <div><div class="font-medium text-sm text-gray-900">\${c.customer_name}</div><div class="text-xs text-gray-400">\${c.favorite_menu || ''}</div></div>
          </div>
          <span class="text-sm font-bold text-brand-500">\${c.order_count}회</span>
        </div>
      \`).join('');
    });

    async function generateReply(id) {
      const btn = event.target;
      btn.disabled = true;
      btn.innerHTML = '<i class="fas fa-spinner fa-spin mr-1"></i>AI 생성 중...';
      try {
        const res = await apiFetch('/api/v1/reviews/' + id + '/generate', { method: 'POST' });
        const data = await res.json();
        if (data.error) { alert(data?.error?.message || 'AI 답변 생성에 실패했습니다.'); return; }
        location.reload();
      } catch(e) { alert('AI 답변 생성 실패: ' + e.message); }
      finally { btn.disabled = false; btn.innerHTML = '<i class="fas fa-magic mr-1"></i>답변 생성'; }
    }
  </script>
</body>
</html>`
}

// ============================================================
//  REVIEWS PAGE
// ============================================================
function reviewsPage() {
  return `${baseHead('리뷰 관리')}
<body class="bg-gray-50 min-h-screen">
  ${userSidebar('reviews')}
  <main class="ml-[72px] p-6">
    <!-- Header -->
    <div class="flex items-center justify-between mb-6">
      <h1 class="text-2xl font-bold text-gray-900">리뷰 관리</h1>
      <div class="flex items-center gap-3">
        <select id="sync-mode" class="border border-gray-200 rounded-xl px-3 py-2.5 text-sm bg-white focus:ring-2 focus:ring-brand-500 outline-none">
          <option value="demo">데모 수집</option>
          <option value="live">실제 수집</option>
        </select>
        <button onclick="syncReviews()" class="bg-green-500 text-white px-4 py-2.5 rounded-xl text-sm font-semibold hover:bg-green-600 transition shadow-lg shadow-green-500/30" id="btn-sync">
          <i class="fas fa-sync-alt mr-2"></i>리뷰 수집
        </button>
        <button onclick="batchGenerate()" class="border border-brand-500 text-brand-500 px-4 py-2.5 rounded-xl text-sm font-semibold hover:bg-brand-50 transition" id="btn-batch-gen">
          <i class="fas fa-wand-magic-sparkles mr-2"></i>AI 일괄 생성
        </button>
        <button onclick="approveAll()" class="bg-brand-500 text-white px-4 py-2.5 rounded-xl text-sm font-semibold hover:bg-brand-600 transition shadow-lg shadow-brand-500/30">
          <i class="fas fa-check-double mr-2"></i>전체 승인
        </button>
      </div>
    </div>

    <!-- Tab Navigation -->
    <div class="flex items-center gap-1 bg-white rounded-xl p-1 border border-gray-100 w-fit mb-6">
      <button class="px-5 py-2.5 rounded-lg text-sm font-semibold bg-brand-500 text-white" onclick="filterTab('all')">리뷰</button>
      <button class="px-5 py-2.5 rounded-lg text-sm font-semibold text-gray-500 hover:bg-gray-50" onclick="filterTab('pending')">미답변</button>
      <button class="px-5 py-2.5 rounded-lg text-sm font-semibold text-gray-500 hover:bg-gray-50" onclick="filterTab('generated')">생성완료</button>
      <button class="px-5 py-2.5 rounded-lg text-sm font-semibold text-gray-500 hover:bg-gray-50" onclick="filterTab('posted')">등록완료</button>
    </div>

    <div class="grid lg:grid-cols-[240px_1fr_320px] gap-6">
      <!-- Filters -->
      <div class="space-y-4">
        <div class="bg-white rounded-2xl p-5 border border-gray-100">
          <h3 class="font-bold text-sm text-gray-900 mb-4">리뷰 플랫폼</h3>
          <div class="space-y-2">
            ${['전체', '배달의민족', '요기요', '쿠팡이츠'].map((p, i) => `
              <label class="flex items-center gap-2 cursor-pointer">
                <input type="checkbox" ${i === 0 ? 'checked' : ''} class="rounded text-brand-500 focus:ring-brand-500" onchange="applyFilter()">
                <span class="text-sm text-gray-600">${p}</span>
              </label>
            `).join('')}
          </div>
        </div>
        <div class="bg-white rounded-2xl p-5 border border-gray-100">
          <h3 class="font-bold text-sm text-gray-900 mb-4">평점</h3>
          <div class="space-y-2">
            ${['전체', '★★★★★', '★★★★', '★★★', '★★ 이하'].map((p, i) => `
              <label class="flex items-center gap-2 cursor-pointer">
                <input type="radio" name="rating" ${i === 0 ? 'checked' : ''} class="text-brand-500 focus:ring-brand-500">
                <span class="text-sm text-gray-600">${p}</span>
              </label>
            `).join('')}
          </div>
        </div>
        <div class="bg-white rounded-2xl p-5 border border-gray-100">
          <h3 class="font-bold text-sm text-gray-900 mb-4">감정 분석</h3>
          <div class="space-y-2">
            ${[
              { label: '전체', color: '' },
              { label: '긍정', color: 'text-green-500' },
              { label: '부정', color: 'text-red-500' },
              { label: '중립', color: 'text-gray-500' }
            ].map((s, i) => `
              <label class="flex items-center gap-2 cursor-pointer">
                <input type="radio" name="sentiment" ${i === 0 ? 'checked' : ''} class="text-brand-500 focus:ring-brand-500">
                <span class="text-sm ${s.color || 'text-gray-600'}">${s.label}</span>
              </label>
            `).join('')}
          </div>
        </div>
        <button onclick="resetFilters()" class="w-full bg-brand-500 text-white py-2.5 rounded-xl text-sm font-semibold hover:bg-brand-600 transition">필터 초기화</button>
      </div>

      <!-- Review List -->
      <div class="space-y-4" id="review-list">
        <div class="text-center py-20 text-gray-400"><i class="fas fa-spinner fa-spin text-2xl"></i><p class="mt-3 text-sm">리뷰 로딩 중...</p></div>
      </div>

      <!-- AI Response Panel -->
      <div class="bg-white rounded-2xl p-6 border border-gray-100 h-fit sticky top-6" id="ai-panel">
        <h3 class="font-bold text-gray-900 mb-4 flex items-center gap-2">
          <i class="fas fa-robot text-brand-500"></i> AI 답변 승인
        </h3>
        <div id="ai-response-content">
          <div class="text-center py-12 text-gray-400">
            <i class="fas fa-hand-pointer text-3xl mb-3"></i>
            <p class="text-sm">리뷰를 선택해주세요</p>
          </div>
        </div>
      </div>
    </div>
  </main>

  <script>
    ensureAuthenticated();

    let allReviews = [];
    let selectedReview = null;
    let platformConnections = [];

    apiFetch('/api/v1/reviews?limit=50').then(r=>r.json()).then(data => {
      allReviews = data.reviews || data || [];
      renderReviews(allReviews);
    });

    apiFetch('/api/v1/platform_connections').then(r=>r.json()).then(data => {
      platformConnections = data.connections || [];
      const hasLiveConnection = platformConnections.some(c => c.connection_status === 'connected' && c.has_credentials);
      document.getElementById('sync-mode').value = hasLiveConnection ? 'live' : 'demo';
    }).catch(() => {});

    function renderReviews(reviews) {
      const container = document.getElementById('review-list');
      if(!reviews.length) { container.innerHTML = '<div class="text-center py-20 text-gray-400">리뷰가 없습니다.</div>'; return; }
      const platformColors = { baemin: '#00C4B4', coupang_eats: '#E4002B', yogiyo: '#FA0050' };
      const platformNames = { baemin: '배달의민족', coupang_eats: '쿠팡이츠', yogiyo: '요기요' };
      container.innerHTML = reviews.map(r => {
        const stars = '★'.repeat(Math.floor(r.rating));
        const sentClass = r.sentiment === 'positive' ? 'bg-green-100 text-green-700' : r.sentiment === 'negative' ? 'bg-red-100 text-red-700' : 'bg-gray-100 text-gray-600';
        const sentLabel = r.sentiment === 'positive' ? '긍정적' : r.sentiment === 'negative' ? '부정적' : '중립적';
        const custBadge = r.customer_type === 'loyal' ? '<span class="text-[10px] bg-green-100 text-green-700 px-2 py-0.5 rounded-full font-medium">단골고객</span>' : r.customer_type === 'repeat' ? '<span class="text-[10px] bg-blue-100 text-blue-700 px-2 py-0.5 rounded-full font-medium">재방문</span>' : '';
        const statusBadge = r.status === 'posted' ? '<span class="text-[10px] bg-green-100 text-green-700 px-2 py-0.5 rounded-full">등록완료</span>' : r.status === 'approved' ? '<span class="text-[10px] bg-blue-100 text-blue-700 px-2 py-0.5 rounded-full">승인됨</span>' : r.status === 'generated' ? '<span class="text-[10px] bg-brand-100 text-brand-700 px-2 py-0.5 rounded-full">답변생성</span>' : '<span class="text-[10px] bg-red-100 text-red-700 px-2 py-0.5 rounded-full">미답변</span>';
        let menus = [];
        try { menus = JSON.parse(r.menu_items || '[]'); } catch(e) {}
        return \`
          <div class="bg-white rounded-2xl p-5 border border-gray-100 card-hover cursor-pointer fade-in" onclick="selectReview(\${r.id})">
            <div class="flex items-center gap-2 mb-3 flex-wrap">
              <span class="w-7 h-7 rounded-full text-white text-[10px] flex items-center justify-center font-bold" style="background:\${platformColors[r.platform]}">\${platformNames[r.platform]?.[0]||'?'}</span>
              <span class="text-xs font-medium text-gray-500">\${platformNames[r.platform]||r.platform}</span>
              <span class="text-yellow-500 text-sm">\${stars}</span>
              \${statusBadge}
              \${custBadge}
            </div>
            <p class="text-sm text-gray-700 mb-3 leading-relaxed">\${r.review_text}</p>
            <div class="flex flex-wrap gap-2">
              \${menus.map(m => '<span class="text-[11px] bg-gray-100 text-gray-600 px-2 py-1 rounded-lg"><i class="fas fa-utensils mr-1 text-brand-400"></i>'+m+'</span>').join('')}
              <span class="text-[11px] \${sentClass} px-2 py-1 rounded-lg font-medium">\${sentLabel}</span>
            </div>
          </div>\`;
      }).join('');
    }

    function selectReview(id) {
      selectedReview = allReviews.find(r => r.id === id);
      if(!selectedReview) return;
      const panel = document.getElementById('ai-response-content');
      const replyText = selectedReview.reply_text || selectedReview.candidate_text || '';
      const score = selectedReview.quality_score || 0;
      const actionButton = selectedReview.status === 'posted'
        ? '<button class="py-2.5 bg-green-100 text-green-700 rounded-xl text-sm font-semibold cursor-default"><i class="fas fa-check mr-1"></i>등록 완료</button>'
        : selectedReview.status === 'approved'
          ? '<button onclick="postApprovedReply(' + selectedReview.id + ')" class="py-2.5 bg-blue-500 text-white rounded-xl text-sm font-semibold hover:bg-blue-600 transition"><i class="fas fa-paper-plane mr-1"></i>수동 등록</button>'
          : '<button onclick="approveReply(' + selectedReview.id + ')" class="py-2.5 bg-brand-500 text-white rounded-xl text-sm font-semibold hover:bg-brand-600 transition"><i class="fas fa-check mr-1"></i>승인</button>';
      if(replyText) {
        panel.innerHTML = \`
          <div class="mb-4">
            <label class="text-sm font-medium text-gray-700 mb-2 block">생성된 답변</label>
            <div class="bg-brand-50 rounded-xl p-4 text-sm text-gray-700 leading-relaxed border border-brand-100" id="reply-text">\${replyText}</div>
          </div>
          <div class="flex items-center gap-2 mb-4">
            <span class="text-sm text-gray-500">품질 점수:</span>
            <span class="text-lg font-bold text-brand-500">\${score.toFixed?.(1) || score}</span>
          </div>
          <div class="grid grid-cols-2 gap-2 mb-4">
            <button onclick="regenerate()" class="py-2.5 border border-gray-200 rounded-xl text-sm font-medium text-gray-600 hover:bg-gray-50 transition"><i class="fas fa-redo mr-1"></i>재생성</button>
            <button onclick="editReply()" class="py-2.5 border border-gray-200 rounded-xl text-sm font-medium text-gray-600 hover:bg-gray-50 transition"><i class="fas fa-pen mr-1"></i>수정</button>
            <button onclick="saveReply()" class="py-2.5 border border-brand-200 rounded-xl text-sm font-medium text-brand-600 hover:bg-brand-50 transition"><i class="fas fa-save mr-1"></i>저장</button>
            \${actionButton}
          </div>
          <div class="flex items-center justify-between">
            <div class="flex items-center gap-2">
              <span class="text-sm text-gray-500">자동 게시</span>
              <div class="w-10 h-6 bg-brand-500 rounded-full relative cursor-pointer"><div class="w-4 h-4 bg-white rounded-full absolute right-1 top-1 shadow"></div></div>
            </div>
            <button class="text-sm text-gray-400 border border-gray-200 px-3 py-1.5 rounded-lg hover:text-gray-600">건너뛰기</button>
          </div>\`;
      } else {
        panel.innerHTML = \`
          <div class="text-center py-8">
            <p class="text-sm text-gray-500 mb-4">이 리뷰에 대한 AI 답변이 아직 없습니다.</p>
            <button onclick="generateForReview(\${selectedReview.id})" class="bg-brand-500 text-white px-6 py-2.5 rounded-xl text-sm font-semibold hover:bg-brand-600 transition">
              <i class="fas fa-magic mr-2"></i>AI 답변 생성
            </button>
          </div>\`;
      }
    }

    function filterTab(tab) {
      const buttons = document.querySelectorAll('main .flex.items-center.gap-1 button');
      buttons.forEach(b => { b.className = 'px-5 py-2.5 rounded-lg text-sm font-semibold text-gray-500 hover:bg-gray-50'; });
      event.target.className = 'px-5 py-2.5 rounded-lg text-sm font-semibold bg-brand-500 text-white';
      if(tab === 'all') renderReviews(allReviews);
      else renderReviews(allReviews.filter(r => r.status === tab));
    }
    async function batchGenerate() {
      const btn = document.getElementById('btn-batch-gen');
      btn.disabled = true;
      btn.innerHTML = '<i class="fas fa-spinner fa-spin mr-2"></i>AI 생성 중...';
      try {
        const res = await apiFetch('/api/v1/reviews/batch-generate', { method:'POST' });
        const data = await res.json();
        if(data.error) { alert(data?.error?.message || '일괄 생성에 실패했습니다.'); return; }
        alert(data.generated_count + '건의 AI 답변이 생성되었습니다!');
        location.reload();
      } catch(e) { alert('일괄 생성 실패: ' + e.message); }
      finally { btn.disabled = false; btn.innerHTML = '<i class="fas fa-wand-magic-sparkles mr-2"></i>AI 일괄 생성'; }
    }

    async function syncReviews() {
      const btn = document.getElementById('btn-sync');
      const syncMode = document.getElementById('sync-mode').value;
      const demo = syncMode !== 'live';
      btn.disabled = true;
      btn.innerHTML = '<i class="fas fa-spinner fa-spin mr-2"></i>수집 중...';
      try {
        // 3개 플랫폼 순차 수집
        let totalInserted = 0;
        let totalFailed = 0;
        for (const platform of ['baemin', 'coupang_eats', 'yogiyo']) {
          try {
            const res = await apiFetch('/api/v1/reviews/sync', {
              method: 'POST',
              body: JSON.stringify({ platform, demo })
            });
            const data = await res.json();
            if (data.inserted) totalInserted += data.inserted;
            if (!data.success) totalFailed += 1;
          } catch(e) { console.error(platform, e); }
        }
        if (totalInserted > 0) {
          alert(totalInserted + '건의 새 리뷰가 수집되었습니다!');
          location.reload();
        } else if (!demo && totalFailed > 0) {
          alert('실제 수집에 실패했습니다. 설정 페이지에서 플랫폼 계정 연결 상태를 먼저 확인해주세요.');
        } else {
          alert('새로운 리뷰가 없거나 크롤러 서버가 실행 중이 아닙니다.\\n\\n크롤러 시작: pm2 start crawler/ecosystem.config.cjs');
        }
      } catch(e) { alert('리뷰 수집 실패: ' + e.message); }
      finally { btn.disabled = false; btn.innerHTML = '<i class="fas fa-sync-alt mr-2"></i>리뷰 수집'; }
    }
    function applyFilter() {}
    function resetFilters() { renderReviews(allReviews); }
    async function regenerate() {
      if(!selectedReview) return;
      const panel = document.getElementById('ai-response-content');
      panel.innerHTML = '<div class="text-center py-8"><i class="fas fa-spinner fa-spin text-brand-500 text-2xl"></i><p class="mt-3 text-sm text-gray-500">AI가 새로운 답변을 생성하고 있습니다...</p></div>';
      try {
        const res = await apiFetch('/api/v1/reviews/' + selectedReview.id + '/generate', { method: 'POST' });
        const data = await res.json();
        if (data.error) { alert(data?.error?.message || '재생성에 실패했습니다.'); selectReview(selectedReview.id); return; }
        // Refresh reviews
        const rr = await apiFetch('/api/v1/reviews?limit=50');
        const rd = await rr.json();
        allReviews = rd.reviews || [];
        renderReviews(allReviews);
        selectedReview.candidate_text = data.reply_text;
        selectedReview.quality_score = data.quality_score;
        selectReview(selectedReview.id);
      } catch(e) { alert('재생성 실패: ' + e.message); selectReview(selectedReview.id); }
    }

    function getEditedReplyText() {
      const el = document.getElementById('reply-text');
      return el ? el.innerText.trim() : '';
    }

    function editReply() {
      const el = document.getElementById('reply-text');
      if (!el) return;
      el.contentEditable = true;
      el.focus();
      el.style.border = '2px solid #F97316';
    }

    async function saveReply() {
      if (!selectedReview) return;
      const replyText = getEditedReplyText();
      if (!replyText) {
        alert('저장할 답변 내용을 입력해주세요.');
        return;
      }

      try {
        const res = await apiFetch('/api/v1/reviews/' + selectedReview.id + '/reply', {
          method: 'PATCH',
          body: JSON.stringify({ reply_text: replyText })
        });
        const data = await res.json();
        if (!res.ok || data.error) {
          alert(data?.error?.message || '답변 저장에 실패했습니다.');
          return false;
        }

        selectedReview.reply_text = replyText;
        selectedReview.candidate_text = replyText;
        const el = document.getElementById('reply-text');
        if (el) {
          el.contentEditable = false;
          el.style.border = '1px solid #FED7AA';
        }
        return true;
      } catch (e) {
        alert('답변 저장 실패: ' + e.message);
        return false;
      }
    }

    async function approveReply(id) {
      try {
        const currentReplyText = getEditedReplyText();
        const savedReplyText = (selectedReview?.reply_text || selectedReview?.candidate_text || '').trim();
        if (currentReplyText && currentReplyText !== savedReplyText) {
          const saved = await saveReply();
          if (!saved) return;
        }

        const res = await apiFetch('/api/v1/reviews/approve', { method:'POST', body: JSON.stringify({review_ids:[id], auto_post:true}) });
        const data = await res.json();
        if(data.success) {
          const rr = await apiFetch('/api/v1/reviews?limit=50'); const rd = await rr.json(); allReviews = rd.reviews||[]; renderReviews(allReviews);
          const statusMessage = data.posted_count > 0
            ? '답변이 승인되고 플랫폼에 등록되었습니다!'
            : '답변이 승인되었습니다. 플랫폼 등록은 대기 또는 실패 상태입니다.';
          document.getElementById('ai-response-content').innerHTML = '<div class="text-center py-8"><i class="fas fa-check-circle text-green-500 text-3xl"></i><p class="mt-3 text-sm text-green-600 font-semibold">'+statusMessage+'</p></div>';
        } else {
          alert(data?.error?.message || '승인에 실패했습니다.');
        }
      } catch(e) { alert('승인 실패: ' + e.message); }
    }
    async function approveAll() {
      const generatedIds = allReviews.filter(r => r.status === 'generated').map(r => r.id);
      if(!generatedIds.length) { alert('승인할 답변이 없습니다.'); return; }
      try {
        const res = await apiFetch('/api/v1/reviews/approve', { method:'POST', body: JSON.stringify({review_ids:generatedIds, auto_post:true}) });
        const data = await res.json();
        if (!res.ok || data.error) {
          alert(data?.error?.message || '일괄 승인에 실패했습니다.');
          return;
        }
        alert(data.approved_count + '건 승인, ' + data.posted_count + '건 등록 완료');
        location.reload();
      } catch(e) { alert('일괄 승인 실패: ' + e.message); }
    }

    async function postApprovedReply(id) {
      try {
        const res = await apiFetch('/api/v1/reviews/' + id + '/post', { method: 'POST' });
        const data = await res.json();
        if (!res.ok || data.error) {
          alert(data?.error?.message || '답변 등록에 실패했습니다.');
          return;
        }

        const rr = await apiFetch('/api/v1/reviews?limit=50');
        const rd = await rr.json();
        allReviews = rd.reviews || [];
        renderReviews(allReviews);
        selectReview(id);
      } catch (e) {
        alert('답변 등록 실패: ' + e.message);
      }
    }

    async function generateForReview(id) {
      const panel = document.getElementById('ai-response-content');
      panel.innerHTML = '<div class="text-center py-8"><i class="fas fa-spinner fa-spin text-brand-500 text-2xl"></i><p class="mt-3 text-sm text-gray-500">AI가 답변을 생성하고 있습니다...</p><p class="text-xs text-gray-400 mt-1">GPT가 리뷰를 분석 중입니다...</p></div>';
      try {
        const res = await apiFetch('/api/v1/reviews/' + id + '/generate', { method: 'POST' });
        const data = await res.json();
        if (data.error) { alert(data?.error?.message || 'AI 답변 생성에 실패했습니다.'); return; }
        // Refresh
        const rr = await apiFetch('/api/v1/reviews?limit=50'); const rd = await rr.json(); allReviews = rd.reviews||[]; renderReviews(allReviews);
        selectReview(id);
      } catch(e) { alert('AI 답변 생성 실패: ' + e.message); selectReview(id); }
    }
  </script>
</body>
</html>`
}

// ============================================================
//  CUSTOMERS PAGE
// ============================================================
function customersPage() {
  return `${baseHead('고객 분석')}
<body class="bg-gray-50 min-h-screen">
  ${userSidebar('customers')}
  <main class="ml-[72px] p-6">
    <h1 class="text-2xl font-bold text-gray-900 mb-6">고객 분석</h1>
    <div class="grid lg:grid-cols-3 gap-6 mb-6">
      <div class="bg-white rounded-2xl p-6 border border-gray-100 card-hover">
        <div class="text-sm text-gray-500 mb-2">총 고객 수</div>
        <div class="text-3xl font-bold text-gray-900">186</div>
        <div class="text-xs text-green-500 mt-1"><i class="fas fa-arrow-up"></i> +12 이번 주</div>
      </div>
      <div class="bg-white rounded-2xl p-6 border border-gray-100 card-hover">
        <div class="text-sm text-gray-500 mb-2">단골 고객</div>
        <div class="text-3xl font-bold text-brand-500">24</div>
        <div class="text-xs text-gray-400 mt-1">5회 이상 주문</div>
      </div>
      <div class="bg-white rounded-2xl p-6 border border-gray-100 card-hover">
        <div class="text-sm text-gray-500 mb-2">재방문율</div>
        <div class="text-3xl font-bold text-blue-500">45%</div>
        <div class="text-xs text-green-500 mt-1"><i class="fas fa-arrow-up"></i> +3.2%</div>
      </div>
    </div>
    <div class="bg-white rounded-2xl p-6 border border-gray-100">
      <h2 class="text-lg font-bold text-gray-900 mb-4">고객 목록</h2>
      <div class="overflow-x-auto">
        <table class="w-full text-sm">
          <thead><tr class="text-left text-gray-500 border-b border-gray-100">
            <th class="pb-3 font-medium">고객명</th><th class="pb-3 font-medium">유형</th><th class="pb-3 font-medium">주문 횟수</th><th class="pb-3 font-medium">즐겨 메뉴</th><th class="pb-3 font-medium">최근 주문</th>
          </tr></thead>
          <tbody id="customer-table"></tbody>
        </table>
      </div>
    </div>
  </main>
  <script>
    ensureAuthenticated();

    apiFetch('/api/v1/dashboard/repeat_customers').then(r=>r.json()).then(data => {
      const customers = data.customers || data || [];
      document.getElementById('customer-table').innerHTML = customers.map(c => {
        const typeBadge = c.customer_type === 'loyal' ? '<span class="bg-green-100 text-green-700 px-2 py-0.5 rounded-full text-xs">단골</span>' : '<span class="bg-blue-100 text-blue-700 px-2 py-0.5 rounded-full text-xs">재방문</span>';
        return \`<tr class="border-b border-gray-50 hover:bg-gray-50"><td class="py-3 font-medium text-gray-900">\${c.customer_name}</td><td>\${typeBadge}</td><td class="font-bold text-brand-500">\${c.order_count}회</td><td class="text-gray-500">\${c.favorite_menu||'-'}</td><td class="text-gray-400 text-xs">\${new Date(c.last_order_at).toLocaleDateString('ko-KR')}</td></tr>\`;
      }).join('');
    });
  </script>
</body>
</html>`
}

// ============================================================
//  BILLING PAGE
// ============================================================
function billingPage() {
  return `${baseHead('구독 및 결제', '<script src="https://cdn.portone.io/v2/browser-sdk.js"></script>')}
<body class="bg-gray-50 min-h-screen">
  ${userSidebar('billing')}
  <main class="ml-[72px] p-6">
    <h1 class="text-2xl font-bold text-gray-900 mb-6">구독 및 결제</h1>

    <div id="billing-alert" class="hidden mb-6 rounded-2xl border px-5 py-4 text-sm"></div>

    <div class="grid lg:grid-cols-[1fr_380px] gap-6 mb-6">
      <div class="bg-white rounded-2xl p-6 border border-gray-100">
        <div class="flex items-center justify-between mb-5">
          <h2 class="text-lg font-bold text-gray-900">요금제 선택</h2>
          <span class="text-xs text-gray-400">PortOne 카드 결제</span>
        </div>
        <div id="plans-grid" class="grid md:grid-cols-3 gap-4">
          <div class="col-span-full text-center py-12 text-gray-400">
            <i class="fas fa-spinner fa-spin text-xl"></i>
            <p class="mt-3 text-sm">요금제를 불러오는 중...</p>
          </div>
        </div>
      </div>

      <div class="space-y-6">
        <div class="bg-white rounded-2xl p-6 border border-gray-100">
          <h3 class="text-sm text-gray-500 mb-2">현재 요금제</h3>
          <div id="current-plan-name" class="text-brand-500 font-bold text-lg mb-1">없음</div>
          <div id="current-plan-price" class="text-3xl font-extrabold text-gray-900 mb-3">-</div>
          <div id="current-plan-period" class="text-sm text-gray-500 mb-2">구독 정보 없음</div>
          <div id="current-plan-status" class="flex items-center gap-2 text-sm text-gray-400">
            <i class="fas fa-minus-circle"></i>미구독
          </div>
        </div>

        <div class="bg-white rounded-2xl p-6 border border-gray-100">
          <div class="flex items-center justify-between mb-4">
            <h3 class="font-bold text-gray-900">결제 내역</h3>
            <span class="text-xs text-gray-400">최근 20건</span>
          </div>
          <div class="space-y-3" id="payment-history">
            <div class="text-sm text-gray-400">결제 내역을 불러오는 중...</div>
          </div>
        </div>
      </div>
    </div>

    <div class="grid lg:grid-cols-2 gap-6">
      <div class="bg-white rounded-2xl p-6 border border-gray-100">
        <h3 class="font-bold text-gray-900 mb-4">결제 수단</h3>
        <div id="payment-methods" class="space-y-3">
          <div class="text-sm text-gray-400">저장된 결제 수단을 불러오는 중...</div>
        </div>
      </div>

      <div class="bg-white rounded-2xl p-6 border border-gray-100">
        <h3 class="font-bold text-gray-900 mb-4">구독 해지</h3>
        <p class="text-sm text-gray-500 mb-6 leading-relaxed">
          현재 결제 주기가 끝난 뒤 더 이상 갱신되지 않도록 처리합니다. MVP 단계에서는 즉시 해지 대신
          기간 종료 후 해지 상태로 전환됩니다.
        </p>
        <button onclick="cancelSubscription()" class="border-2 border-red-300 text-red-500 px-6 py-2.5 rounded-xl text-sm font-semibold hover:bg-red-50 transition">
          구독 해지하기
        </button>
      </div>
    </div>
  </main>
  <script>
    ensureAuthenticated();

    let billingConfig = null;
    let plans = [];
    let currentSubscription = null;

    function showBillingAlert(message, tone) {
      const el = document.getElementById('billing-alert');
      const styles = tone === 'error'
        ? 'border-red-200 bg-red-50 text-red-700'
        : tone === 'success'
          ? 'border-green-200 bg-green-50 text-green-700'
          : 'border-blue-200 bg-blue-50 text-blue-700';
      el.className = 'mb-6 rounded-2xl border px-5 py-4 text-sm ' + styles;
      el.textContent = message;
      el.classList.remove('hidden');
    }

    function renderPlans() {
      const container = document.getElementById('plans-grid');
      if (!plans.length) {
        container.innerHTML = '<div class="col-span-full text-center py-12 text-gray-400">활성 요금제가 없습니다.</div>';
        return;
      }

      container.innerHTML = plans.map(plan => {
        const isCurrent = currentSubscription && Number(currentSubscription.plan_id) === Number(plan.id) && currentSubscription.status === 'active';
        const features = typeof plan.features === 'string' ? JSON.parse(plan.features || '{}') : (plan.features || {});
        return '<div class="rounded-2xl border ' + (isCurrent ? 'border-brand-500 bg-brand-50' : 'border-gray-200 bg-white') + ' p-5">'
          + '<div class="flex items-center justify-between mb-3"><div class="text-lg font-bold text-gray-900">' + plan.name + '</div>'
          + (isCurrent ? '<span class="text-[11px] bg-brand-500 text-white px-2 py-1 rounded-full">현재 이용 중</span>' : '') + '</div>'
          + '<div class="text-3xl font-extrabold text-gray-900 mb-1">₩' + Number(plan.price || 0).toLocaleString() + '</div>'
          + '<div class="text-sm text-gray-500 mb-4">월 ' + Number(plan.review_limit || 0).toLocaleString() + '건 리뷰 응답</div>'
          + '<div class="space-y-2 text-sm text-gray-600 mb-5">'
          + '<div><i class="fas fa-check text-green-500 mr-2"></i>분석 등급: ' + (features.analytics || 'basic') + '</div>'
          + '<div><i class="fas fa-check text-green-500 mr-2"></i>답변 스타일: ' + (features.reply_style || 'default') + '</div>'
          + '<div><i class="fas fa-check text-green-500 mr-2"></i>말투 학습: ' + (features.tone_learning ? '지원' : '미지원') + '</div>'
          + '</div>'
          + '<button onclick="startCheckout(' + plan.id + ')" class="w-full py-2.5 rounded-xl text-sm font-semibold '
          + (isCurrent ? 'bg-white text-brand-600 border border-brand-200' : 'bg-brand-500 text-white hover:bg-brand-600')
          + ' transition">' + (isCurrent ? '현재 요금제' : '이 요금제로 결제') + '</button>'
          + '</div>';
      }).join('');
    }

    function renderSubscription(subscription) {
      const nameEl = document.getElementById('current-plan-name');
      const priceEl = document.getElementById('current-plan-price');
      const periodEl = document.getElementById('current-plan-period');
      const statusEl = document.getElementById('current-plan-status');

      if (!subscription) {
        nameEl.textContent = '없음';
        priceEl.textContent = '-';
        periodEl.textContent = '구독 정보 없음';
        statusEl.className = 'flex items-center gap-2 text-sm text-gray-400';
        statusEl.innerHTML = '<i class="fas fa-minus-circle"></i>미구독';
        return;
      }

      nameEl.textContent = subscription.plan_name || '구독 중';
      priceEl.innerHTML = '₩' + Number(subscription.price || 0).toLocaleString() + '<span class="text-sm text-gray-400 font-normal">/월</span>';
      periodEl.textContent = '다음 결제일: ' + new Date(subscription.current_period_end).toLocaleDateString('ko-KR');
      statusEl.className = 'flex items-center gap-2 text-sm ' + (subscription.status === 'active' ? 'text-green-600' : 'text-yellow-600');
      statusEl.innerHTML = subscription.cancel_at_period_end
        ? '<i class="fas fa-clock"></i>기간 종료 후 해지 예정'
        : '<i class="fas fa-check-circle"></i>' + (subscription.status === 'active' ? '자동 결제 활성화' : subscription.status);
    }

    function renderPayments(payments) {
      const container = document.getElementById('payment-history');
      if (!payments.length) {
        container.innerHTML = '<div class="text-sm text-gray-400">결제 내역이 없습니다.</div>';
        return;
      }

      container.innerHTML = payments.map(payment => {
        const dateText = payment.paid_at ? new Date(payment.paid_at).toLocaleDateString('ko-KR') : new Date(payment.created_at).toLocaleDateString('ko-KR');
        const statusMap = {
          completed: 'bg-green-100 text-green-700',
          pending: 'bg-yellow-100 text-yellow-700',
          failed: 'bg-red-100 text-red-700',
          refunded: 'bg-gray-100 text-gray-700'
        };
        return '<div class="flex items-center justify-between py-2 border-b border-gray-50">'
          + '<div><div class="text-sm text-gray-700">' + dateText + '</div><div class="text-[11px] text-gray-400">' + (payment.payment_id || payment.transaction_id || '-') + '</div></div>'
          + '<div class="flex items-center gap-3"><span class="font-bold text-gray-900">₩' + Number(payment.amount || 0).toLocaleString() + '</span>'
          + '<span class="text-xs px-2 py-0.5 rounded-full ' + (statusMap[payment.status] || 'bg-gray-100 text-gray-700') + '">' + payment.status + '</span></div>'
          + '</div>';
      }).join('');
    }

    function renderPaymentMethods(methods) {
      const container = document.getElementById('payment-methods');
      if (!methods.length) {
        container.innerHTML = '<div class="text-sm text-gray-400">저장된 결제 수단이 없습니다. PortOne 결제 후 갱신됩니다.</div>';
        return;
      }

      container.innerHTML = methods.map(method => {
        return '<div class="flex items-center gap-4 p-4 bg-gray-50 rounded-xl">'
          + '<div class="text-2xl font-bold text-blue-800">' + (method.card_brand || method.type || '').toUpperCase() + '</div>'
          + '<div><div class="font-medium text-gray-900">**** ' + (method.card_last4 || '----') + '</div>'
          + '<div class="text-xs text-gray-400">만료일 ' + (method.expiry_date || '-')
          + (method.is_default ? ' · 기본 결제수단' : '') + '</div></div></div>';
      }).join('');
    }

    async function loadBilling() {
      const [configRes, plansRes, subscriptionRes, paymentsRes, methodsRes] = await Promise.all([
        apiFetch('/api/v1/billing/config'),
        apiFetch('/api/v1/plans'),
        apiFetch('/api/v1/subscriptions'),
        apiFetch('/api/v1/payments'),
        apiFetch('/api/v1/payment_methods')
      ]);

      billingConfig = await configRes.json();
      const plansData = await plansRes.json();
      const subscriptionData = await subscriptionRes.json();
      const paymentsData = await paymentsRes.json();
      const methodsData = await methodsRes.json();

      plans = plansData.plans || [];
      currentSubscription = subscriptionData.subscription || null;

      renderSubscription(currentSubscription);
      renderPlans();
      renderPayments(paymentsData.payments || []);
      renderPaymentMethods(methodsData.payment_methods || []);

      if (!billingConfig.configured) {
        showBillingAlert('PortOne 설정이 아직 완료되지 않았습니다. PORTONE_STORE_ID, PORTONE_CHANNEL_KEY, PORTONE_API_SECRET를 설정해야 실제 결제가 동작합니다.', 'info');
      }

      const params = new URLSearchParams(window.location.search);
      if (params.get('paymentId')) {
        await completePayment(params.get('paymentId'));
      }
      if (params.get('code')) {
        showBillingAlert(params.get('message') || '결제가 취소되었거나 실패했습니다.', 'error');
      }
    }

    async function startCheckout(planId) {
      try {
        const prepareRes = await apiFetch('/api/v1/billing/checkout', {
          method: 'POST',
          body: JSON.stringify({ plan_id: planId })
        });
        const prepareData = await prepareRes.json();
        if (!prepareRes.ok || prepareData.error) {
          showBillingAlert(prepareData?.error?.message || '결제 준비에 실패했습니다.', 'error');
          return;
        }

        if (typeof PortOne === 'undefined' || typeof PortOne.requestPayment !== 'function') {
          showBillingAlert('PortOne 브라우저 SDK를 불러오지 못했습니다.', 'error');
          return;
        }

        const paymentResponse = await PortOne.requestPayment({
          storeId: prepareData.store_id,
          channelKey: prepareData.channel_key,
          paymentId: prepareData.payment_id,
          orderName: prepareData.order_name,
          totalAmount: prepareData.amount,
          currency: 'CURRENCY_KRW',
          payMethod: 'CARD',
          redirectUrl: prepareData.redirect_url,
          customer: {
            fullName: getCurrentUser()?.name || 'Respondio User',
            email: getCurrentUser()?.email || ''
          }
        });

        if (paymentResponse?.code) {
          showBillingAlert(paymentResponse.message || '결제가 취소되었거나 실패했습니다.', 'error');
          return;
        }

        await completePayment(prepareData.payment_id, planId);
      } catch (error) {
        showBillingAlert('결제 요청 실패: ' + error.message, 'error');
      }
    }

    async function completePayment(paymentId, planId) {
      try {
        const response = await apiFetch('/api/v1/billing/complete', {
          method: 'POST',
          body: JSON.stringify({ payment_id: paymentId, plan_id: planId || null })
        });
        const data = await response.json();
        if (!response.ok || data.error) {
          showBillingAlert(data?.error?.message || '결제 검증에 실패했습니다.', 'error');
          return;
        }

        const url = new URL(window.location.href);
        url.searchParams.delete('paymentId');
        url.searchParams.delete('code');
        url.searchParams.delete('message');
        window.history.replaceState({}, '', url.toString());

        showBillingAlert(data.plan_name + ' 결제가 완료되었습니다.', 'success');
        await loadBilling();
      } catch (error) {
        showBillingAlert('결제 완료 처리 실패: ' + error.message, 'error');
      }
    }

    async function cancelSubscription() {
      try {
        const response = await apiFetch('/api/v1/subscriptions/cancel', { method: 'POST' });
        const data = await response.json();
        if (!response.ok || data.error) {
          showBillingAlert(data?.error?.message || '구독 해지 처리에 실패했습니다.', 'error');
          return;
        }

        showBillingAlert('현재 구독은 기간 종료 후 해지되도록 변경되었습니다.', 'success');
        await loadBilling();
      } catch (error) {
        showBillingAlert('구독 해지 실패: ' + error.message, 'error');
      }
    }

    loadBilling().catch(error => {
      showBillingAlert('구독 정보를 불러오지 못했습니다: ' + error.message, 'error');
    });
  </script>
</body>
</html>`
}

// ============================================================
//  SETTINGS PAGE
// ============================================================
function settingsPage() {
  return `${baseHead('설정')}
<body class="bg-gray-50 min-h-screen">
  ${userSidebar('settings')}
  <main class="ml-[72px] p-6">
    <h1 class="text-2xl font-bold text-gray-900 mb-6">설정</h1>
    <div id="settings-alert" class="hidden max-w-4xl mb-6 rounded-2xl border px-5 py-4 text-sm"></div>
    <div class="max-w-4xl space-y-6">
      <div class="bg-white rounded-2xl p-6 border border-gray-100">
        <h2 class="text-lg font-bold text-gray-900 mb-4">매장 정보</h2>
        <div class="space-y-4">
          <div>
            <label class="text-sm font-medium text-gray-700 mb-1 block">매장 이름</label>
            <input type="text" id="store-name" class="w-full px-4 py-3 border border-gray-200 rounded-xl focus:ring-2 focus:ring-brand-500 outline-none">
          </div>
          <div>
            <label class="text-sm font-medium text-gray-700 mb-1 block">사업자번호(마스킹)</label>
            <input type="text" id="business-number" class="w-full px-4 py-3 border border-gray-200 rounded-xl focus:ring-2 focus:ring-brand-500 outline-none">
          </div>
        </div>
      </div>
      <div class="bg-white rounded-2xl p-6 border border-gray-100">
        <h2 class="text-lg font-bold text-gray-900 mb-4">답변 스타일 설정</h2>
        <div class="grid grid-cols-2 gap-4 mb-4" id="reply-style-options">
          ${[
            ['friendly', '친근형'],
            ['polite', '정중형'],
            ['casual', '캐주얼'],
            ['custom', '커스텀']
          ].map(([value, label]) => `
            <label class="flex items-center gap-3 p-4 border border-gray-200 rounded-xl cursor-pointer hover:border-brand-300 transition">
              <input type="radio" name="style" value="${value}" class="text-brand-500">
              <span class="font-medium text-sm">${label}</span>
            </label>
          `).join('')}
        </div>
        <div>
          <label class="text-sm font-medium text-gray-700 mb-1 block">말투 샘플</label>
          <textarea id="tone-sample" rows="4" class="w-full px-4 py-3 border border-gray-200 rounded-xl focus:ring-2 focus:ring-brand-500 outline-none" placeholder="예: 리뷰 남겨주셔서 감사합니다! 다음에도 맛있게 준비해둘게요 :)"></textarea>
        </div>
      </div>
      <div class="bg-white rounded-2xl p-6 border border-gray-100">
        <div class="flex items-center justify-between mb-4">
          <div>
            <h2 class="text-lg font-bold text-gray-900">플랫폼 연결</h2>
            <p class="text-sm text-gray-500 mt-1">실제 운영 수집은 먼저 플랫폼 계정을 연결해야 합니다.</p>
          </div>
          <button onclick="loadConnections()" class="border border-gray-200 text-gray-600 px-4 py-2 rounded-xl text-sm hover:bg-gray-50 transition">
            상태 새로고침
          </button>
        </div>
        <div id="platform-connection-list" class="space-y-4">
          <div class="text-sm text-gray-400">플랫폼 연결 상태를 불러오는 중...</div>
        </div>
      </div>
      <button onclick="saveStoreSettings()" class="bg-brand-500 text-white px-8 py-3 rounded-xl font-semibold hover:bg-brand-600 transition">설정 저장</button>
    </div>
  </main>
  <script>
    ensureAuthenticated();

    const platformMeta = {
      baemin: { label: '배달의민족', color: '#00C4B4' },
      coupang_eats: { label: '쿠팡이츠', color: '#E4002B' },
      yogiyo: { label: '요기요', color: '#FA0050' }
    };

    function showSettingsAlert(message, tone) {
      const el = document.getElementById('settings-alert');
      const styles = tone === 'error'
        ? 'border-red-200 bg-red-50 text-red-700'
        : tone === 'success'
          ? 'border-green-200 bg-green-50 text-green-700'
          : 'border-blue-200 bg-blue-50 text-blue-700';
      el.className = 'max-w-4xl mb-6 rounded-2xl border px-5 py-4 text-sm ' + styles;
      el.textContent = message;
      el.classList.remove('hidden');
    }

    function setReplyStyle(style) {
      const radio = document.querySelector('input[name="style"][value="' + style + '"]');
      if (radio) radio.checked = true;
    }

    async function loadStoreSettings() {
      const response = await apiFetch('/api/v1/store/settings');
      const data = await response.json();
      if (!response.ok || data.error) {
        throw new Error(data?.error?.message || '매장 설정을 불러오지 못했습니다.');
      }

      const store = data.store || {};
      document.getElementById('store-name').value = store.store_name || '';
      document.getElementById('business-number').value = store.business_number_masked || '';
      document.getElementById('tone-sample').value = store.reply_tone_sample || '';
      setReplyStyle(store.reply_style || 'friendly');
    }

    function renderConnections(connections) {
      const container = document.getElementById('platform-connection-list');
      container.innerHTML = Object.entries(platformMeta).map(([platform, meta]) => {
        const connection = (connections || []).find(item => item.platform === platform) || {};
        const status = connection.connection_status || 'disconnected';
        const statusBadge = status === 'connected'
          ? '<span class="text-xs bg-green-100 text-green-700 px-2 py-1 rounded-full">연결됨</span>'
          : status === 'error'
            ? '<span class="text-xs bg-red-100 text-red-700 px-2 py-1 rounded-full">오류</span>'
            : '<span class="text-xs bg-gray-100 text-gray-700 px-2 py-1 rounded-full">미연결</span>';
        return '<div class="border border-gray-200 rounded-2xl p-5">'
          + '<div class="flex items-center justify-between mb-4"><div class="flex items-center gap-3">'
          + '<div class="w-10 h-10 rounded-full text-white text-xs font-bold flex items-center justify-center" style="background:' + meta.color + '">' + meta.label.slice(0, 2) + '</div>'
          + '<div><div class="font-semibold text-gray-900">' + meta.label + '</div><div class="text-xs text-gray-400">' + (connection.last_error || '운영 계정 연결 후 실제 수집 가능') + '</div></div></div>'
          + statusBadge + '</div>'
          + '<div class="grid md:grid-cols-3 gap-3 mb-4">'
          + '<input id="' + platform + '-email" type="email" value="' + (connection.login_email || '') + '" placeholder="로그인 이메일" class="px-4 py-3 border border-gray-200 rounded-xl focus:ring-2 focus:ring-brand-500 outline-none">'
          + '<input id="' + platform + '-password" type="password" placeholder="' + (connection.has_credentials ? '기존 비밀번호 저장됨' : '로그인 비밀번호') + '" class="px-4 py-3 border border-gray-200 rounded-xl focus:ring-2 focus:ring-brand-500 outline-none">'
          + '<input id="' + platform + '-store-id" type="text" value="' + (connection.platform_store_id || '') + '" placeholder="플랫폼 매장 ID (선택)" class="px-4 py-3 border border-gray-200 rounded-xl focus:ring-2 focus:ring-brand-500 outline-none">'
          + '</div>'
          + '<div class="flex flex-wrap items-center gap-3">'
          + '<button onclick="connectPlatform(\\'' + platform + '\\')" class="bg-brand-500 text-white px-4 py-2.5 rounded-xl text-sm font-semibold hover:bg-brand-600 transition">계정 연결</button>'
          + '<button onclick="disconnectPlatform(\\'' + platform + '\\')" class="border border-gray-200 text-gray-600 px-4 py-2.5 rounded-xl text-sm font-medium hover:bg-gray-50 transition">연결 해제</button>'
          + '<span class="text-xs text-gray-400">마지막 동기화: ' + (connection.last_sync_at ? new Date(connection.last_sync_at).toLocaleString('ko-KR') : '-') + '</span>'
          + '</div></div>';
      }).join('');
    }

    async function loadConnections() {
      const response = await apiFetch('/api/v1/platform_connections');
      const data = await response.json();
      if (!response.ok || data.error) {
        throw new Error(data?.error?.message || '플랫폼 연결 상태를 불러오지 못했습니다.');
      }

      renderConnections(data.connections || []);
    }

    async function saveStoreSettings() {
      const selectedStyle = document.querySelector('input[name="style"]:checked');
      const payload = {
        store_name: document.getElementById('store-name').value.trim(),
        business_number_masked: document.getElementById('business-number').value.trim(),
        reply_style: selectedStyle ? selectedStyle.value : 'friendly',
        reply_tone_sample: document.getElementById('tone-sample').value.trim()
      };

      try {
        const response = await apiFetch('/api/v1/store/settings', {
          method: 'PATCH',
          body: JSON.stringify(payload)
        });
        const data = await response.json();
        if (!response.ok || data.error) {
          showSettingsAlert(data?.error?.message || '설정 저장에 실패했습니다.', 'error');
          return;
        }

        showSettingsAlert('매장 설정이 저장되었습니다.', 'success');
      } catch (error) {
        showSettingsAlert('설정 저장 실패: ' + error.message, 'error');
      }
    }

    async function connectPlatform(platform) {
      const loginEmail = document.getElementById(platform + '-email').value.trim();
      const loginPassword = document.getElementById(platform + '-password').value;
      const platformStoreId = document.getElementById(platform + '-store-id').value.trim();

      if (!loginEmail || !loginPassword) {
        showSettingsAlert('플랫폼 이메일과 비밀번호를 입력해주세요.', 'error');
        return;
      }

      try {
        const response = await apiFetch('/api/v1/platform_connections/' + platform + '/connect', {
          method: 'POST',
          body: JSON.stringify({
            login_email: loginEmail,
            login_password: loginPassword,
            platform_store_id: platformStoreId || null
          })
        });
        const data = await response.json();
        if (!response.ok || data.error || !data.success) {
          showSettingsAlert(data?.message || data?.error?.message || '플랫폼 연결에 실패했습니다.', 'error');
          await loadConnections();
          return;
        }

        showSettingsAlert(platformMeta[platform].label + ' 계정이 연결되었습니다.', 'success');
        await loadConnections();
      } catch (error) {
        showSettingsAlert('플랫폼 연결 실패: ' + error.message, 'error');
      }
    }

    async function disconnectPlatform(platform) {
      try {
        const response = await apiFetch('/api/v1/platform_connections/' + platform + '/disconnect', {
          method: 'POST'
        });
        const data = await response.json();
        if (!response.ok || data.error) {
          showSettingsAlert(data?.error?.message || '플랫폼 연결 해제에 실패했습니다.', 'error');
          return;
        }

        showSettingsAlert(platformMeta[platform].label + ' 연결을 해제했습니다.', 'success');
        await loadConnections();
      } catch (error) {
        showSettingsAlert('플랫폼 연결 해제 실패: ' + error.message, 'error');
      }
    }

    Promise.all([loadStoreSettings(), loadConnections()]).catch(error => {
      showSettingsAlert(error.message, 'error');
    });
  </script>
</body>
</html>`
}

// ============================================================
//  ADMIN DASHBOARD
// ============================================================
function adminDashboardPage() {
  return `${baseHead('관리자', '<style>body{background:#0B1120;color:#F8FAFC;}</style>')}
<body class="min-h-screen">
  <!-- Admin Sidebar -->
  <aside class="fixed left-0 top-0 h-screen w-[200px] bg-dark-900 border-r border-white/5 z-40 flex flex-col">
    <div class="h-16 flex items-center px-6 border-b border-white/5">
      <span class="text-xl font-bold italic text-white">Admin</span>
    </div>
    <nav class="flex-1 py-4 px-3 space-y-1">
      ${[
        { icon: 'fa-chart-line', label: '운영 현황', active: true },
        { icon: 'fa-users', label: '사용자 관리', active: false },
        { icon: 'fa-spider', label: '크롤러 관리', active: false },
        { icon: 'fa-file-alt', label: '로그', active: false },
        { icon: 'fa-database', label: '큐 관리', active: false }
      ].map(it => `
        <a href="#" class="flex items-center gap-3 px-4 py-3 rounded-xl transition ${it.active ? 'bg-white/10 text-white border-l-2 border-brand-500' : 'text-gray-400 hover:bg-white/5 hover:text-gray-200'}">
          <i class="fas ${it.icon} text-sm w-5 text-center"></i>
          <span class="text-sm">${it.label}</span>
        </a>
      `).join('')}
    </nav>
  </aside>

  <!-- Main Content -->
  <main class="ml-[200px]">
    <!-- Header -->
    <header class="h-16 border-b border-white/5 flex items-center justify-between px-6">
      <div class="flex items-center gap-3">
        <i class="fas fa-bars text-gray-400 cursor-pointer"></i>
        <span class="text-gray-300 text-sm">Admin Operations</span>
      </div>
      <div class="flex items-center gap-4">
        <i class="fas fa-cog text-gray-400 hover:text-white cursor-pointer"></i>
        <i class="fas fa-bell text-gray-400 hover:text-white cursor-pointer"></i>
        <div class="w-9 h-9 bg-brand-500 rounded-full flex items-center justify-center"><i class="fas fa-user text-white text-sm"></i></div>
      </div>
    </header>

    <div class="p-6 space-y-6">
      <!-- Top Bar -->
      <div class="flex items-center justify-between mb-2">
        <div>
          <h1 class="text-xl font-bold text-white">운영 현황</h1>
          <p class="text-xs text-gray-500 mt-1">Respondio 관리자 대시보드</p>
        </div>
        <a href="/login" onclick="logout(); return false;" class="text-xs bg-white/10 text-gray-300 px-4 py-2 rounded-lg hover:bg-white/20 transition">
          <i class="fas fa-sign-out-alt mr-1"></i>로그아웃
        </a>
      </div>

      <!-- KPI Cards -->
      <div class="grid grid-cols-3 gap-4">
        <div class="admin-kpi bg-dark-800 rounded-2xl p-6 border border-white/5">
          <div class="flex items-center gap-2 text-gray-400 text-sm mb-2"><i class="fas fa-users"></i>전체 가입자</div>
          <div class="text-3xl font-bold text-white mb-1 kpi-value">-</div>
          <div class="text-xs text-green-400"><i class="fas fa-arrow-up"></i> +1.8% 어제</div>
        </div>
        <div class="admin-kpi bg-dark-800 rounded-2xl p-6 border border-white/5">
          <div class="flex items-center gap-2 text-gray-400 text-sm mb-2"><i class="fas fa-user-check"></i>활성 구독자</div>
          <div class="text-3xl font-bold text-white mb-1 kpi-value">-</div>
          <div class="text-xs text-green-400"><i class="fas fa-arrow-up"></i> +0.5% 어제</div>
        </div>
        <div class="admin-kpi bg-red-900/30 border border-red-500/20 rounded-2xl p-6">
          <div class="flex items-center gap-2 text-gray-400 text-sm mb-2"><i class="fas fa-exclamation-triangle"></i>에러율</div>
          <div class="text-3xl font-bold text-red-400 mb-1 kpi-value">-</div>
          <div class="text-xs text-green-400"><i class="fas fa-arrow-down"></i> -1.2% 어제</div>
        </div>
      </div>

      <!-- Middle Grid -->
      <div class="grid lg:grid-cols-[1fr_400px] gap-6">
        <!-- Error Log -->
        <div class="bg-dark-800 rounded-2xl p-6 border border-white/5">
          <h3 class="font-bold text-white mb-4">에러 로그</h3>
          <div class="space-y-3" id="admin-logs">
            ${[
              { time: '10:45', type: '결제 에러', badge: 'bg-red-500/20 text-red-400', msg: 'Payment declined: Card expired.' },
              { time: '10:32', type: 'API 에러', badge: 'bg-yellow-500/20 text-yellow-400', msg: 'API Timeout: Request timed out.' },
              { time: '10:20', type: 'DB 에러', badge: 'bg-red-500/20 text-red-400', msg: 'Database Connection Error.' },
              { time: '10:15', type: '인증 에러', badge: 'bg-gray-500/20 text-gray-400', msg: 'Login Failed: Invalid password.' },
              { time: '09:16', type: '결제 에러', badge: 'bg-red-500/20 text-red-400', msg: 'Payment care reprocessed.' },
              { time: '08:05', type: 'DB 에러', badge: 'bg-red-500/20 text-red-400', msg: 'Operation implementation error.' }
            ].map(log => `
              <div class="flex items-center gap-4 py-2 border-b border-white/5">
                <span class="text-xs text-gray-500 w-12">${log.time}</span>
                <span class="text-xs px-2 py-0.5 rounded ${log.badge} font-medium">${log.type}</span>
                <span class="text-sm text-gray-300 flex-1">${log.msg}</span>
              </div>
            `).join('')}
          </div>
        </div>

        <!-- Error Rate Chart -->
        <div class="bg-dark-800 rounded-2xl p-6 border border-white/5">
          <div class="flex items-center justify-between mb-4">
            <h3 class="font-bold text-white">에러율 추이</h3>
            <span class="text-xs text-gray-400">최근 24시간</span>
          </div>
          <canvas id="errorChart" height="200"></canvas>
        </div>
      </div>

      <!-- Bottom Grid -->
      <div class="grid lg:grid-cols-2 gap-6">
        <!-- Job Queue Status -->
        <div class="bg-dark-800 rounded-2xl p-6 border border-white/5">
          <h3 class="font-bold text-white mb-4">작업 큐 상태</h3>
          <div class="space-y-4">
            ${[
              { label: '대기 중', count: 235, color: 'bg-yellow-500', pct: 16 },
              { label: '처리 중', count: 58, color: 'bg-blue-500', pct: 4 },
              { label: '완료', count: 1120, color: 'bg-green-500', pct: 80 }
            ].map(q => `
              <div>
                <div class="flex items-center justify-between mb-1">
                  <span class="text-sm text-gray-400">${q.label}</span>
                  <span class="text-lg font-bold text-white">${q.count.toLocaleString()}</span>
                </div>
                <div class="w-full bg-white/5 rounded-full h-3">
                  <div class="${q.color} h-3 rounded-full transition-all" style="width:${q.pct}%"></div>
                </div>
              </div>
            `).join('')}
          </div>
        </div>

        <!-- DLQ Status -->
        <div class="bg-dark-800 rounded-2xl p-6 border border-white/5">
          <h3 class="font-bold text-white mb-4">DLQ 상태</h3>
          <div class="grid grid-cols-2 gap-4">
            <div class="bg-dark-900 rounded-xl p-5 text-center">
              <div class="text-sm text-gray-400 mb-2">누적 실패</div>
              <div class="text-4xl font-bold text-red-400 mb-2">84</div>
              <div class="text-xs bg-red-500/20 text-red-400 px-3 py-1 rounded-full inline-block">감지중 12</div>
            </div>
            <div class="bg-dark-900 rounded-xl p-5 text-center">
              <div class="text-sm text-gray-400 mb-2">재시도 중</div>
              <div class="text-4xl font-bold text-yellow-400 mb-2">22</div>
              <div class="text-xs bg-red-500/20 text-red-400 px-3 py-1 rounded-full inline-block">실패 72</div>
            </div>
          </div>
        </div>
      </div>

      <!-- User Management Table -->
      <div class="bg-dark-800 rounded-2xl p-6 border border-white/5">
        <div class="flex items-center justify-between mb-4">
          <h3 class="font-bold text-white">사용자 관리</h3>
          <span class="text-xs text-gray-500">전체 사용자 목록</span>
        </div>
        <div class="overflow-x-auto">
          <table class="w-full text-sm">
            <thead>
              <tr class="text-left text-gray-500 border-b border-white/10">
                <th class="pb-3 px-4 font-medium">이름</th>
                <th class="pb-3 px-4 font-medium">이메일</th>
                <th class="pb-3 px-4 font-medium">역할</th>
                <th class="pb-3 px-4 font-medium">가입일</th>
              </tr>
            </thead>
            <tbody id="admin-users-table">
              <tr><td colspan="4" class="text-center py-6 text-gray-500">로딩 중...</td></tr>
            </tbody>
          </table>
        </div>
      </div>

      <!-- Crawler Status -->
      <div class="bg-dark-800 rounded-2xl p-6 border border-white/5">
        <div class="flex items-center justify-between mb-4">
          <h3 class="font-bold text-white"><i class="fas fa-spider mr-2 text-green-400"></i>크롤러 서버 상태</h3>
          <span class="text-xs text-gray-500" id="crawler-status-badge">확인 중...</span>
        </div>
        <div class="grid grid-cols-3 gap-4 mb-4" id="crawler-platforms">
          <div class="bg-dark-900 rounded-xl p-4 text-center">
            <div class="text-sm text-gray-400 mb-1">배달의민족</div>
            <div class="text-xs text-gray-500">세션 확인 중...</div>
          </div>
          <div class="bg-dark-900 rounded-xl p-4 text-center">
            <div class="text-sm text-gray-400 mb-1">쿠팡이츠</div>
            <div class="text-xs text-gray-500">세션 확인 중...</div>
          </div>
          <div class="bg-dark-900 rounded-xl p-4 text-center">
            <div class="text-sm text-gray-400 mb-1">요기요</div>
            <div class="text-xs text-gray-500">세션 확인 중...</div>
          </div>
        </div>
        <div class="flex gap-3">
          <button onclick="triggerCrawl()" class="text-xs bg-green-500/20 text-green-400 px-4 py-2 rounded-lg hover:bg-green-500/30 transition">
            <i class="fas fa-play mr-1"></i>전체 수집 실행
          </button>
          <button onclick="checkCrawler()" class="text-xs bg-blue-500/20 text-blue-400 px-4 py-2 rounded-lg hover:bg-blue-500/30 transition">
            <i class="fas fa-heartbeat mr-1"></i>상태 확인
          </button>
        </div>
      </div>
    </div>
  </main>

  <script>
    ensureAuthenticated('admin');

    // Load admin stats from API
    apiFetch('/api/v1/admin/stats').then(r=>r.json()).then(data => {
      const cards = document.querySelectorAll('.admin-kpi');
      if(cards.length >= 3) {
        cards[0].querySelector('.kpi-value').textContent = (data.total_users || 0).toLocaleString();
        cards[1].querySelector('.kpi-value').textContent = (data.active_subscriptions || 0).toLocaleString();
        cards[2].querySelector('.kpi-value').textContent = (data.error_rate || 0) + '%';
      }
    }).catch(e => {});

    // Load admin logs
    apiFetch('/api/v1/admin/logs').then(r=>r.json()).then(data => {
      const logs = data.logs || [];
      const container = document.getElementById('admin-logs');
      if(!container || !logs.length) return;
      container.innerHTML = logs.slice(0,8).map(log => {
        const time = new Date(log.created_at).toLocaleTimeString('ko-KR', {hour:'2-digit',minute:'2-digit'});
        const typeMap = { review_sync:'리뷰 수집', ai_generate:'AI 생성', reply_post:'답변 등록' };
        const type = typeMap[log.job_type] || log.job_type;
        const statusColor = log.status === 'completed' ? 'bg-green-500/20 text-green-400' : log.status === 'failed' ? 'bg-red-500/20 text-red-400' : log.status === 'dlq' ? 'bg-yellow-500/20 text-yellow-400' : 'bg-blue-500/20 text-blue-400';
        return '<div class="flex items-center gap-4 py-2 border-b border-white/5"><span class="text-xs text-gray-500 w-12">'+time+'</span><span class="text-xs px-2 py-0.5 rounded '+statusColor+' font-medium">'+type+'</span><span class="text-sm text-gray-300 flex-1">'+(log.error_message || log.status)+'</span>'+(log.status==='failed'||log.status==='dlq'?'<button onclick="retryJob('+log.id+')" class="text-xs bg-brand-500/20 text-brand-400 px-2 py-1 rounded hover:bg-brand-500/40"><i class="fas fa-redo"></i></button>':'')+'</div>';
      }).join('');
    }).catch(e => {});

    // Load users for admin
    apiFetch('/api/v1/admin/users').then(r=>r.json()).then(data => {
      const users = data.users || [];
      const container = document.getElementById('admin-users-table');
      if(!container) return;
      container.innerHTML = users.map(u => {
        const roleBadge = u.role === 'super_admin' ? '<span class="text-xs bg-red-500/20 text-red-400 px-2 py-0.5 rounded-full">슈퍼관리자</span>' : u.role === 'admin' ? '<span class="text-xs bg-yellow-500/20 text-yellow-400 px-2 py-0.5 rounded-full">관리자</span>' : '<span class="text-xs bg-blue-500/20 text-blue-400 px-2 py-0.5 rounded-full">사장님</span>';
        return '<tr class="border-b border-white/5 hover:bg-white/5"><td class="py-3 px-4 text-sm text-gray-300">'+u.name+'</td><td class="py-3 px-4 text-sm text-gray-400">'+u.email+'</td><td class="py-3 px-4">'+roleBadge+'</td><td class="py-3 px-4 text-xs text-gray-500">'+new Date(u.created_at).toLocaleDateString('ko-KR')+'</td></tr>';
      }).join('');
    }).catch(e => {});

    async function retryJob(id) {
      try {
        await apiFetch('/api/v1/admin/jobs/' + id + '/retry', { method: 'POST' });
        location.reload();
      } catch(e) { alert('재시도 실패'); }
    }

    // Crawler status check
    async function checkCrawler() {
      try {
        const res = await apiFetch('/api/v1/crawler/status');
        const data = await res.json();
        const badge = document.getElementById('crawler-status-badge');
        if (data.crawler_status === 'online') {
          badge.innerHTML = '<span class="text-green-400"><i class="fas fa-circle text-[8px] mr-1"></i>온라인</span>';
          // Update platform cards
          const platforms = document.getElementById('crawler-platforms');
          if (data.sessions) {
            const platformNames = { baemin: '배달의민족', coupang_eats: '쿠팡이츠', yogiyo: '요기요' };
            platforms.innerHTML = Object.entries(platformNames).map(([key, name]) => {
              const session = data.sessions?.[key];
              const status = session?.loggedIn ? '<span class="text-green-400 text-xs"><i class="fas fa-check-circle mr-1"></i>연결됨</span>' : '<span class="text-gray-500 text-xs"><i class="fas fa-minus-circle mr-1"></i>미연결</span>';
              return '<div class="bg-dark-900 rounded-xl p-4 text-center"><div class="text-sm text-gray-300 mb-2">' + name + '</div>' + status + '</div>';
            }).join('');
          }
        } else {
          badge.innerHTML = '<span class="text-red-400"><i class="fas fa-circle text-[8px] mr-1"></i>오프라인</span>';
        }
      } catch(e) {
        document.getElementById('crawler-status-badge').innerHTML = '<span class="text-red-400"><i class="fas fa-circle text-[8px] mr-1"></i>오프라인</span>';
      }
    }
    checkCrawler(); // Initial check

    async function triggerCrawl() {
      try {
        const res = await apiFetch('/api/v1/reviews/sync', {
          method: 'POST',
          body: JSON.stringify({ platform: 'baemin', demo: true })
        });
        const data = await res.json();
        if (data.success) {
          alert('리뷰 수집 완료: ' + (data.inserted || 0) + '건 추가');
        } else {
          alert(data?.error?.message || '수집 실패');
        }
      } catch(e) { alert('크롤러 서버가 실행 중이 아닙니다.'); }
    }

    // Error Rate Chart
    new Chart(document.getElementById('errorChart'), {
      type: 'line',
      data: {
        labels: ['12AM','3AM','6AM','9AM','12PM','3PM','6PM','9PM'],
        datasets: [{
          data: [2.1, 3.5, 5.2, 4.8, 3.2, 2.8, 3.8, 3.1],
          borderColor: '#EF4444',
          backgroundColor: 'rgba(239,68,68,0.15)',
          fill: true,
          tension: 0.4,
          pointRadius: 3,
          pointBackgroundColor: '#EF4444'
        }]
      },
      options: {
        responsive: true,
        plugins: { legend: { display: false } },
        scales: {
          y: { beginAtZero: true, max: 7, grid: { color: 'rgba(255,255,255,0.05)' }, ticks: { color: '#94A3B8', font: { size: 10 }, callback: v => v + '%' } },
          x: { grid: { display: false }, ticks: { color: '#94A3B8', font: { size: 10 } } }
        }
      }
    });
  </script>
</body>
</html>`
}

```

## FILE: src/routes/api.smoke.test.ts
```ts
import test from 'node:test'
import assert from 'node:assert/strict'
import { apiRoutes } from './api.ts'

const minimalEnv = {
  OPENAI_API_KEY: '',
  OPENAI_BASE_URL: '',
  JWT_SECRET: 'test-jwt-secret',
  CRAWLER_API_BASE: 'http://localhost:4000',
  CRAWLER_SHARED_SECRET: '',
  CREDENTIALS_ENCRYPTION_KEY: 'test-credentials-key',
  PORTONE_API_SECRET: '',
  PORTONE_STORE_ID: '',
  PORTONE_CHANNEL_KEY: '',
  PORTONE_WEBHOOK_SECRET: '',
  APP_BASE_URL: 'https://respondio.test'
} as any

test('protected reviews API rejects unauthenticated requests', async () => {
  const response = await apiRoutes.request('/reviews', undefined, minimalEnv)
  const body = await response.json()

  assert.equal(response.status, 401)
  assert.equal(body.error.code, 'auth_required')
})

test('login validates payload before hitting storage', async () => {
  const response = await apiRoutes.request('/auth/login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({})
  }, minimalEnv)
  const body = await response.json()

  assert.equal(response.status, 400)
  assert.equal(body.error.code, 'auth_invalid_payload')
})

test('refresh endpoint rejects missing refresh cookie', async () => {
  const response = await apiRoutes.request('/auth/refresh', { method: 'POST' }, minimalEnv)
  const body = await response.json()

  assert.equal(response.status, 401)
  assert.equal(body.error.code, 'refresh_token_missing')
})

test('portone webhook endpoint reports missing configuration without auth', async () => {
  const response = await apiRoutes.request('/webhooks/portone', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({})
  }, minimalEnv)
  const body = await response.json()

  assert.equal(response.status, 503)
  assert.equal(body.error.code, 'webhook_not_configured')
})

test('billing config endpoint requires auth', async () => {
  const response = await apiRoutes.request('/billing/config', undefined, minimalEnv)
  const body = await response.json()

  assert.equal(response.status, 401)
  assert.equal(body.error.code, 'auth_required')
})

```

## FILE: src/routes/api.ts
```ts
import { Hono } from 'hono'
import { deleteCookie, getCookie, setCookie } from 'hono/cookie'
import { PaymentClient, Webhook } from '@portone/server-sdk'
import { analyzeSentiment, batchAnalyzeSentiments, generateReply } from '../services/ai.ts'
import { generate_session_token, hash_password, hash_session_token, sign_access_token, verify_access_token, verify_password } from '../services/auth.ts'
import { decrypt_secret, encrypt_secret } from '../services/secrets.ts'

type Bindings = {
  DB: D1Database
  OPENAI_API_KEY: string
  OPENAI_BASE_URL: string
  JWT_SECRET: string
  CRAWLER_API_BASE: string
  CRAWLER_SHARED_SECRET: string
  CREDENTIALS_ENCRYPTION_KEY: string
  PORTONE_API_SECRET: string
  PORTONE_STORE_ID: string
  PORTONE_CHANNEL_KEY: string
  PORTONE_WEBHOOK_SECRET: string
  APP_BASE_URL: string
}

type AuthUser = {
  id: number
  email: string
  name: string
  role: string
  store_id: number | null
}

type Variables = {
  auth_user: AuthUser
}

type ReviewRecord = Record<string, unknown>

const supported_platforms = new Set(['baemin', 'coupang_eats', 'yogiyo'])
const allowed_statuses = new Set(['pending', 'generated', 'approved', 'posted', 'failed'])
const allowed_sentiments = new Set(['positive', 'neutral', 'negative'])
const access_token_ttl_seconds = 60 * 60 * 8
const refresh_token_ttl_days = 30
const refresh_cookie_name = 'respondio_refresh_token'
const subscription_cycle_days = 30

export const apiRoutes = new Hono<{ Bindings: Bindings; Variables: Variables }>()

function get_ai_config(c: any) {
  return {
    apiKey: c.env.OPENAI_API_KEY || '',
    baseUrl: c.env.OPENAI_BASE_URL || 'https://api.openai.com/v1'
  }
}

function get_jwt_secret(c: any) {
  return c.env.JWT_SECRET || 'respondio-local-jwt-secret'
}

function get_crawler_base(c: any) {
  return (c.env.CRAWLER_API_BASE || 'http://localhost:4000').replace(/\/$/, '')
}

function get_crawler_secret(c: any) {
  return c.env.CRAWLER_SHARED_SECRET || 'respondio-local-crawler-secret'
}

function get_credentials_encryption_key(c: any) {
  return c.env.CREDENTIALS_ENCRYPTION_KEY || ''
}

function get_app_base_url(c: any) {
  return (c.env.APP_BASE_URL || new URL(c.req.url).origin).replace(/\/$/, '')
}

function is_secure_request(c: any) {
  const forwarded_proto = c.req.header('x-forwarded-proto')
  return forwarded_proto === 'https' || c.req.url.startsWith('https://')
}

function get_crawler_headers(c: any, include_json = false) {
  return {
    ...(include_json ? { 'Content-Type': 'application/json' } : {}),
    ...(c.env.CRAWLER_SHARED_SECRET ? { 'X-Crawler-Secret': get_crawler_secret(c) } : {})
  }
}

function is_admin_role(role: string) {
  return role === 'admin' || role === 'super_admin'
}

function get_portone_public_config(c: any) {
  return {
    store_id: c.env.PORTONE_STORE_ID || '',
    channel_key: c.env.PORTONE_CHANNEL_KEY || ''
  }
}

function is_portone_client_configured(c: any) {
  const config = get_portone_public_config(c)
  return !!config.store_id && !!config.channel_key
}

function is_portone_server_configured(c: any) {
  return is_portone_client_configured(c) && !!c.env.PORTONE_API_SECRET
}

function get_portone_payment_client(c: any) {
  if (!c.env.PORTONE_API_SECRET) {
    throw new Error('PORTONE_API_SECRET is not configured')
  }

  return PaymentClient({ secret: c.env.PORTONE_API_SECRET })
}

function as_number(value: unknown) {
  const parsed = Number(value ?? 0)
  return Number.isFinite(parsed) ? parsed : 0
}

function json_error(c: any, status: number, code: string, message: string, retryable = false) {
  return c.json({
    error: {
      code,
      message,
      retryable
    }
  }, status)
}

function parse_menu_items(raw: unknown): string[] {
  if (!raw) return []
  if (Array.isArray(raw)) return raw.map((item) => String(item)).filter(Boolean)

  try {
    const parsed = JSON.parse(String(raw))
    if (Array.isArray(parsed)) {
      return parsed.map((item) => String(item)).filter(Boolean)
    }
  } catch {
    return String(raw)
      .split(',')
      .map((item) => item.trim())
      .filter(Boolean)
  }

  return []
}

async function read_json_body<T>(c: any): Promise<T> {
  return c.req.json().catch(() => ({} as T))
}

async function load_auth_user(db: D1Database, user_id: number): Promise<AuthUser | null> {
  const user = await db.prepare('SELECT id, email, name, role, status FROM users WHERE id = ?').bind(user_id).first<any>()
  if (!user || (user.status && user.status !== 'active')) return null

  const store = await db.prepare('SELECT id FROM stores WHERE user_id = ? ORDER BY id ASC LIMIT 1').bind(user_id).first<any>()

  return {
    id: as_number(user.id),
    email: String(user.email || ''),
    name: String(user.name || ''),
    role: String(user.role || 'owner'),
    store_id: store ? as_number(store.id) : null
  }
}

async function require_admin(c: any) {
  const auth_user = c.get('auth_user')
  if (!auth_user || !is_admin_role(auth_user.role)) {
    return json_error(c, 403, 'forbidden_admin_only', '관리자만 접근할 수 있습니다.')
  }

  return null
}

function resolve_store_id(auth_user: AuthUser, requested_store_id?: number | null) {
  if (requested_store_id && requested_store_id > 0 && is_admin_role(auth_user.role)) {
    return requested_store_id
  }

  return auth_user.store_id
}

async function load_store_scoped_review(db: D1Database, review_id: string, store_id: number | null) {
  let query = `
    SELECT r.*, s.store_name, s.reply_style, s.reply_tone_sample
    FROM reviews r
    JOIN stores s ON s.id = r.store_id
    WHERE r.id = ?
  `
  const params: unknown[] = [review_id]

  if (store_id) {
    query += ' AND r.store_id = ?'
    params.push(store_id)
  }

  return db.prepare(query).bind(...params).first<any>()
}

async function load_selected_candidate(db: D1Database, review_id: string) {
  return db.prepare('SELECT * FROM reply_candidates WHERE review_id = ? AND is_selected = 1 ORDER BY id DESC LIMIT 1').bind(review_id).first<any>()
}

async function load_store_settings(db: D1Database, store_id: number) {
  return db.prepare(
    'SELECT id, user_id, store_name, business_number_masked, reply_style, reply_tone_sample FROM stores WHERE id = ?'
  ).bind(store_id).first<any>()
}

async function load_platform_connection(db: D1Database, store_id: number, platform: string) {
  return db.prepare(
    `
      SELECT id, store_id, platform, connection_status, platform_store_id, last_sync_at, login_email,
             login_password_encrypted, last_error, created_at, updated_at
      FROM store_platform_connections
      WHERE store_id = ? AND platform = ?
    `
  ).bind(store_id, platform).first<any>()
}

function sanitize_platform_connection(connection: any) {
  if (!connection) return null

  return {
    id: as_number(connection.id),
    store_id: as_number(connection.store_id),
    platform: String(connection.platform || ''),
    connection_status: String(connection.connection_status || 'disconnected'),
    platform_store_id: connection.platform_store_id ? String(connection.platform_store_id) : null,
    login_email: connection.login_email ? String(connection.login_email) : null,
    has_credentials: !!connection.login_password_encrypted,
    last_sync_at: connection.last_sync_at || null,
    last_error: connection.last_error || null,
    created_at: connection.created_at || null,
    updated_at: connection.updated_at || null
  }
}

async function sync_platform_connection_record(
  db: D1Database,
  store_id: number,
  platform: string,
  payload: {
    connection_status: string
    platform_store_id?: string | null
    login_email?: string | null
    login_password_encrypted?: string | null
    last_error?: string | null
    touch_sync_time?: boolean
  }
) {
  const existing = await load_platform_connection(db, store_id, platform)
  const next_platform_store_id = Object.prototype.hasOwnProperty.call(payload, 'platform_store_id')
    ? payload.platform_store_id ?? null
    : existing?.platform_store_id ?? null
  const next_login_email = Object.prototype.hasOwnProperty.call(payload, 'login_email')
    ? payload.login_email ?? null
    : existing?.login_email ?? null
  const next_encrypted_password = Object.prototype.hasOwnProperty.call(payload, 'login_password_encrypted')
    ? payload.login_password_encrypted ?? null
    : existing?.login_password_encrypted ?? null

  if (existing) {
    await db.prepare(`
      UPDATE store_platform_connections
      SET connection_status = ?,
          platform_store_id = ?,
          login_email = ?,
          login_password_encrypted = ?,
          last_error = ?,
          last_sync_at = CASE WHEN ? THEN datetime('now') ELSE last_sync_at END,
          updated_at = datetime('now')
      WHERE id = ?
    `).bind(
      payload.connection_status,
      next_platform_store_id,
      next_login_email,
      next_encrypted_password,
      payload.last_error ?? null,
      payload.touch_sync_time ? 1 : 0,
      existing.id
    ).run()
  } else {
    await db.prepare(`
      INSERT INTO store_platform_connections (
        store_id, platform, connection_status, platform_store_id, login_email,
        login_password_encrypted, last_error, last_sync_at, updated_at
      )
      VALUES (?, ?, ?, ?, ?, ?, ?, CASE WHEN ? THEN datetime('now') ELSE NULL END, datetime('now'))
    `).bind(
      store_id,
      platform,
      payload.connection_status,
      next_platform_store_id,
      next_login_email,
      next_encrypted_password,
      payload.last_error ?? null,
      payload.touch_sync_time ? 1 : 0
    ).run()
  }

  return load_platform_connection(db, store_id, platform)
}

async function issue_access_token(c: any, auth_user: AuthUser) {
  return sign_access_token({
    user_id: auth_user.id,
    email: auth_user.email,
    role: auth_user.role,
    store_id: auth_user.store_id
  }, get_jwt_secret(c), access_token_ttl_seconds)
}

async function create_refresh_session(c: any, auth_user: AuthUser) {
  const session_token = generate_session_token()
  const token_hash = await hash_session_token(session_token)

  await c.env.DB.prepare(
    'INSERT INTO auth_sessions (user_id, token_hash, expires_at, user_agent, ip_address) VALUES (?, ?, datetime("now", ?), ?, ?)'
  ).bind(
    auth_user.id,
    token_hash,
    `+${refresh_token_ttl_days} days`,
    c.req.header('user-agent') || null,
    c.req.header('cf-connecting-ip') || null
  ).run()

  setCookie(c, refresh_cookie_name, session_token, {
    httpOnly: true,
    sameSite: 'Lax',
    secure: is_secure_request(c),
    path: '/',
    maxAge: refresh_token_ttl_days * 24 * 60 * 60
  })
}

async function revoke_refresh_session(db: D1Database, token_hash: string) {
  await db.prepare(
    'UPDATE auth_sessions SET revoked_at = datetime("now") WHERE token_hash = ? AND revoked_at IS NULL'
  ).bind(token_hash).run()
}

function clear_refresh_session_cookie(c: any) {
  deleteCookie(c, refresh_cookie_name, {
    path: '/',
    secure: is_secure_request(c),
    sameSite: 'Lax'
  })
}

async function login_platform_via_crawler(c: any, platform: string, credentials: { email: string; password: string }) {
  const response = await fetch(`${get_crawler_base(c)}/login`, {
    method: 'POST',
    headers: get_crawler_headers(c, true),
    body: JSON.stringify({
      platform,
      email: credentials.email,
      password: credentials.password
    })
  })

  const result = await response.json() as any
  return {
    success: response.ok && !!result.success,
    message: result.message || result.error || '플랫폼 로그인에 실패했습니다.'
  }
}

async function ensure_live_platform_session(c: any, store_id: number, platform: string) {
  const connection = await load_platform_connection(c.env.DB, store_id, platform)
  if (!connection?.login_email || !connection?.login_password_encrypted) {
    return { success: false, error: '플랫폼 계정이 연결되어 있지 않습니다.' }
  }

  const encryption_key = get_credentials_encryption_key(c)
  if (!encryption_key) {
    return { success: false, error: 'CREDENTIALS_ENCRYPTION_KEY가 설정되지 않았습니다.' }
  }

  try {
    const password = await decrypt_secret(String(connection.login_password_encrypted), encryption_key)
    const login_result = await login_platform_via_crawler(c, platform, {
      email: String(connection.login_email),
      password
    })

    const updated_connection = await sync_platform_connection_record(c.env.DB, store_id, platform, {
      connection_status: login_result.success ? 'connected' : 'error',
      last_error: login_result.success ? null : login_result.message,
      touch_sync_time: login_result.success
    })

    return {
      success: login_result.success,
      error: login_result.success ? null : login_result.message,
      connection: sanitize_platform_connection(updated_connection)
    }
  } catch (error: any) {
    const updated_connection = await sync_platform_connection_record(c.env.DB, store_id, platform, {
      connection_status: 'error',
      last_error: error.message
    })

    return {
      success: false,
      error: error.message,
      connection: sanitize_platform_connection(updated_connection)
    }
  }
}

async function upsert_reply_record(db: D1Database, review_id: string, candidate_id: number | null, reply_text: string) {
  const existing_reply = await db.prepare('SELECT id FROM replies WHERE review_id = ? ORDER BY id DESC LIMIT 1').bind(review_id).first<any>()

  if (existing_reply) {
    await db.prepare(
      'UPDATE replies SET candidate_id = ?, final_reply_text = ?, posted_at = NULL, post_status = ? WHERE id = ?'
    ).bind(candidate_id, reply_text, 'pending', existing_reply.id).run()
    return as_number(existing_reply.id)
  }

  const inserted = await db.prepare(
    'INSERT INTO replies (review_id, candidate_id, final_reply_text, post_status) VALUES (?, ?, ?, ?)'
  ).bind(review_id, candidate_id, reply_text, 'pending').run()

  return as_number(inserted.meta.last_row_id)
}

async function write_job_log(db: D1Database, job_type: string, status: string, payload: unknown, error_message?: string) {
  await db.prepare(
    'INSERT INTO job_logs (job_type, status, payload, error_message, created_at) VALUES (?, ?, ?, ?, datetime("now"))'
  ).bind(job_type, status, JSON.stringify(payload ?? {}), error_message || null).run()
}

async function post_reply_to_platform(c: any, review_id: string, store_id: number | null) {
  const db = c.env.DB as D1Database

  let query = `
    SELECT r.id, r.platform, r.platform_review_id, rep.id as reply_id, rep.final_reply_text
    FROM reviews r
    JOIN replies rep ON rep.review_id = r.id
    WHERE r.id = ?
  `
  const params: unknown[] = [review_id]

  if (store_id) {
    query += ' AND r.store_id = ?'
    params.push(store_id)
  }

  const record = await db.prepare(query).bind(...params).first<any>()
  if (!record) {
    return { success: false, error: '등록할 승인 답변이 없습니다.' }
  }

  if (!record.platform_review_id) {
    await db.prepare('UPDATE replies SET post_status = ? WHERE id = ?').bind('failed', record.reply_id).run()
    await write_job_log(db, 'reply_post', 'failed', { review_id }, 'platform_review_id missing')
    return { success: false, error: '플랫폼 리뷰 ID가 없어 등록할 수 없습니다.' }
  }

  try {
    const response = await fetch(`${get_crawler_base(c)}/post-reply`, {
      method: 'POST',
      headers: get_crawler_headers(c, true),
      body: JSON.stringify({
        platform: record.platform,
        review_id: record.platform_review_id,
        reply_text: record.final_reply_text
      })
    })

    const result = await response.json() as any
    if (!response.ok || !result.success) {
      await db.prepare('UPDATE replies SET post_status = ? WHERE id = ?').bind('failed', record.reply_id).run()
      await write_job_log(db, 'reply_post', 'failed', { review_id, platform: record.platform }, result.error || result.message || 'crawler post failed')
      return { success: false, error: result.error || result.message || '답변 등록에 실패했습니다.' }
    }

    await db.prepare('UPDATE replies SET post_status = ?, posted_at = datetime("now") WHERE id = ?').bind('posted', record.reply_id).run()
    await db.prepare('UPDATE reviews SET status = ? WHERE id = ?').bind('posted', review_id).run()
    await write_job_log(db, 'reply_post', 'completed', { review_id, platform: record.platform })

    return { success: true }
  } catch (error: any) {
    await db.prepare('UPDATE replies SET post_status = ? WHERE id = ?').bind('failed', record.reply_id).run()
    await write_job_log(db, 'reply_post', 'failed', { review_id, platform: record.platform }, error.message)
    return { success: false, error: error.message }
  }
}

async function ingest_reviews(db: D1Database, reviews: ReviewRecord[], store_id: number) {
  let inserted_count = 0
  let skipped_count = 0

  for (const review of reviews) {
    try {
      if (review.platform_review_id) {
        const existing = await db.prepare(
          'SELECT id FROM reviews WHERE platform_review_id = ? AND store_id = ?'
        ).bind(review.platform_review_id, store_id).first<any>()

        if (existing) {
          skipped_count += 1
          continue
        }
      }

      await db.prepare(`
        INSERT INTO reviews (
          store_id,
          platform,
          platform_review_id,
          customer_name,
          rating,
          review_text,
          menu_items,
          sentiment,
          status,
          customer_type,
          is_repeat_customer,
          created_at
        )
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'pending', ?, ?, datetime('now'))
      `).bind(
        store_id,
        String(review.platform || 'baemin'),
        review.platform_review_id ? String(review.platform_review_id) : null,
        String(review.customer_name || '고객'),
        Number(review.rating || 4),
        String(review.review_text || ''),
        JSON.stringify(parse_menu_items(review.menu_items)),
        review.sentiment ? String(review.sentiment) : null,
        String(review.customer_type || 'new'),
        as_number(review.is_repeat_customer || 0)
      ).run()

      inserted_count += 1

      if (review.customer_name) {
        const customer_key = `${review.platform || 'baemin'}-${review.customer_name}`
        const existing_customer = await db.prepare(
          'SELECT id, order_count FROM customers WHERE store_id = ? AND customer_key = ?'
        ).bind(store_id, customer_key).first<any>()

        if (existing_customer) {
          const new_count = as_number(existing_customer.order_count) + 1
          const customer_type = new_count >= 5 ? 'loyal' : new_count >= 2 ? 'repeat' : 'new'
          await db.prepare(
            'UPDATE customers SET order_count = ?, customer_type = ?, last_order_at = datetime("now") WHERE id = ?'
          ).bind(new_count, customer_type, existing_customer.id).run()
        } else {
          await db.prepare(
            'INSERT INTO customers (store_id, customer_key, customer_name, customer_type, order_count, last_order_at) VALUES (?, ?, ?, ?, 1, datetime("now"))'
          ).bind(store_id, customer_key, review.customer_name, 'new').run()
        }
      }
    } catch (error: any) {
      await write_job_log(db, 'review_sync', 'failed', { store_id, platform: review.platform }, error.message)
    }
  }

  await write_job_log(db, 'review_sync', 'completed', { store_id, inserted_count, skipped_count })

  return { inserted_count, skipped_count }
}

apiRoutes.use('*', async (c, next) => {
  const path = c.req.path

  if (
    path.endsWith('/auth/login') ||
    path.endsWith('/auth/signup') ||
    path.endsWith('/auth/refresh') ||
    path.endsWith('/auth/logout') ||
    path.endsWith('/webhooks/portone')
  ) {
    await next()
    return
  }

  if (path.endsWith('/crawler/reviews')) {
    const provided_secret = c.req.header('x-crawler-secret')
    if (!c.env.CRAWLER_SHARED_SECRET || provided_secret === get_crawler_secret(c)) {
      await next()
      return
    }

    return json_error(c, 401, 'crawler_unauthorized', '크롤러 인증에 실패했습니다.')
  }

  const authorization = c.req.header('Authorization') || ''
  const token = authorization.startsWith('Bearer ') ? authorization.slice(7) : ''
  if (!token) {
    return json_error(c, 401, 'auth_required', '로그인이 필요합니다.')
  }

  const payload = await verify_access_token(token, get_jwt_secret(c))
  if (!payload) {
    return json_error(c, 401, 'auth_invalid_token', '인증 토큰이 유효하지 않습니다.')
  }

  const auth_user = await load_auth_user(c.env.DB, payload.user_id)
  if (!auth_user) {
    return json_error(c, 401, 'auth_user_not_found', '사용자를 찾을 수 없습니다.')
  }

  c.set('auth_user', auth_user)
  await next()
})

// ============ AUTH ============
apiRoutes.post('/auth/login', async (c) => {
  const { email, password } = await read_json_body<{ email?: string; password?: string }>(c)
  if (!email || !password) {
    return json_error(c, 400, 'auth_invalid_payload', '이메일과 비밀번호를 입력해주세요.')
  }

  const user = await c.env.DB.prepare(
    'SELECT id, email, name, role, status, password_hash FROM users WHERE email = ?'
  ).bind(email).first<any>()

  if (!user || user.status === 'deleted') {
    return json_error(c, 401, 'auth_invalid_credentials', '이메일 또는 비밀번호가 올바르지 않습니다.')
  }

  const password_matches = await verify_password(String(email), String(password), String(user.password_hash || ''))
  if (!password_matches) {
    return json_error(c, 401, 'auth_invalid_credentials', '이메일 또는 비밀번호가 올바르지 않습니다.')
  }

  const auth_user = await load_auth_user(c.env.DB, as_number(user.id))
  if (!auth_user) {
    return json_error(c, 401, 'auth_user_not_found', '사용자를 찾을 수 없습니다.')
  }

  const access_token = await issue_access_token(c, auth_user)
  await create_refresh_session(c, auth_user)

  return c.json({
    access_token,
    expires_in: access_token_ttl_seconds,
    user: auth_user
  })
})

apiRoutes.post('/auth/signup', async (c) => {
  const { email, password, name, store_name } = await read_json_body<{
    email?: string
    password?: string
    name?: string
    store_name?: string
  }>(c)

  if (!email || !password || !name) {
    return json_error(c, 400, 'signup_invalid_payload', '이름, 이메일, 비밀번호를 모두 입력해주세요.')
  }

  if (password.length < 8) {
    return json_error(c, 400, 'signup_weak_password', '비밀번호는 8자 이상이어야 합니다.')
  }

  const existing = await c.env.DB.prepare('SELECT id FROM users WHERE email = ?').bind(email).first<any>()
  if (existing) {
    return json_error(c, 409, 'signup_email_exists', '이미 가입된 이메일입니다.')
  }

  const password_hash = await hash_password(password)
  const inserted_user = await c.env.DB.prepare(
    'INSERT INTO users (email, password_hash, name, role) VALUES (?, ?, ?, ?)'
  ).bind(email, password_hash, name, 'owner').run()

  const user_id = as_number(inserted_user.meta.last_row_id)
  const inserted_store = await c.env.DB.prepare(
    'INSERT INTO stores (user_id, store_name, reply_style) VALUES (?, ?, ?)'
  ).bind(user_id, store_name || `${name}님의 매장`, 'friendly').run()

  const store_id = as_number(inserted_store.meta.last_row_id)
  const auth_user = await load_auth_user(c.env.DB, user_id)
  if (!auth_user) {
    return json_error(c, 500, 'signup_store_create_failed', '회원가입 후 계정 정보를 불러오지 못했습니다.')
  }

  const access_token = await issue_access_token(c, auth_user)
  await create_refresh_session(c, auth_user)

  return c.json({
    success: true,
    access_token,
    expires_in: access_token_ttl_seconds,
    user: auth_user
  }, 201)
})

apiRoutes.post('/auth/refresh', async (c) => {
  const refresh_token = getCookie(c, refresh_cookie_name)
  if (!refresh_token) {
    clear_refresh_session_cookie(c)
    return json_error(c, 401, 'refresh_token_missing', '세션이 만료되었습니다.')
  }

  const token_hash = await hash_session_token(refresh_token)
  const session = await c.env.DB.prepare(
    'SELECT user_id FROM auth_sessions WHERE token_hash = ? AND revoked_at IS NULL AND expires_at > datetime("now")'
  ).bind(token_hash).first<any>()

  if (!session) {
    clear_refresh_session_cookie(c)
    return json_error(c, 401, 'refresh_token_invalid', '세션을 갱신할 수 없습니다.')
  }

  const auth_user = await load_auth_user(c.env.DB, as_number(session.user_id))
  if (!auth_user) {
    await revoke_refresh_session(c.env.DB, token_hash)
    clear_refresh_session_cookie(c)
    return json_error(c, 401, 'auth_user_not_found', '사용자를 찾을 수 없습니다.')
  }

  await create_refresh_session(c, auth_user)
  await revoke_refresh_session(c.env.DB, token_hash)

  return c.json({
    access_token: await issue_access_token(c, auth_user),
    expires_in: access_token_ttl_seconds,
    user: auth_user
  })
})

apiRoutes.post('/auth/logout', async (c) => {
  const refresh_token = getCookie(c, refresh_cookie_name)
  if (refresh_token) {
    const token_hash = await hash_session_token(refresh_token)
    await revoke_refresh_session(c.env.DB, token_hash)
  }

  clear_refresh_session_cookie(c)
  return c.json({ success: true })
})

apiRoutes.get('/auth/me', async (c) => {
  return c.json({ user: c.get('auth_user') })
})

// ============ REVIEWS ============
apiRoutes.get('/reviews', async (c) => {
  const auth_user = c.get('auth_user')
  const store_id = resolve_store_id(auth_user, as_number(c.req.query('store_id')) || null)
  if (!store_id) {
    return json_error(c, 400, 'store_not_found', '조회할 매장을 찾을 수 없습니다.')
  }

  const limit = Math.min(Math.max(as_number(c.req.query('limit') || 50), 1), 100)
  const status = c.req.query('status')
  const platform = c.req.query('platform')
  const sentiment = c.req.query('sentiment')

  if (status && !allowed_statuses.has(status)) {
    return json_error(c, 400, 'invalid_status', '허용되지 않은 상태값입니다.')
  }
  if (platform && !supported_platforms.has(platform)) {
    return json_error(c, 400, 'invalid_platform', '허용되지 않은 플랫폼입니다.')
  }
  if (sentiment && !allowed_sentiments.has(sentiment)) {
    return json_error(c, 400, 'invalid_sentiment', '허용되지 않은 감정값입니다.')
  }

  let query = `
    SELECT
      r.*,
      rc.reply_text as candidate_text,
      rc.quality_score,
      rep.final_reply_text as reply_text,
      rep.post_status
    FROM reviews r
    LEFT JOIN reply_candidates rc ON rc.review_id = r.id AND rc.is_selected = 1
    LEFT JOIN replies rep ON rep.review_id = r.id
    WHERE r.store_id = ?
  `
  const params: unknown[] = [store_id]

  if (status) {
    query += ' AND r.status = ?'
    params.push(status)
  }
  if (platform) {
    query += ' AND r.platform = ?'
    params.push(platform)
  }
  if (sentiment) {
    query += ' AND r.sentiment = ?'
    params.push(sentiment)
  }

  query += ' ORDER BY r.created_at DESC LIMIT ?'
  params.push(limit)

  const result = await c.env.DB.prepare(query).bind(...params).all()
  return c.json({ reviews: result.results })
})

apiRoutes.post('/reviews/:id/generate', async (c) => {
  const auth_user = c.get('auth_user')
  const store_id = resolve_store_id(auth_user, null)
  if (!store_id) {
    return json_error(c, 400, 'store_not_found', '매장을 찾을 수 없습니다.')
  }

  const review_id = c.req.param('id')
  const review = await load_store_scoped_review(c.env.DB, review_id, store_id)
  if (!review) {
    return json_error(c, 404, 'review_not_found', '리뷰를 찾을 수 없습니다.')
  }

  const existing_candidates = await c.env.DB.prepare(
    'SELECT COUNT(*) as count FROM reply_candidates WHERE review_id = ?'
  ).bind(review_id).first<any>()

  const current_count = as_number(existing_candidates?.count)
  if (current_count >= 3) {
    return json_error(c, 400, 'review_regen_limit_exceeded', '재생성 횟수를 초과했습니다.')
  }

  const banned_words_result = await c.env.DB.prepare('SELECT word FROM banned_words').all()
  const banned_words = banned_words_result.results.map((item: any) => String(item.word))
  const ai_config = get_ai_config(c)

  let sentiment = String(review.sentiment || '')
  if (!sentiment && ai_config.apiKey) {
    try {
      const analysis = await analyzeSentiment(ai_config, String(review.review_text || ''))
      sentiment = analysis.sentiment
      await c.env.DB.prepare('UPDATE reviews SET sentiment = ? WHERE id = ?').bind(sentiment, review_id).run()
    } catch {
      sentiment = 'neutral'
    }
  }

  let reply_text = ''
  let quality_score = 0
  let style_used = String(review.reply_style || 'friendly')

  if (ai_config.apiKey) {
    try {
      const generated = await generateReply(ai_config, {
        review_text: String(review.review_text || ''),
        rating: Number(review.rating || 0),
        customer_name: String(review.customer_name || '고객'),
        menu_items: parse_menu_items(review.menu_items),
        platform: String(review.platform || 'baemin'),
        customer_type: (String(review.customer_type || 'new') as 'new' | 'repeat' | 'loyal'),
        sentiment: sentiment || undefined,
        store_name: String(review.store_name || ''),
        reply_style: (String(review.reply_style || 'friendly') as any),
        reply_tone_sample: String(review.reply_tone_sample || ''),
        banned_words
      })

      reply_text = generated.reply_text
      quality_score = generated.quality_score
      style_used = generated.style_used
      sentiment = generated.sentiment
    } catch (error: any) {
      const fallback = get_template_fallback(sentiment || 'neutral', String(review.customer_name || '고객'))
      reply_text = fallback.text
      quality_score = fallback.score
      style_used = 'template_fallback'
      await write_job_log(c.env.DB, 'ai_generate', 'failed', { review_id }, error.message)
    }
  } else {
    const fallback = get_template_fallback(sentiment || 'neutral', String(review.customer_name || '고객'))
    reply_text = fallback.text
    quality_score = fallback.score
    style_used = 'template'
  }

  await c.env.DB.prepare('UPDATE reply_candidates SET is_selected = 0 WHERE review_id = ?').bind(review_id).run()
  await c.env.DB.prepare(
    'INSERT INTO reply_candidates (review_id, reply_text, style_type, quality_score, is_selected, regenerate_count) VALUES (?, ?, ?, ?, 1, ?)'
  ).bind(review_id, reply_text, style_used, quality_score, current_count + 1).run()
  await c.env.DB.prepare('UPDATE reviews SET status = ?, sentiment = ? WHERE id = ?').bind('generated', sentiment || null, review_id).run()
  await write_job_log(c.env.DB, 'ai_generate', 'completed', { review_id, quality_score, style_used })

  return c.json({
    reply_text,
    quality_score,
    sentiment,
    style_used,
    regeneration_count: current_count + 1,
    max_regenerations: 3,
    ai_powered: !!ai_config.apiKey
  })
})

apiRoutes.post('/reviews/:id/analyze', async (c) => {
  const auth_user = c.get('auth_user')
  const store_id = resolve_store_id(auth_user, null)
  const review_id = c.req.param('id')
  const review = await load_store_scoped_review(c.env.DB, review_id, store_id)

  if (!review) {
    return json_error(c, 404, 'review_not_found', '리뷰를 찾을 수 없습니다.')
  }

  const ai_config = get_ai_config(c)
  if (!ai_config.apiKey) {
    return json_error(c, 500, 'ai_not_configured', 'AI API 키가 설정되지 않았습니다.')
  }

  const result = await analyzeSentiment(ai_config, String(review.review_text || ''))
  await c.env.DB.prepare('UPDATE reviews SET sentiment = ? WHERE id = ?').bind(result.sentiment, review_id).run()

  return c.json({
    review_id,
    ...result
  })
})

apiRoutes.post('/reviews/batch-analyze', async (c) => {
  const auth_user = c.get('auth_user')
  const store_id = resolve_store_id(auth_user, null)
  if (!store_id) {
    return json_error(c, 400, 'store_not_found', '매장을 찾을 수 없습니다.')
  }

  const ai_config = get_ai_config(c)
  if (!ai_config.apiKey) {
    return json_error(c, 500, 'ai_not_configured', 'AI API 키가 설정되지 않았습니다.')
  }

  const pending = await c.env.DB.prepare(
    'SELECT id, review_text FROM reviews WHERE store_id = ? AND sentiment IS NULL LIMIT 20'
  ).bind(store_id).all()

  if (!pending.results.length) {
    return c.json({ analyzed_count: 0, results: [] })
  }

  const results = await batchAnalyzeSentiments(
    ai_config,
    pending.results.map((item: any) => ({ id: as_number(item.id), review_text: String(item.review_text || '') }))
  )

  for (const item of results) {
    await c.env.DB.prepare('UPDATE reviews SET sentiment = ? WHERE id = ?').bind(item.sentiment, item.id).run()
  }

  return c.json({ analyzed_count: results.length, results })
})

apiRoutes.post('/reviews/batch-generate', async (c) => {
  const auth_user = c.get('auth_user')
  const store_id = resolve_store_id(auth_user, null)
  if (!store_id) {
    return json_error(c, 400, 'store_not_found', '매장을 찾을 수 없습니다.')
  }

  const ai_config = get_ai_config(c)
  if (!ai_config.apiKey) {
    return json_error(c, 500, 'ai_not_configured', 'AI API 키가 설정되지 않았습니다.')
  }

  const pending_reviews = await c.env.DB.prepare(
    `
      SELECT r.*, s.store_name, s.reply_style, s.reply_tone_sample
      FROM reviews r
      JOIN stores s ON s.id = r.store_id
      WHERE r.store_id = ? AND r.status = 'pending'
      LIMIT 10
    `
  ).bind(store_id).all()

  const banned_words_result = await c.env.DB.prepare('SELECT word FROM banned_words').all()
  const banned_words = banned_words_result.results.map((item: any) => String(item.word))
  const generated: unknown[] = []

  for (const review of pending_reviews.results as any[]) {
    try {
      const result = await generateReply(ai_config, {
        review_text: String(review.review_text || ''),
        rating: Number(review.rating || 0),
        customer_name: String(review.customer_name || '고객'),
        menu_items: parse_menu_items(review.menu_items),
        platform: String(review.platform || 'baemin'),
        customer_type: (String(review.customer_type || 'new') as 'new' | 'repeat' | 'loyal'),
        sentiment: review.sentiment ? String(review.sentiment) : undefined,
        store_name: String(review.store_name || ''),
        reply_style: (String(review.reply_style || 'friendly') as any),
        reply_tone_sample: String(review.reply_tone_sample || ''),
        banned_words
      })

      await c.env.DB.prepare('UPDATE reply_candidates SET is_selected = 0 WHERE review_id = ?').bind(review.id).run()
      await c.env.DB.prepare(
        'INSERT INTO reply_candidates (review_id, reply_text, style_type, quality_score, is_selected, regenerate_count) VALUES (?, ?, ?, ?, 1, 1)'
      ).bind(review.id, result.reply_text, result.style_used, result.quality_score).run()
      await c.env.DB.prepare('UPDATE reviews SET status = ?, sentiment = ? WHERE id = ?')
        .bind('generated', result.sentiment, review.id).run()

      generated.push({
        review_id: review.id,
        reply_text: result.reply_text,
        quality_score: result.quality_score,
        sentiment: result.sentiment
      })
    } catch (error: any) {
      await write_job_log(c.env.DB, 'ai_generate', 'failed', { review_id: review.id }, error.message)
    }
  }

  return c.json({ generated_count: generated.length, generated })
})

apiRoutes.post('/reviews/approve', async (c) => {
  const auth_user = c.get('auth_user')
  const store_id = resolve_store_id(auth_user, null)
  if (!store_id) {
    return json_error(c, 400, 'store_not_found', '매장을 찾을 수 없습니다.')
  }

  const { review_ids, auto_post } = await read_json_body<{ review_ids?: Array<number | string>; auto_post?: boolean }>(c)
  if (!Array.isArray(review_ids) || review_ids.length === 0) {
    return json_error(c, 400, 'reviews_missing', '승인할 리뷰 ID 목록이 필요합니다.')
  }

  let approved_count = 0
  let posted_count = 0
  const failures: Array<{ review_id: number | string; message: string }> = []

  for (const review_id of review_ids) {
    const review = await load_store_scoped_review(c.env.DB, String(review_id), store_id)
    if (!review) {
      failures.push({ review_id, message: '리뷰를 찾을 수 없습니다.' })
      continue
    }

    const candidate = await load_selected_candidate(c.env.DB, String(review_id))
    if (!candidate) {
      failures.push({ review_id, message: '선택된 답변 후보가 없습니다.' })
      continue
    }

    await upsert_reply_record(c.env.DB, String(review_id), as_number(candidate.id), String(candidate.reply_text || ''))
    await c.env.DB.prepare('UPDATE reviews SET status = ? WHERE id = ?').bind('approved', review_id).run()
    approved_count += 1

    if (auto_post !== false) {
      const post_result = await post_reply_to_platform(c, String(review_id), store_id)
      if (post_result.success) {
        posted_count += 1
      } else {
        failures.push({ review_id, message: post_result.error })
      }
    }
  }

  return c.json({
    success: true,
    approved_count,
    posted_count,
    pending_post_count: Math.max(approved_count - posted_count, 0),
    failures
  })
})

apiRoutes.post('/reviews/:id/post', async (c) => {
  const auth_user = c.get('auth_user')
  const store_id = resolve_store_id(auth_user, null)
  if (!store_id) {
    return json_error(c, 400, 'store_not_found', '매장을 찾을 수 없습니다.')
  }

  const review_id = c.req.param('id')
  const review = await load_store_scoped_review(c.env.DB, review_id, store_id)
  if (!review) {
    return json_error(c, 404, 'review_not_found', '리뷰를 찾을 수 없습니다.')
  }

  const result = await post_reply_to_platform(c, review_id, store_id)
  if (!result.success) {
    return json_error(c, 502, 'reply_post_failed', result.error)
  }

  return c.json({ success: true, review_id })
})

apiRoutes.patch('/reviews/:id/reply', async (c) => {
  const auth_user = c.get('auth_user')
  const store_id = resolve_store_id(auth_user, null)
  const review_id = c.req.param('id')
  const { reply_text } = await read_json_body<{ reply_text?: string }>(c)

  if (!reply_text || !reply_text.trim()) {
    return json_error(c, 400, 'reply_empty', '수정할 답변 텍스트가 필요합니다.')
  }

  const review = await load_store_scoped_review(c.env.DB, review_id, store_id)
  if (!review) {
    return json_error(c, 404, 'review_not_found', '리뷰를 찾을 수 없습니다.')
  }

  await c.env.DB.prepare(
    'UPDATE reply_candidates SET reply_text = ? WHERE review_id = ? AND is_selected = 1'
  ).bind(reply_text.trim(), review_id).run()
  await c.env.DB.prepare(
    'UPDATE replies SET final_reply_text = ? WHERE review_id = ?'
  ).bind(reply_text.trim(), review_id).run()

  return c.json({ success: true, review_id })
})

// ============ DASHBOARD ============
apiRoutes.get('/dashboard/summary', async (c) => {
  const auth_user = c.get('auth_user')
  const store_id = resolve_store_id(auth_user, as_number(c.req.query('store_id')) || null)
  if (!store_id) {
    return json_error(c, 400, 'store_not_found', '매장을 찾을 수 없습니다.')
  }

  const total_reviews = await c.env.DB.prepare('SELECT COUNT(*) as count FROM reviews WHERE store_id = ?').bind(store_id).first<any>()
  const pending_reviews = await c.env.DB.prepare("SELECT COUNT(*) as count FROM reviews WHERE store_id = ? AND status = 'pending'").bind(store_id).first<any>()
  const avg_rating = await c.env.DB.prepare('SELECT AVG(rating) as avg FROM reviews WHERE store_id = ?').bind(store_id).first<any>()
  const positive_count = await c.env.DB.prepare("SELECT COUNT(*) as count FROM reviews WHERE store_id = ? AND sentiment = 'positive'").bind(store_id).first<any>()
  const negative_count = await c.env.DB.prepare("SELECT COUNT(*) as count FROM reviews WHERE store_id = ? AND sentiment = 'negative'").bind(store_id).first<any>()
  const approved_count = await c.env.DB.prepare("SELECT COUNT(*) as count FROM reviews WHERE store_id = ? AND status IN ('approved', 'posted')").bind(store_id).first<any>()
  const responded_count = await c.env.DB.prepare("SELECT COUNT(*) as count FROM reviews WHERE store_id = ? AND status IN ('generated', 'approved', 'posted')").bind(store_id).first<any>()
  const repeat_customers = await c.env.DB.prepare("SELECT COUNT(*) as count FROM customers WHERE store_id = ? AND customer_type IN ('repeat', 'loyal')").bind(store_id).first<any>()
  const total_customers = await c.env.DB.prepare('SELECT COUNT(*) as count FROM customers WHERE store_id = ?').bind(store_id).first<any>()
  const avg_quality = await c.env.DB.prepare(
    'SELECT AVG(quality_score) as avg FROM reply_candidates WHERE is_selected = 1 AND review_id IN (SELECT id FROM reviews WHERE store_id = ?)'
  ).bind(store_id).first<any>()

  const total_count = as_number(total_reviews?.count)
  const responded_total = Math.max(as_number(responded_count?.count), 1)
  const customer_total = Math.max(as_number(total_customers?.count), 1)

  return c.json({
    total_reviews: total_count,
    pending_reviews: as_number(pending_reviews?.count),
    avg_rating: Number(Number(avg_rating?.avg || 0).toFixed(1)),
    positive_ratio: total_count ? Math.round((as_number(positive_count?.count) / total_count) * 100) : 0,
    negative_ratio: total_count ? Math.round((as_number(negative_count?.count) / total_count) * 100) : 0,
    approval_rate: Math.round((as_number(approved_count?.count) / responded_total) * 100),
    repeat_customer_ratio: Math.round((as_number(repeat_customers?.count) / customer_total) * 100),
    ai_quality_score: avg_quality?.avg ? Number(Number(avg_quality.avg).toFixed(1)) : 0
  })
})

apiRoutes.get('/dashboard/menus', async (c) => {
  const auth_user = c.get('auth_user')
  const store_id = resolve_store_id(auth_user, as_number(c.req.query('store_id')) || null)
  if (!store_id) {
    return json_error(c, 400, 'store_not_found', '매장을 찾을 수 없습니다.')
  }

  const reviews = await c.env.DB.prepare(
    'SELECT menu_items, rating, sentiment FROM reviews WHERE store_id = ? AND menu_items IS NOT NULL'
  ).bind(store_id).all()

  const menu_stats: Record<string, { total: number; count: number; positive: number; negative: number }> = {}

  for (const review of reviews.results as any[]) {
    for (const menu of parse_menu_items(review.menu_items)) {
      if (!menu_stats[menu]) {
        menu_stats[menu] = { total: 0, count: 0, positive: 0, negative: 0 }
      }

      menu_stats[menu].total += Number(review.rating || 0)
      menu_stats[menu].count += 1
      if (review.sentiment === 'positive') menu_stats[menu].positive += 1
      if (review.sentiment === 'negative') menu_stats[menu].negative += 1
    }
  }

  const menus = Object.entries(menu_stats)
    .map(([name, stat]) => ({
      name,
      avg_rating: Number((stat.total / Math.max(stat.count, 1)).toFixed(1)),
      review_count: stat.count,
      positive_ratio: Math.round((stat.positive / Math.max(stat.count, 1)) * 100),
      negative_ratio: Math.round((stat.negative / Math.max(stat.count, 1)) * 100)
    }))
    .sort((left, right) => right.review_count - left.review_count)
    .slice(0, 10)

  return c.json({ menus })
})

apiRoutes.get('/dashboard/repeat_customers', async (c) => {
  const auth_user = c.get('auth_user')
  const store_id = resolve_store_id(auth_user, as_number(c.req.query('store_id')) || null)
  if (!store_id) {
    return json_error(c, 400, 'store_not_found', '매장을 찾을 수 없습니다.')
  }

  const customers = await c.env.DB.prepare(
    "SELECT * FROM customers WHERE store_id = ? AND customer_type IN ('repeat', 'loyal') ORDER BY order_count DESC LIMIT 10"
  ).bind(store_id).all()

  return c.json({ customers: customers.results })
})

apiRoutes.get('/dashboard/daily_trend', async (c) => {
  const auth_user = c.get('auth_user')
  const store_id = resolve_store_id(auth_user, as_number(c.req.query('store_id')) || null)
  if (!store_id) {
    return json_error(c, 400, 'store_not_found', '매장을 찾을 수 없습니다.')
  }

  const summaries = await c.env.DB.prepare(
    'SELECT * FROM dashboard_daily_summaries WHERE store_id = ? ORDER BY summary_date DESC LIMIT 7'
  ).bind(store_id).all()

  return c.json({ summaries: summaries.results })
})

// ============ BILLING ============
function format_order_name(plan_name: string) {
  return `Respondio ${plan_name} 구독`
}

async function load_plan_or_throw(db: D1Database, plan_id: number) {
  const plan = await db.prepare('SELECT * FROM plans WHERE id = ? AND is_active = 1').bind(plan_id).first<any>()
  if (!plan) {
    throw new Error('선택한 요금제를 찾을 수 없습니다.')
  }

  return plan
}

async function upsert_subscription_for_payment(db: D1Database, user_id: number, plan_id: number) {
  const existing_subscription = await db.prepare(
    "SELECT id FROM subscriptions WHERE user_id = ? AND status IN ('active', 'past_due', 'cancelled') ORDER BY id DESC LIMIT 1"
  ).bind(user_id).first<any>()

  if (existing_subscription) {
    await db.prepare(`
      UPDATE subscriptions
      SET plan_id = ?,
          status = 'active',
          cancel_at_period_end = 0,
          current_period_start = datetime('now'),
          current_period_end = datetime('now', ?),
          updated_at = datetime('now')
      WHERE id = ?
    `).bind(plan_id, `+${subscription_cycle_days} days`, existing_subscription.id).run()

    return as_number(existing_subscription.id)
  }

  const inserted = await db.prepare(`
    INSERT INTO subscriptions (
      user_id, plan_id, status, cancel_at_period_end, current_period_start, current_period_end, updated_at
    )
    VALUES (?, ?, 'active', 0, datetime('now'), datetime('now', ?), datetime('now'))
  `).bind(user_id, plan_id, `+${subscription_cycle_days} days`).run()

  return as_number(inserted.meta.last_row_id)
}

async function complete_portone_payment(
  c: any,
  auth_user: AuthUser,
  payment_id: string,
  expected_plan_id?: number | null
) {
  const pending_payment = await c.env.DB.prepare(
    `
      SELECT id, plan_id, amount, status
      FROM payments
      WHERE user_id = ? AND payment_id = ?
      ORDER BY id DESC
      LIMIT 1
    `
  ).bind(auth_user.id, payment_id).first<any>()

  if (!pending_payment) {
    throw new Error('결제 준비 정보가 없습니다. 다시 시도해주세요.')
  }

  const plan_id = expected_plan_id || as_number(pending_payment.plan_id)
  if (!plan_id) {
    throw new Error('결제할 요금제 정보가 없습니다.')
  }

  const plan = await load_plan_or_throw(c.env.DB, plan_id)
  const payment_client = get_portone_payment_client(c)
  const portone_payment = await payment_client.getPayment({ paymentId: payment_id }) as any

  const payment_status = String(portone_payment?.status || '')
  const paid_amount = as_number(portone_payment?.amount?.total)
  if (paid_amount !== as_number(plan.price)) {
    await c.env.DB.prepare(
      'UPDATE payments SET status = ?, raw_payload = ?, updated_at = datetime("now") WHERE id = ?'
    ).bind('failed', JSON.stringify(portone_payment), pending_payment.id).run()

    throw new Error('결제 금액 검증에 실패했습니다.')
  }

  if (payment_status !== 'PAID') {
    const mapped_status = payment_status === 'VIRTUAL_ACCOUNT_ISSUED' ? 'pending' : 'failed'
    await c.env.DB.prepare(
      'UPDATE payments SET status = ?, raw_payload = ?, updated_at = datetime("now") WHERE id = ?'
    ).bind(mapped_status, JSON.stringify(portone_payment), pending_payment.id).run()

    throw new Error(`결제 상태가 완료가 아닙니다: ${payment_status}`)
  }

  const subscription_id = await upsert_subscription_for_payment(c.env.DB, auth_user.id, plan_id)

  await c.env.DB.prepare(`
    UPDATE payments
    SET status = 'completed',
        provider = 'portone',
        subscription_id = ?,
        amount = ?,
        payment_method = ?,
        transaction_id = ?,
        raw_payload = ?,
        paid_at = datetime('now'),
        updated_at = datetime('now')
    WHERE id = ?
  `).bind(
    subscription_id,
    paid_amount,
    portone_payment?.method?.type || portone_payment?.method || 'CARD',
    payment_id,
    JSON.stringify(portone_payment),
    pending_payment.id
  ).run()

  return {
    payment_id,
    plan_id,
    plan_name: String(plan.name || ''),
    amount: paid_amount,
    subscription_id,
    payment_status
  }
}

apiRoutes.get('/billing/config', async (c) => {
  const config = get_portone_public_config(c)

  return c.json({
    payment_provider: 'portone',
    configured: is_portone_client_configured(c),
    store_id: config.store_id || null,
    channel_key: config.channel_key || null,
    app_base_url: get_app_base_url(c)
  })
})

apiRoutes.get('/plans', async (c) => {
  const plans = await c.env.DB.prepare('SELECT * FROM plans WHERE is_active = 1 ORDER BY price ASC').all()
  return c.json({ plans: plans.results })
})

apiRoutes.get('/subscriptions', async (c) => {
  const auth_user = c.get('auth_user')
  const subscription = await c.env.DB.prepare(`
    SELECT s.*, p.name as plan_name, p.price, p.review_limit
    FROM subscriptions s
    JOIN plans p ON p.id = s.plan_id
    WHERE s.user_id = ?
    ORDER BY s.id DESC
    LIMIT 1
  `).bind(auth_user.id).first()

  return c.json({ subscription })
})

apiRoutes.get('/payments', async (c) => {
  const auth_user = c.get('auth_user')
  const payments = await c.env.DB.prepare(
    'SELECT * FROM payments WHERE user_id = ? ORDER BY created_at DESC LIMIT 20'
  ).bind(auth_user.id).all()

  return c.json({ payments: payments.results })
})

apiRoutes.get('/payment_methods', async (c) => {
  const auth_user = c.get('auth_user')
  const payment_methods = await c.env.DB.prepare(
    'SELECT * FROM payment_methods WHERE user_id = ? ORDER BY is_default DESC, id DESC'
  ).bind(auth_user.id).all()

  return c.json({ payment_methods: payment_methods.results })
})

apiRoutes.post('/billing/checkout', async (c) => {
  const auth_user = c.get('auth_user')
  const { plan_id } = await read_json_body<{ plan_id?: number }>(c)
  const resolved_plan_id = as_number(plan_id)

  if (!resolved_plan_id) {
    return json_error(c, 400, 'plan_required', '결제할 요금제를 선택해주세요.')
  }

  if (!is_portone_client_configured(c)) {
    return json_error(c, 503, 'payment_not_configured', 'PortOne 결제 설정이 아직 완료되지 않았습니다.')
  }

  const plan = await load_plan_or_throw(c.env.DB, resolved_plan_id)
  const payment_id = `respondio-${auth_user.id}-${crypto.randomUUID()}`
  await c.env.DB.prepare(`
    INSERT INTO payments (
      user_id, amount, currency, status, payment_method, transaction_id, provider, plan_id, payment_id, updated_at
    )
    VALUES (?, ?, 'KRW', 'pending', 'CARD', ?, 'portone', ?, ?, datetime('now'))
  `).bind(
    auth_user.id,
    as_number(plan.price),
    payment_id,
    resolved_plan_id,
    payment_id
  ).run()

  const public_config = get_portone_public_config(c)
  return c.json({
    payment_provider: 'portone',
    store_id: public_config.store_id,
    channel_key: public_config.channel_key,
    payment_id,
    order_name: format_order_name(String(plan.name || '구독')),
    amount: as_number(plan.price),
    currency: 'KRW',
    pay_method: 'CARD',
    redirect_url: `${get_app_base_url(c)}/billing?paymentId=${encodeURIComponent(payment_id)}`
  })
})

apiRoutes.post('/billing/complete', async (c) => {
  const auth_user = c.get('auth_user')
  const { payment_id, plan_id } = await read_json_body<{ payment_id?: string; plan_id?: number }>(c)

  if (!payment_id) {
    return json_error(c, 400, 'payment_id_required', '검증할 paymentId가 필요합니다.')
  }

  if (!is_portone_server_configured(c)) {
    return json_error(c, 503, 'payment_not_configured', 'PortOne 서버 검증 설정이 아직 완료되지 않았습니다.')
  }

  try {
    const result = await complete_portone_payment(c, auth_user, payment_id, as_number(plan_id) || null)
    return c.json({ success: true, ...result })
  } catch (error: any) {
    return json_error(c, 400, 'payment_complete_failed', error.message)
  }
})

apiRoutes.post('/subscriptions/cancel', async (c) => {
  const auth_user = c.get('auth_user')
  const subscription = await c.env.DB.prepare(
    "SELECT id FROM subscriptions WHERE user_id = ? AND status = 'active' ORDER BY id DESC LIMIT 1"
  ).bind(auth_user.id).first<any>()

  if (!subscription) {
    return json_error(c, 404, 'subscription_not_found', '활성 구독을 찾을 수 없습니다.')
  }

  await c.env.DB.prepare(`
    UPDATE subscriptions
    SET cancel_at_period_end = 1,
        status = 'cancelled',
        updated_at = datetime('now')
    WHERE id = ?
  `).bind(subscription.id).run()

  return c.json({ success: true, subscription_id: as_number(subscription.id) })
})

apiRoutes.post('/webhooks/portone', async (c) => {
  if (!c.env.PORTONE_WEBHOOK_SECRET) {
    return json_error(c, 503, 'webhook_not_configured', 'PortOne webhook secret이 설정되지 않았습니다.')
  }

  const raw_body = await c.req.text()

  try {
    const webhook = await Webhook.verify(
      c.env.PORTONE_WEBHOOK_SECRET,
      raw_body,
      Object.fromEntries(c.req.raw.headers.entries())
    ) as any

    const event_id = String(webhook?.id || webhook?.paymentId || crypto.randomUUID())
    await c.env.DB.prepare(
      'INSERT OR IGNORE INTO payment_webhook_events (provider, event_id, event_type, payload) VALUES (?, ?, ?, ?)'
    ).bind(
      'portone',
      event_id,
      webhook?.type || 'unknown',
      raw_body
    ).run()

    if (webhook?.paymentId && is_portone_server_configured(c)) {
      const payment = await c.env.DB.prepare(
        'SELECT user_id FROM payments WHERE payment_id = ? ORDER BY id DESC LIMIT 1'
      ).bind(String(webhook.paymentId)).first<any>()

      if (payment?.user_id) {
        const auth_user = await load_auth_user(c.env.DB, as_number(payment.user_id))
        if (auth_user) {
          await complete_portone_payment(c, auth_user, String(webhook.paymentId))
        }
      }
    }

    return c.json({ success: true })
  } catch (error: any) {
    return json_error(c, 400, 'webhook_verification_failed', error.message)
  }
})

apiRoutes.get('/platform_connections', async (c) => {
  const auth_user = c.get('auth_user')
  const store_id = resolve_store_id(auth_user, as_number(c.req.query('store_id')) || null)
  if (!store_id) {
    return json_error(c, 400, 'store_not_found', '매장을 찾을 수 없습니다.')
  }

  const connections = await c.env.DB.prepare(
    `
      SELECT id, store_id, platform, connection_status, platform_store_id, last_sync_at,
             login_email, login_password_encrypted, last_error, created_at, updated_at
      FROM store_platform_connections
      WHERE store_id = ?
      ORDER BY id ASC
    `
  ).bind(store_id).all()

  return c.json({ connections: connections.results.map((connection: any) => sanitize_platform_connection(connection)) })
})

apiRoutes.get('/store/settings', async (c) => {
  const auth_user = c.get('auth_user')
  const store_id = resolve_store_id(auth_user, as_number(c.req.query('store_id')) || null)
  if (!store_id) {
    return json_error(c, 400, 'store_not_found', '매장을 찾을 수 없습니다.')
  }

  const store = await load_store_settings(c.env.DB, store_id)
  if (!store) {
    return json_error(c, 404, 'store_not_found', '매장을 찾을 수 없습니다.')
  }

  return c.json({ store })
})

apiRoutes.patch('/store/settings', async (c) => {
  const auth_user = c.get('auth_user')
  const store_id = resolve_store_id(auth_user, null)
  if (!store_id) {
    return json_error(c, 400, 'store_not_found', '매장을 찾을 수 없습니다.')
  }

  const { store_name, business_number_masked, reply_style, reply_tone_sample } = await read_json_body<{
    store_name?: string
    business_number_masked?: string
    reply_style?: string
    reply_tone_sample?: string
  }>(c)

  const allowed_reply_styles = new Set(['friendly', 'polite', 'casual', 'custom'])
  if (reply_style && !allowed_reply_styles.has(reply_style)) {
    return json_error(c, 400, 'invalid_reply_style', '허용되지 않은 답변 스타일입니다.')
  }

  await c.env.DB.prepare(`
    UPDATE stores
    SET store_name = COALESCE(?, store_name),
        business_number_masked = COALESCE(?, business_number_masked),
        reply_style = COALESCE(?, reply_style),
        reply_tone_sample = COALESCE(?, reply_tone_sample)
    WHERE id = ?
  `).bind(
    store_name?.trim() || null,
    business_number_masked?.trim() || null,
    reply_style || null,
    reply_tone_sample?.trim() || null,
    store_id
  ).run()

  const updated_store = await load_store_settings(c.env.DB, store_id)
  return c.json({ success: true, store: updated_store })
})

apiRoutes.post('/platform_connections/:platform/connect', async (c) => {
  const auth_user = c.get('auth_user')
  const store_id = resolve_store_id(auth_user, null)
  if (!store_id) {
    return json_error(c, 400, 'store_not_found', '매장을 찾을 수 없습니다.')
  }

  const platform = c.req.param('platform')
  if (!supported_platforms.has(platform)) {
    return json_error(c, 400, 'invalid_platform', '지원하지 않는 플랫폼입니다.')
  }

  const { login_email, login_password, platform_store_id } = await read_json_body<{
    login_email?: string
    login_password?: string
    platform_store_id?: string
  }>(c)

  if (!login_email || !login_password) {
    return json_error(c, 400, 'credentials_required', '플랫폼 로그인 이메일과 비밀번호가 필요합니다.')
  }

  const encryption_key = get_credentials_encryption_key(c)
  if (!encryption_key) {
    return json_error(c, 503, 'credentials_key_missing', 'CREDENTIALS_ENCRYPTION_KEY가 설정되지 않았습니다.')
  }

  try {
    const encrypted_password = await encrypt_secret(login_password, encryption_key)
    const login_result = await login_platform_via_crawler(c, platform, {
      email: login_email,
      password: login_password
    })

    const connection = await sync_platform_connection_record(c.env.DB, store_id, platform, {
      connection_status: login_result.success ? 'connected' : 'error',
      platform_store_id: platform_store_id?.trim() || null,
      login_email: login_email.trim(),
      login_password_encrypted: encrypted_password,
      last_error: login_result.success ? null : login_result.message,
      touch_sync_time: login_result.success
    })

    return c.json({
      success: login_result.success,
      connection: sanitize_platform_connection(connection),
      message: login_result.message
    }, login_result.success ? 200 : 400)
  } catch (error: any) {
    return json_error(c, 400, 'platform_connect_failed', error.message)
  }
})

apiRoutes.post('/platform_connections/:platform/disconnect', async (c) => {
  const auth_user = c.get('auth_user')
  const store_id = resolve_store_id(auth_user, null)
  if (!store_id) {
    return json_error(c, 400, 'store_not_found', '매장을 찾을 수 없습니다.')
  }

  const platform = c.req.param('platform')
  if (!supported_platforms.has(platform)) {
    return json_error(c, 400, 'invalid_platform', '지원하지 않는 플랫폼입니다.')
  }

  const connection = await sync_platform_connection_record(c.env.DB, store_id, platform, {
    connection_status: 'disconnected',
    login_email: null,
    login_password_encrypted: null,
    last_error: null
  })

  return c.json({ success: true, connection: sanitize_platform_connection(connection) })
})

// ============ ADMIN ============
apiRoutes.get('/admin/users', async (c) => {
  const forbidden = await require_admin(c)
  if (forbidden) return forbidden

  const users = await c.env.DB.prepare(
    'SELECT id, email, name, role, status, created_at FROM users ORDER BY created_at DESC'
  ).all()

  return c.json({ users: users.results })
})

apiRoutes.get('/admin/logs', async (c) => {
  const forbidden = await require_admin(c)
  if (forbidden) return forbidden

  const logs = await c.env.DB.prepare('SELECT * FROM job_logs ORDER BY created_at DESC LIMIT 100').all()
  return c.json({ logs: logs.results })
})

apiRoutes.get('/admin/stats', async (c) => {
  const forbidden = await require_admin(c)
  if (forbidden) return forbidden

  const total_users = await c.env.DB.prepare('SELECT COUNT(*) as count FROM users').first<any>()
  const active_subscriptions = await c.env.DB.prepare("SELECT COUNT(*) as count FROM subscriptions WHERE status = 'active'").first<any>()
  const failed_jobs = await c.env.DB.prepare("SELECT COUNT(*) as count FROM job_logs WHERE status = 'failed'").first<any>()
  const dlq_jobs = await c.env.DB.prepare("SELECT COUNT(*) as count FROM job_logs WHERE status = 'dlq'").first<any>()
  const processing_jobs = await c.env.DB.prepare("SELECT COUNT(*) as count FROM job_logs WHERE status = 'processing'").first<any>()
  const completed_jobs = await c.env.DB.prepare("SELECT COUNT(*) as count FROM job_logs WHERE status = 'completed'").first<any>()
  const total_job_count = Math.max(as_number(completed_jobs?.count) + as_number(failed_jobs?.count) + as_number(dlq_jobs?.count), 1)

  return c.json({
    total_users: as_number(total_users?.count),
    active_subscriptions: as_number(active_subscriptions?.count),
    failed_jobs: as_number(failed_jobs?.count),
    dlq_jobs: as_number(dlq_jobs?.count),
    processing_jobs: as_number(processing_jobs?.count),
    completed_jobs: as_number(completed_jobs?.count),
    error_rate: Number((((as_number(failed_jobs?.count) + as_number(dlq_jobs?.count)) / total_job_count) * 100).toFixed(1))
  })
})

apiRoutes.post('/admin/jobs/:id/retry', async (c) => {
  const forbidden = await require_admin(c)
  if (forbidden) return forbidden

  const job_id = c.req.param('id')
  await c.env.DB.prepare(
    "UPDATE job_logs SET status = 'pending', retry_count = retry_count + 1 WHERE id = ?"
  ).bind(job_id).run()

  return c.json({ success: true, job_id })
})

// ============ CRAWLER INTEGRATION ============
apiRoutes.post('/crawler/reviews', async (c) => {
  const { reviews, store_id } = await read_json_body<{ reviews?: ReviewRecord[]; store_id?: number }>(c)
  if (!Array.isArray(reviews) || !store_id) {
    return json_error(c, 400, 'crawler_payload_invalid', 'reviews 배열과 store_id가 필요합니다.')
  }

  const result = await ingest_reviews(c.env.DB, reviews, as_number(store_id))
  return c.json({
    success: true,
    inserted: result.inserted_count,
    skipped: result.skipped_count,
    total: reviews.length
  })
})

apiRoutes.get('/crawler/status', async (c) => {
  try {
    const response = await fetch(`${get_crawler_base(c)}/health`, {
      headers: get_crawler_headers(c)
    })
    const data = await response.json()
    return c.json({ crawler_status: response.ok ? 'online' : 'offline', ...data })
  } catch (error: any) {
    return c.json({ crawler_status: 'offline', message: error.message || '크롤러 서버에 연결할 수 없습니다.' })
  }
})

apiRoutes.post('/reviews/sync', async (c) => {
  const auth_user = c.get('auth_user')
  const body = await read_json_body<{ platform?: string; platforms?: string[]; demo?: boolean; store_id?: number }>(c)
  const store_id = resolve_store_id(auth_user, as_number(body.store_id) || null)
  if (!store_id) {
    return json_error(c, 400, 'store_not_found', '동기화할 매장을 찾을 수 없습니다.')
  }

  const requested_platforms = Array.isArray(body.platforms)
    ? body.platforms
    : body.platform
      ? [body.platform]
      : ['baemin']

  const platforms = requested_platforms.filter((platform) => supported_platforms.has(platform))
  if (!platforms.length) {
    return json_error(c, 400, 'invalid_platform', '지원하는 플랫폼을 선택해주세요.')
  }

  const demo = body.demo !== false
  const results: unknown[] = []
  let fetched = 0
  let inserted = 0
  let skipped = 0

  for (const platform of platforms) {
    try {
      if (!demo) {
        const login_result = await ensure_live_platform_session(c, store_id, platform)
        if (!login_result.success) {
          results.push({ platform, success: false, error: login_result.error || '플랫폼 세션 연결에 실패했습니다.' })
          continue
        }
      }

      const response = await fetch(`${get_crawler_base(c)}/fetch-reviews`, {
        method: 'POST',
        headers: get_crawler_headers(c, true),
        body: JSON.stringify({ platform, store_id, demo })
      })

      const crawl_result = await response.json() as any
      if (!response.ok || !crawl_result.success) {
        results.push({ platform, success: false, error: crawl_result.error || crawl_result.message || 'crawl failed' })
        continue
      }

      const ingest_result = await ingest_reviews(c.env.DB, (crawl_result.reviews || []) as ReviewRecord[], store_id)
      fetched += as_number(crawl_result.count)
      inserted += ingest_result.inserted_count
      skipped += ingest_result.skipped_count
      results.push({
        platform,
        success: true,
        fetched: as_number(crawl_result.count),
        inserted: ingest_result.inserted_count,
        skipped: ingest_result.skipped_count,
        mode: crawl_result.mode || (demo ? 'demo' : 'live')
      })
    } catch (error: any) {
      results.push({ platform, success: false, error: error.message })
    }
  }

  const has_failure = results.some((item: any) => item.success === false)
  return c.json({
    success: !has_failure,
    fetched,
    inserted,
    skipped,
    results
  })
})

apiRoutes.onError((error, c) => {
  console.error('API error:', error)
  return json_error(c, 500, 'internal_server_error', '서버 내부 오류가 발생했습니다.', true)
})

// ============ TEMPLATE FALLBACK ============
function get_template_fallback(sentiment: string, customer_name: string) {
  const templates: Record<string, { text: string; score: number }[]> = {
    positive: [
      { text: `${customer_name}님, 리뷰 남겨주셔서 감사합니다! 맛있게 드셨다니 정말 기쁘네요. 다음에도 맛있는 음식으로 보답하겠습니다 😊`, score: 7.5 },
      { text: `${customer_name}님 감사합니다! 만족하셨다니 보람차네요. 앞으로도 변함없는 맛으로 찾아뵙겠습니다!`, score: 7.3 }
    ],
    negative: [
      { text: `${customer_name}님, 불편을 드려 정말 죄송합니다. 말씀해주신 부분 꼭 개선하겠습니다. 다음엔 더 좋은 모습 보여드리겠습니다.`, score: 7.0 },
      { text: `${customer_name}님, 기대에 못 미쳐 죄송합니다. 소중한 의견 감사합니다. 더 나은 서비스를 위해 노력하겠습니다.`, score: 7.0 }
    ],
    neutral: [
      { text: `${customer_name}님, 리뷰 감사합니다! 더 나은 맛과 서비스로 찾아뵙겠습니다. 다음에도 찾아주세요!`, score: 7.2 }
    ]
  }

  const options = templates[sentiment] || templates.neutral
  return options[Math.floor(Math.random() * options.length)]
}

```

## FILE: src/services/ai.ts
```ts
/**
 * Respondio AI Service
 * - OpenAI GPT 기반 리뷰 자동 답변 생성
 * - 감정 분석
 * - 사장님 말투 학습
 * - 품질 점수 자동 산정
 */

interface AIConfig {
  apiKey: string
  baseUrl: string
}

interface ReviewContext {
  review_text: string
  rating: number
  customer_name: string
  menu_items: string[]
  platform: string
  customer_type: 'new' | 'repeat' | 'loyal'
  sentiment?: string
  store_name?: string
  reply_style?: 'friendly' | 'polite' | 'casual' | 'custom'
  reply_tone_sample?: string
  banned_words?: string[]
}

interface GenerateReplyResult {
  reply_text: string
  quality_score: number
  sentiment: string
  style_used: string
}

interface SentimentResult {
  sentiment: 'positive' | 'neutral' | 'negative'
  confidence: number
  keywords: string[]
  summary: string
}

// ============================================================
//  GPT API CALL
// ============================================================
async function callGPT(
  config: AIConfig,
  systemPrompt: string,
  userPrompt: string,
  temperature = 0.7,
  maxTokens = 1000
): Promise<string> {
  const response = await fetch(`${config.baseUrl}/chat/completions`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${config.apiKey}`
    },
    body: JSON.stringify({
      model: 'gpt-5-mini',
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userPrompt }
      ],
      temperature,
      max_completion_tokens: maxTokens
    })
  })

  if (!response.ok) {
    const errText = await response.text()
    throw new Error(`GPT API error: ${response.status} - ${errText}`)
  }

  const data = await response.json() as any
  return data.choices?.[0]?.message?.content?.trim() || ''
}

// ============================================================
//  REPLY GENERATION
// ============================================================
export async function generateReply(
  config: AIConfig,
  context: ReviewContext
): Promise<GenerateReplyResult> {
  const styleInstructions = getStyleInstructions(context.reply_style || 'friendly')
  const customerContext = getCustomerContext(context.customer_type, context.customer_name)
  const sentimentGuide = getSentimentGuide(context.sentiment || 'neutral')
  const bannedWordsNote = context.banned_words?.length
    ? `\n절대 사용하지 말아야 할 단어: ${context.banned_words.join(', ')}`
    : ''

  const toneSample = context.reply_tone_sample
    ? `\n\n[사장님 말투 참고 예시]\n${context.reply_tone_sample}\n위 예시의 말투, 어조, 문체를 최대한 자연스럽게 따라해주세요.`
    : ''

  const systemPrompt = `당신은 배달 음식점 사장님을 대신하여 고객 리뷰에 답변을 작성하는 전문 AI입니다.

[기본 규칙]
- 답변은 반드시 한국어로 작성
- 3줄 이내로 간결하게 (최대 150자)
- AI가 작성한 것처럼 느껴지지 않는 자연스러운 답변
- 고객 이름이 있으면 자연스럽게 언급
- 주문한 메뉴를 자연스럽게 언급
- 이모지는 1-2개만 적절히 사용
- 과도한 존댓말이나 형식적 표현 지양
- 실제 사장님이 직접 쓴 것 같은 느낌${bannedWordsNote}

[답변 스타일]
${styleInstructions}

[고객 유형 대응]
${customerContext}

[감정별 대응 가이드]
${sentimentGuide}
${toneSample}

[매장 정보]
- 매장명: ${context.store_name || '우리 매장'}
- 플랫폼: ${getPlatformName(context.platform)}`

  const userPrompt = `다음 리뷰에 대한 답변을 작성해주세요.

고객명: ${context.customer_name}
별점: ${context.rating}/5
주문 메뉴: ${context.menu_items.join(', ')}
리뷰 내용: "${context.review_text}"
고객 유형: ${context.customer_type === 'loyal' ? '단골 고객 (5회 이상 주문)' : context.customer_type === 'repeat' ? '재방문 고객 (2-4회 주문)' : '신규 고객'}

답변만 작성해주세요. 다른 설명 없이 답변 텍스트만 출력하세요.`

  const replyText = await callGPT(config, systemPrompt, userPrompt, 0.75, 1000)

  // 품질 점수 산정
  const qualityScore = await evaluateQuality(config, context, replyText)

  // 감정 분석 (아직 안 되어 있으면)
  let sentiment = context.sentiment || 'neutral'
  if (!context.sentiment) {
    const sentimentResult = await analyzeSentiment(config, context.review_text)
    sentiment = sentimentResult.sentiment
  }

  return {
    reply_text: replyText,
    quality_score: qualityScore,
    sentiment,
    style_used: context.reply_style || 'friendly'
  }
}

// ============================================================
//  SENTIMENT ANALYSIS
// ============================================================
export async function analyzeSentiment(
  config: AIConfig,
  reviewText: string
): Promise<SentimentResult> {
  const systemPrompt = `당신은 배달 음식점 리뷰의 감정을 분석하는 전문가입니다.
리뷰 텍스트를 분석하여 반드시 아래 JSON 형식으로만 응답하세요. 다른 텍스트 없이 JSON만 출력합니다.

{
  "sentiment": "positive" | "neutral" | "negative",
  "confidence": 0.0~1.0,
  "keywords": ["핵심키워드1", "핵심키워드2"],
  "summary": "한줄 요약"
}`

  const userPrompt = `다음 리뷰의 감정을 분석해주세요:\n"${reviewText}"`

  const response = await callGPT(config, systemPrompt, userPrompt, 0.3, 200)

  try {
    // JSON 부분만 추출
    const jsonMatch = response.match(/\{[\s\S]*\}/)
    if (jsonMatch) {
      const parsed = JSON.parse(jsonMatch[0])
      return {
        sentiment: parsed.sentiment || 'neutral',
        confidence: parsed.confidence || 0.5,
        keywords: parsed.keywords || [],
        summary: parsed.summary || ''
      }
    }
  } catch (e) {
    // 파싱 실패 시 기본값
  }

  // 간단한 키워드 기반 fallback
  const positiveWords = ['맛있', '좋', '최고', '만족', '감동', '추천', '빠르', '친절', '항상']
  const negativeWords = ['별로', '실망', '늦', '차갑', '식어', '비싸', '적어', '짜증', '최악', '다시는']

  const posCount = positiveWords.filter(w => reviewText.includes(w)).length
  const negCount = negativeWords.filter(w => reviewText.includes(w)).length

  return {
    sentiment: posCount > negCount ? 'positive' : negCount > posCount ? 'negative' : 'neutral',
    confidence: 0.6,
    keywords: [],
    summary: ''
  }
}

// ============================================================
//  QUALITY SCORE
// ============================================================
async function evaluateQuality(
  config: AIConfig,
  context: ReviewContext,
  replyText: string
): Promise<number> {
  const systemPrompt = `당신은 배달 음식점 리뷰 답변의 품질을 평가하는 전문가입니다.
다음 기준으로 1.0~10.0 사이의 점수를 매겨주세요.

평가 기준:
1. 자연스러움 (AI 느낌이 나지 않는가)
2. 고객 맞춤 (이름, 메뉴 등 구체적으로 언급하는가)
3. 감정 대응 (리뷰 감정에 적절히 대응하는가)
4. 길이 적절성 (너무 길거나 짧지 않은가)
5. 진정성 (형식적이지 않고 진심이 느껴지는가)

반드시 숫자만 응답하세요. 예: 8.5`

  const userPrompt = `원본 리뷰: "${context.review_text}"
별점: ${context.rating}/5
답변: "${replyText}"`

  const response = await callGPT(config, systemPrompt, userPrompt, 0.2, 10)

  const score = parseFloat(response)
  if (isNaN(score) || score < 1 || score > 10) {
    // fallback: 기본 점수 계산
    let baseScore = 7.5
    if (replyText.includes(context.customer_name)) baseScore += 0.5
    if (context.menu_items.some(m => replyText.includes(m))) baseScore += 0.5
    if (replyText.length > 30 && replyText.length < 200) baseScore += 0.3
    return Math.min(10, Math.round(baseScore * 10) / 10)
  }

  return Math.round(score * 10) / 10
}

// ============================================================
//  BATCH OPERATIONS
// ============================================================
export async function batchAnalyzeSentiments(
  config: AIConfig,
  reviews: Array<{ id: number; review_text: string }>
): Promise<Array<{ id: number; sentiment: string; confidence: number }>> {
  // 병렬로 최대 5개씩 처리
  const results: Array<{ id: number; sentiment: string; confidence: number }> = []
  const batchSize = 5

  for (let i = 0; i < reviews.length; i += batchSize) {
    const batch = reviews.slice(i, i + batchSize)
    const promises = batch.map(async (r) => {
      const result = await analyzeSentiment(config, r.review_text)
      return { id: r.id, sentiment: result.sentiment, confidence: result.confidence }
    })
    const batchResults = await Promise.all(promises)
    results.push(...batchResults)
  }

  return results
}

// ============================================================
//  HELPER FUNCTIONS
// ============================================================
function getStyleInstructions(style: string): string {
  switch (style) {
    case 'friendly':
      return `친근하고 따뜻한 톤. 반말은 쓰지 않지만 딱딱하지 않게. "~해요", "~드릴게요" 체. 이모지 적극 활용. 예: "감사해요! 다음에도 맛있게 만들어 드릴게요 😊"`
    case 'polite':
      return `정중하고 격식 있는 톤. "~합니다", "~드리겠습니다" 체. 이모지 최소화. 예: "소중한 리뷰 감사드립니다. 더 나은 서비스를 위해 노력하겠습니다."`
    case 'casual':
      return `편안하고 자연스러운 톤. 약간의 입말 느낌. "~요", "~네요" 체. 예: "오 감사해요! 다음에 또 오세요~"`
    case 'custom':
      return `사장님이 제공한 말투 샘플을 최대한 따라해주세요.`
    default:
      return `자연스럽고 따뜻한 톤으로 작성해주세요.`
  }
}

function getCustomerContext(customerType: string, name: string): string {
  switch (customerType) {
    case 'loyal':
      return `이 고객(${name})은 단골 고객입니다(5회 이상 주문). 감사의 마음을 특별히 표현하고, "항상", "매번" 같은 표현을 자연스럽게 사용하세요. 단골임을 인지하고 있다는 느낌을 주세요.`
    case 'repeat':
      return `이 고객(${name})은 재방문 고객입니다(2-4회 주문). "또 찾아주셔서", "다시 와주셔서" 같은 표현으로 재방문에 감사를 표하세요.`
    default:
      return `이 고객(${name})은 신규 고객입니다. 첫 주문에 감사하며, 다음에도 찾아주시길 바라는 마음을 담으세요.`
  }
}

function getSentimentGuide(sentiment: string): string {
  switch (sentiment) {
    case 'positive':
      return `긍정 리뷰입니다. 감사를 표하고, 칭찬받은 부분을 자연스럽게 언급하며, 다음에도 좋은 경험을 드리겠다는 약속을 하세요.`
    case 'negative':
      return `부정 리뷰입니다. [중요] 먼저 진심으로 사과하세요. 변명하지 말고 문제를 인정하세요. 구체적인 개선 의지를 보여주세요. 다음 기회를 요청하되 강요하지 마세요. 절대로 고객 탓을 하지 마세요.`
    case 'neutral':
      return `중립적 리뷰입니다. 리뷰에 감사하며, 좋았던 점은 살리고 아쉬웠던 점은 개선하겠다는 의지를 보여주세요.`
    default:
      return `리뷰에 맞는 적절한 톤으로 답변하세요.`
  }
}

function getPlatformName(platform: string): string {
  const names: Record<string, string> = {
    baemin: '배달의민족',
    coupang_eats: '쿠팡이츠',
    yogiyo: '요기요'
  }
  return names[platform] || platform
}

```

## FILE: src/services/auth.test.ts
```ts
import test from 'node:test'
import assert from 'node:assert/strict'
import {
  hash_password,
  sign_access_token,
  verify_access_token,
  verify_password
} from './auth.ts'

test('hash_password and verify_password round-trip', async () => {
  const password_hash = await hash_password('super-secret-password')

  assert.equal(await verify_password('owner@example.com', 'super-secret-password', password_hash), true)
  assert.equal(await verify_password('owner@example.com', 'wrong-password', password_hash), false)
})

test('verify_password keeps legacy demo credentials working', async () => {
  assert.equal(await verify_password('owner@test.com', 'password', 'hashed_password_123'), true)
  assert.equal(await verify_password('admin@respondio.com', 'admin123', 'hashed_admin_123'), true)
  assert.equal(await verify_password('owner@test.com', 'wrong', 'hashed_password_123'), false)
})

test('sign_access_token and verify_access_token validate signed tokens', async () => {
  const token = await sign_access_token({
    user_id: 1,
    email: 'owner@test.com',
    role: 'owner',
    store_id: 7
  }, 'test-secret', 60)

  const payload = await verify_access_token(token, 'test-secret')

  assert.ok(payload)
  assert.equal(payload?.user_id, 1)
  assert.equal(payload?.store_id, 7)
  assert.equal(payload?.email, 'owner@test.com')
})

test('verify_access_token rejects expired or tampered tokens', async () => {
  const expired_token = await sign_access_token({
    user_id: 1,
    email: 'owner@test.com',
    role: 'owner',
    store_id: 1
  }, 'test-secret', -1)

  assert.equal(await verify_access_token(expired_token, 'test-secret'), null)

  const valid_token = await sign_access_token({
    user_id: 1,
    email: 'owner@test.com',
    role: 'owner',
    store_id: 1
  }, 'test-secret', 60)

  const [header, payload, signature] = valid_token.split('.')
  const tampered_token = `${header}.${payload}.x${signature.slice(1)}`

  assert.equal(await verify_access_token(tampered_token, 'test-secret'), null)
})

```

## FILE: src/services/auth.ts
```ts
const textEncoder = new TextEncoder()
const textDecoder = new TextDecoder()

const password_prefix = 'pbkdf2_sha256'
const password_iterations = 100_000

export type AuthTokenPayload = {
  user_id: number
  email: string
  role: string
  store_id: number | null
  exp: number
}

function bytes_to_base64url(bytes: Uint8Array): string {
  let binary = ''
  for (const byte of bytes) {
    binary += String.fromCharCode(byte)
  }

  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '')
}

function base64url_to_bytes(value: string): Uint8Array {
  const normalized = value.replace(/-/g, '+').replace(/_/g, '/')
  const padded = normalized + '='.repeat((4 - (normalized.length % 4 || 4)) % 4)
  const binary = atob(padded)
  const bytes = new Uint8Array(binary.length)

  for (let i = 0; i < binary.length; i += 1) {
    bytes[i] = binary.charCodeAt(i)
  }

  return bytes
}

function secure_equals(left: Uint8Array, right: Uint8Array): boolean {
  if (left.length !== right.length) return false

  let diff = 0
  for (let i = 0; i < left.length; i += 1) {
    diff |= left[i] ^ right[i]
  }

  return diff === 0
}

async function import_signing_key(secret: string) {
  return crypto.subtle.importKey(
    'raw',
    textEncoder.encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign', 'verify']
  )
}

async function sign_payload(input: string, secret: string): Promise<string> {
  const key = await import_signing_key(secret)
  const signature = await crypto.subtle.sign('HMAC', key, textEncoder.encode(input))
  return bytes_to_base64url(new Uint8Array(signature))
}

async function sha256_bytes(input: string): Promise<Uint8Array> {
  const digest = await crypto.subtle.digest('SHA-256', textEncoder.encode(input))
  return new Uint8Array(digest)
}

async function derive_password_hash(password: string, salt: Uint8Array, iterations = password_iterations): Promise<Uint8Array> {
  const key = await crypto.subtle.importKey(
    'raw',
    textEncoder.encode(password),
    { name: 'PBKDF2' },
    false,
    ['deriveBits']
  )

  const derived = await crypto.subtle.deriveBits(
    {
      name: 'PBKDF2',
      hash: 'SHA-256',
      salt,
      iterations
    },
    key,
    256
  )

  return new Uint8Array(derived)
}

function demo_password_matches(email: string, password: string, stored_hash: string): boolean {
  if (stored_hash === `hashed_${password}`) return true

  const demo_credentials: Record<string, { password: string; legacy_hash: string }> = {
    'owner@test.com': { password: 'password', legacy_hash: 'hashed_password_123' },
    'admin@respondio.com': { password: 'admin123', legacy_hash: 'hashed_admin_123' }
  }

  const candidate = demo_credentials[email]
  return !!candidate && candidate.password === password && candidate.legacy_hash === stored_hash
}

export async function hash_password(password: string): Promise<string> {
  const salt = crypto.getRandomValues(new Uint8Array(16))
  const derived = await derive_password_hash(password, salt)
  return `${password_prefix}$${password_iterations}$${bytes_to_base64url(salt)}$${bytes_to_base64url(derived)}`
}

export async function verify_password(email: string, password: string, stored_hash: string): Promise<boolean> {
  if (!stored_hash) return false
  if (demo_password_matches(email, password, stored_hash)) return true

  const [prefix, iteration_text, salt_text, hash_text] = stored_hash.split('$')
  if (prefix !== password_prefix || !iteration_text || !salt_text || !hash_text) {
    return false
  }

  const iterations = Number(iteration_text)
  if (!Number.isFinite(iterations) || iterations <= 0) return false

  const salt = base64url_to_bytes(salt_text)
  const expected_hash = base64url_to_bytes(hash_text)
  const derived_hash = await derive_password_hash(password, salt, iterations)
  return secure_equals(derived_hash, expected_hash)
}

export async function sign_access_token(payload: Omit<AuthTokenPayload, 'exp'>, secret: string, expires_in_seconds = 60 * 60 * 8): Promise<string> {
  const header = { alg: 'HS256', typ: 'JWT' }
  const full_payload: AuthTokenPayload = {
    ...payload,
    exp: Math.floor(Date.now() / 1000) + expires_in_seconds
  }

  const encoded_header = bytes_to_base64url(textEncoder.encode(JSON.stringify(header)))
  const encoded_payload = bytes_to_base64url(textEncoder.encode(JSON.stringify(full_payload)))
  const signing_input = `${encoded_header}.${encoded_payload}`
  const signature = await sign_payload(signing_input, secret)

  return `${signing_input}.${signature}`
}

export async function verify_access_token(token: string, secret: string): Promise<AuthTokenPayload | null> {
  const [encoded_header, encoded_payload, signature] = token.split('.')
  if (!encoded_header || !encoded_payload || !signature) return null

  const signing_input = `${encoded_header}.${encoded_payload}`
  const expected_signature = await sign_payload(signing_input, secret)
  const expected_bytes = textEncoder.encode(expected_signature)
  const received_bytes = textEncoder.encode(signature)

  if (!secure_equals(expected_bytes, received_bytes)) {
    return null
  }

  try {
    const payload = JSON.parse(textDecoder.decode(base64url_to_bytes(encoded_payload))) as AuthTokenPayload
    if (!payload?.user_id || !payload?.email || !payload?.role || !payload?.exp) return null
    if (payload.exp <= Math.floor(Date.now() / 1000)) return null
    return payload
  } catch {
    return null
  }
}

export function generate_session_token(byte_length = 32): string {
  return bytes_to_base64url(crypto.getRandomValues(new Uint8Array(byte_length)))
}

export async function hash_session_token(token: string): Promise<string> {
  return bytes_to_base64url(await sha256_bytes(token))
}

```

## FILE: src/services/secrets.ts
```ts
const encoder = new TextEncoder()
const decoder = new TextDecoder()

function bytes_to_base64url(bytes: Uint8Array): string {
  let binary = ''
  for (const byte of bytes) {
    binary += String.fromCharCode(byte)
  }

  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '')
}

function base64url_to_bytes(value: string): Uint8Array {
  const normalized = value.replace(/-/g, '+').replace(/_/g, '/')
  const padded = normalized + '='.repeat((4 - (normalized.length % 4 || 4)) % 4)
  const binary = atob(padded)
  const bytes = new Uint8Array(binary.length)

  for (let i = 0; i < binary.length; i += 1) {
    bytes[i] = binary.charCodeAt(i)
  }

  return bytes
}

async function import_encryption_key(secret: string) {
  if (!secret) {
    throw new Error('CREDENTIALS_ENCRYPTION_KEY is not configured')
  }

  const digest = await crypto.subtle.digest('SHA-256', encoder.encode(secret))
  return crypto.subtle.importKey('raw', digest, { name: 'AES-GCM' }, false, ['encrypt', 'decrypt'])
}

export async function encrypt_secret(plaintext: string, secret: string): Promise<string> {
  const key = await import_encryption_key(secret)
  const iv = crypto.getRandomValues(new Uint8Array(12))
  const encrypted = await crypto.subtle.encrypt(
    { name: 'AES-GCM', iv },
    key,
    encoder.encode(plaintext)
  )

  return `${bytes_to_base64url(iv)}.${bytes_to_base64url(new Uint8Array(encrypted))}`
}

export async function decrypt_secret(payload: string, secret: string): Promise<string> {
  const [iv_text, data_text] = payload.split('.')
  if (!iv_text || !data_text) {
    throw new Error('Encrypted secret payload is invalid')
  }

  const key = await import_encryption_key(secret)
  const decrypted = await crypto.subtle.decrypt(
    { name: 'AES-GCM', iv: base64url_to_bytes(iv_text) },
    key,
    base64url_to_bytes(data_text)
  )

  return decoder.decode(decrypted)
}

```

## FILE: tsconfig.json
```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "ES2022",
    "moduleResolution": "bundler",
    "jsx": "react-jsx",
    "jsxImportSource": "hono/jsx",
    "strict": true,
    "skipLibCheck": true,
    "types": ["@cloudflare/workers-types"]
  },
  "include": ["src/**/*.ts", "src/**/*.tsx"],
  "exclude": ["node_modules"]
}

```

## FILE: vite.config.ts
```ts
import build from '@hono/vite-build/cloudflare-pages'
import devServer from '@hono/vite-dev-server'
import adapter from '@hono/vite-dev-server/cloudflare'
import { defineConfig } from 'vite'

export default defineConfig({
  plugins: [
    build(),
    devServer({
      adapter,
      entry: 'src/index.tsx'
    })
  ],
  build: {
    outDir: 'dist',
    copyPublicDir: true
  }
})

```

## FILE: wrangler.jsonc
```text
{
  "$schema": "node_modules/wrangler/config-schema.json",
  "name": "respondio",
  "compatibility_date": "2026-03-10",
  "pages_build_output_dir": "./dist",
  "compatibility_flags": ["nodejs_compat"],
  // Set via Cloudflare Pages environment variables or `wrangler secret put`:
  // OPENAI_API_KEY, JWT_SECRET, CRAWLER_SHARED_SECRET, CREDENTIALS_ENCRYPTION_KEY,
  // PORTONE_API_SECRET, PORTONE_WEBHOOK_SECRET
  // Also configure plain vars for OPENAI_BASE_URL, CRAWLER_API_BASE, APP_BASE_URL,
  // PORTONE_STORE_ID, PORTONE_CHANNEL_KEY per environment.
  "d1_databases": [
    {
      "binding": "DB",
      "database_name": "respondio-production",
      "database_id": "local-dev-placeholder",
      "preview_database_id": "local-preview-placeholder"
    }
  ]
}

```
