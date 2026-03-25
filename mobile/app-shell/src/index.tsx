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

type PageOptions = {
  billingEnabled: boolean
}

const app = new Hono<{ Bindings: Bindings }>()

app.use('/api/*', cors())

// API routes
app.route('/api/v1', apiRoutes)

function isBillingEnabled(env: Partial<Bindings>) {
  return !!(env.PORTONE_STORE_ID && env.PORTONE_CHANNEL_KEY && env.PORTONE_API_SECRET)
}

function getPageOptions(env: Partial<Bindings>): PageOptions {
  return {
    billingEnabled: isBillingEnabled(env)
  }
}

// ============ LANDING PAGE ============
app.get('/', (c) => {
  return c.html(landingPage(getPageOptions(c.env)))
})

// ============ USER PAGES ============
app.get('/login', (c) => c.html(loginPage('login')))
app.get('/signup', (c) => c.html(loginPage('signup')))
app.get('/dashboard', (c) => c.html(dashboardPage(getPageOptions(c.env))))
app.get('/reviews', (c) => c.html(reviewsPage(getPageOptions(c.env))))
app.get('/billing', (c) => c.html(billingPage(getPageOptions(c.env))))
app.get('/settings', (c) => c.html(settingsPage(getPageOptions(c.env))))
app.get('/customers', (c) => c.html(customersPage(getPageOptions(c.env))))
app.get('/mobile/session-center', (c) => c.html(mobileSessionCenterPage(c.req.query('app_shell') === '1')))
app.get('/mobile/app-shell', (c) => c.html(mobileAppShellPage()))

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

    function resolveSafeNextPath(candidate) {
      if (!candidate || typeof candidate !== 'string') {
        return null;
      }

      if (!candidate.startsWith('/')) {
        return null;
      }

      if (candidate.startsWith('//')) {
        return null;
      }

      return candidate;
    }

    function buildLoginRedirectUrl(nextPath) {
      const loginUrl = new URL('/login', window.location.origin);
      const safeNext = resolveSafeNextPath(nextPath);
      if (safeNext) {
        loginUrl.searchParams.set('next', safeNext);
      }
      return loginUrl.toString();
    }

    function ensureAuthenticated(requiredRole) {
      const session = getAuthSession();
      if (!session?.access_token || !session?.user) {
        const currentPath = window.location.pathname + window.location.search + window.location.hash;
        refreshAuthSession().then(function(restored) {
          if (restored) {
            window.location.reload();
            return;
          }

          if (window.location.pathname !== '/login') {
            window.location.href = buildLoginRedirectUrl(currentPath);
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
          const currentPath = window.location.pathname + window.location.search + window.location.hash;
          window.location.href = buildLoginRedirectUrl(currentPath);
        }
      }

      return response;
    }

    async function readJsonResponse(response) {
      const text = await response.text();
      if (!text) {
        return {
          error: {
            message: '서버가 빈 응답을 반환했습니다. CRAWLER_API_BASE 또는 터널 상태를 확인해주세요.'
          }
        };
      }

      try {
        return JSON.parse(text);
      } catch (error) {
        return {
          error: {
            message: '서버 응답을 해석하지 못했습니다: ' + text.slice(0, 180)
          }
        };
      }
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
function landingPage(options: PageOptions) {
  const heroBadge = options.billingEnabled ? 'AI 기반 리뷰 자동답변 SaaS' : '무료 베타 운영 중'
  const heroDescription = options.billingEnabled
    ? '배달 리뷰를 자동으로 목소리에 맞는 답변 작성,<br>시간을 아끼고 고객 만족을 챙기세요!'
    : '지금은 무료 베타로 핵심 자동화 기능을 먼저 검증하고 있습니다.<br>결제 없이 리뷰 수집과 AI 답변 흐름을 바로 써볼 수 있어요.'
  const heroChecks = options.billingEnabled
    ? ['신용카드 불필요', '14일 무료 체험', '즉시 시작']
    : ['무료 베타 운영', '플랫폼 연결부터 시작', '결제는 추후 오픈']
  const pricingMarkup = options.billingEnabled
    ? [
        { name: '베이직', price: '29,000', features: ['리뷰 응답 300건/월', '기본 분석 리포트', '1개 플랫폼 연결'], popular: false },
        { name: '프로', price: '59,000', features: ['리뷰 응답 800건/월', '고급 분석 대시보드', '3개 플랫폼 연결', '말투 학습 기능', '단골 고객 분석'], popular: true },
        { name: '프리미엄', price: '99,000', features: ['리뷰 응답 2,000건/월', '프리미엄 분석', '무제한 플랫폼', '우선 지원', 'API 연동'], popular: false }
      ].map((plan) => `
          <div class="relative bg-white rounded-2xl border-2 ${plan.popular ? 'border-brand-500 shadow-xl shadow-brand-500/10' : 'border-gray-100'} p-8 card-hover">
            ${plan.popular ? '<div class="absolute -top-4 left-1/2 -translate-x-1/2 bg-brand-500 text-white text-xs font-bold px-4 py-1 rounded-full">가장 인기</div>' : ''}
            <h3 class="text-xl font-bold text-gray-900 mb-2">${plan.name}</h3>
            <div class="mb-6">
              <span class="text-4xl font-extrabold text-gray-900">₩${plan.price}</span>
              <span class="text-gray-400">/월</span>
            </div>
            <ul class="space-y-3 mb-8">
              ${plan.features.map((feature) => `<li class="flex items-center gap-2 text-sm text-gray-600"><i class="fas fa-check text-brand-500 text-xs"></i>${feature}</li>`).join('')}
            </ul>
            <a href="/login" class="block text-center py-3 rounded-xl font-semibold transition ${plan.popular ? 'bg-brand-500 text-white hover:bg-brand-600 shadow-lg shadow-brand-500/30' : 'bg-gray-100 text-gray-700 hover:bg-gray-200'}">
              지금 시작하기
            </a>
          </div>
        `).join('')
    : [
        {
          title: '무료 베타',
          icon: 'fa-flask',
          tone: 'brand',
          body: '회원가입 후 바로 플랫폼 연결, 리뷰 동기화, AI 답변 생성까지 무료로 테스트할 수 있습니다.'
        },
        {
          title: '관리자 온보딩',
          icon: 'fa-handshake',
          tone: 'blue',
          body: '결제 없이 실제 매장 운영 흐름을 먼저 검증하고, 필요한 설정은 관리자 가이드로 맞춰갑니다.'
        },
        {
          title: '추후 유료 전환',
          icon: 'fa-credit-card',
          tone: 'green',
          body: 'PortOne 결제는 정식 출시 시점에 연결합니다. 지금은 핵심 기능 안정화와 베타 피드백 수집이 우선입니다.'
        }
      ].map((item) => `
          <div class="bg-white border border-gray-100 rounded-2xl p-8 card-hover">
            <div class="w-14 h-14 bg-${item.tone}-100 rounded-2xl flex items-center justify-center mb-5">
              <i class="fas ${item.icon} text-${item.tone === 'brand' ? 'brand' : item.tone}-500 text-xl"></i>
            </div>
            <h3 class="text-xl font-bold text-gray-900 mb-3">${item.title}</h3>
            <p class="text-sm text-gray-600 leading-relaxed mb-6">${item.body}</p>
            <a href="/login" class="inline-flex items-center gap-2 text-brand-600 font-semibold text-sm hover:text-brand-700">
              무료 베타 시작하기 <i class="fas fa-arrow-right text-xs"></i>
            </a>
          </div>
        `).join('')
  const faqPricing = options.billingEnabled
    ? { q: '무료 체험 기간이 있나요?', a: '네, 14일 무료 체험을 제공합니다. 신용카드 정보 없이 바로 시작하실 수 있어요.' }
    : { q: '지금 바로 결제해야 하나요?', a: '아니요. 현재는 무료 베타 운영 중이라 결제 없이 핵심 기능을 먼저 써볼 수 있습니다. 결제는 PortOne 연동이 준비된 뒤 정식 오픈할 예정입니다.' }
  const ctaSubcopy = options.billingEnabled
    ? '14일 무료 체험 · 신용카드 불필요 · 즉시 시작'
    : '무료 베타 운영 · 결제는 추후 오픈 · 즉시 테스트 가능'
  const primaryCta = options.billingEnabled ? '무료로 시작하기' : '무료 베타 시작하기'

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
        <a href="#pricing" class="hover:text-brand-500">${options.billingEnabled ? '요금제' : '베타 운영'}</a>
        <a href="#faq" class="hover:text-brand-500">FAQ</a>
      </div>
      <div class="flex items-center gap-3">
        <a href="/login" class="text-sm text-gray-600 hover:text-brand-500">로그인</a>
        <a href="/login" class="bg-brand-500 text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-brand-600 transition">${primaryCta}</a>
      </div>
    </div>
  </nav>

  <!-- Hero -->
  <section class="pt-28 pb-20 bg-gradient-to-br from-brand-50 via-white to-brand-50">
    <div class="max-w-7xl mx-auto px-6 grid md:grid-cols-2 gap-12 items-center">
      <div class="fade-in">
        <div class="inline-flex items-center gap-2 bg-brand-100 text-brand-700 px-3 py-1 rounded-full text-xs font-medium mb-6">
          <i class="fas fa-sparkles"></i> ${heroBadge}
        </div>
        <h1 class="text-4xl md:text-5xl font-extrabold text-gray-900 leading-tight mb-6">
          쉽고 빠르게<br><span class="text-brand-500">리뷰 관리!</span>
        </h1>
        <p class="text-lg text-gray-600 mb-8 leading-relaxed">
          ${heroDescription}
        </p>
        <div class="flex flex-wrap gap-4">
          <a href="/login" class="bg-brand-500 text-white px-8 py-3.5 rounded-xl font-semibold hover:bg-brand-600 transition shadow-lg shadow-brand-500/30">
            <i class="fas fa-rocket mr-2"></i>${primaryCta}
          </a>
          <a href="#workflow" class="border-2 border-gray-300 text-gray-700 px-8 py-3.5 rounded-xl font-semibold hover:border-brand-500 hover:text-brand-500 transition">
            데모 보기
          </a>
        </div>
        <div class="flex items-center gap-6 mt-8 text-sm text-gray-500">
          ${heroChecks.map((item) => `<span><i class="fas fa-check text-green-500 mr-1"></i>${item}</span>`).join('')}
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
        <h2 class="text-3xl font-bold text-gray-900 mb-4">${options.billingEnabled ? '요금제 안내' : '무료 베타 운영 안내'}</h2>
        <p class="text-gray-500">${options.billingEnabled ? '매장 규모에 맞는 플랜을 선택하세요' : '지금은 결제 없이 핵심 자동화 기능 검증에 집중하는 단계입니다'}</p>
      </div>
      <div class="grid md:grid-cols-3 gap-8 max-w-5xl mx-auto">
        ${pricingMarkup}
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
          faqPricing
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
      <p class="text-brand-100 mb-8 text-lg">${ctaSubcopy}</p>
      <div class="flex flex-wrap justify-center gap-4">
        <a href="/login" class="bg-white text-brand-600 px-8 py-3.5 rounded-xl font-bold hover:shadow-lg transition">${primaryCta} <i class="fas fa-arrow-right ml-2"></i></a>
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
function loginPage(initialTab: 'login' | 'signup' = 'login') {
  const isSignup = initialTab === 'signup'
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
        <button id="tab-login" onclick="switchTab('login')" class="flex-1 py-2.5 rounded-lg text-sm font-semibold ${isSignup ? 'text-gray-500' : 'bg-white shadow text-gray-900'}">로그인</button>
        <button id="tab-signup" onclick="switchTab('signup')" class="flex-1 py-2.5 rounded-lg text-sm font-semibold ${isSignup ? 'bg-white shadow text-gray-900' : 'text-gray-500'}">회원가입</button>
      </div>
      <form id="form-login" class="${isSignup ? 'hidden' : ''}" onsubmit="handleLogin(event)">
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
      <form id="form-signup" class="${isSignup ? '' : 'hidden'}" onsubmit="handleSignup(event)">
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
    const redirectTarget = resolveSafeNextPath(new URL(window.location.href).searchParams.get('next')) || null;

    const existingSession = getAuthSession();
    if (existingSession?.access_token && existingSession?.user) {
      window.location.href = redirectTarget || (isAdminUser(existingSession.user) ? '/admin' : '/dashboard');
    } else {
      refreshAuthSession().then(function(restored) {
        if (!restored) return;
        const restoredSession = getAuthSession();
        if (!restoredSession?.user) return;
        window.location.href = redirectTarget || (isAdminUser(restoredSession.user) ? '/admin' : '/dashboard');
      });
    }

    if (window.location.search.includes('demo=1')) {
      fillOwner();
    }

    if (window.location.pathname === '/signup') {
      switchTab('signup');
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
        window.location.href = redirectTarget || (isAdminUser(data.user) ? '/admin' : '/dashboard');
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
        window.location.href = redirectTarget || '/dashboard';
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
function userSidebar(active: string, billingEnabled: boolean) {
  const items = [
    { id: 'dashboard', icon: 'fa-chart-pie', label: '대시보드', href: '/dashboard' },
    { id: 'reviews', icon: 'fa-comments', label: '리뷰 관리', href: '/reviews' },
    { id: 'customers', icon: 'fa-users', label: '고객 분석', href: '/customers' },
    { id: 'billing', icon: billingEnabled ? 'fa-credit-card' : 'fa-flask', label: billingEnabled ? '구독/결제' : '베타 안내', href: '/billing' },
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
function dashboardPage(options: PageOptions) {
  return `${baseHead('대시보드')}
<body class="bg-gray-50 min-h-screen">
  ${userSidebar('dashboard', options.billingEnabled)}
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
function reviewsPage(options: PageOptions) {
  return `${baseHead('리뷰 관리')}
<body class="bg-gray-50 min-h-screen">
  ${userSidebar('reviews', options.billingEnabled)}
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
      const connectedPlatforms = getLiveReadyPlatforms();
      const hasLiveConnection = connectedPlatforms.length > 0;
      document.getElementById('sync-mode').value = hasLiveConnection ? 'live' : 'demo';
      updateSyncButtonLabel(connectedPlatforms);
    }).catch(() => {});

    function getLiveReadyPlatforms() {
      return platformConnections
        .filter(c => {
          if (c.auth_mode === 'direct_session') {
            return c.connection_status === 'connected' && c.session_status === 'connected';
          }

          return c.connection_status === 'connected' && c.has_credentials;
        })
        .map(c => c.platform);
    }

    function getPlatformLabel(platform) {
      const labels = {
        baemin: '배달의민족',
        coupang_eats: '쿠팡이츠',
        yogiyo: '요기요'
      };
      return labels[platform] || platform;
    }

    function updateSyncButtonLabel(connectedPlatforms) {
      const syncModeEl = document.getElementById('sync-mode');
      const btn = document.getElementById('btn-sync');
      if (!syncModeEl || !btn) return;

      const isLive = syncModeEl.value === 'live';
      if (!isLive) {
        btn.innerHTML = '<i class="fas fa-sync-alt mr-2"></i>리뷰 수집';
        return;
      }

      if (!connectedPlatforms.length) {
        btn.innerHTML = '<i class="fas fa-link-slash mr-2"></i>연결 필요';
        return;
      }

      btn.innerHTML = '<i class="fas fa-sync-alt mr-2"></i>' + connectedPlatforms.map(getPlatformLabel).join(', ') + ' 수집';
    }

    document.getElementById('sync-mode').addEventListener('change', function() {
      updateSyncButtonLabel(getLiveReadyPlatforms());
    });

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
      const livePlatforms = getLiveReadyPlatforms();
      const targetPlatforms = demo ? ['baemin', 'coupang_eats', 'yogiyo'] : livePlatforms;

      if (!demo && !targetPlatforms.length) {
        alert('실제 수집을 하려면 설정 화면에서 먼저 연결된 플랫폼이 1개 이상 있어야 합니다.');
        return;
      }

      btn.disabled = true;
      btn.innerHTML = '<i class="fas fa-spinner fa-spin mr-2"></i>수집 중...';
      try {
        let totalInserted = 0;
        let totalFailed = 0;
        const failures = [];

        for (const platform of targetPlatforms) {
          try {
            const res = await apiFetch('/api/v1/reviews/sync', {
              method: 'POST',
              body: JSON.stringify({ platform, demo })
            });
            const data = await res.json();
            if (data.inserted) totalInserted += data.inserted;
            if (!data.success) {
              totalFailed += 1;
              const errorMessage = Array.isArray(data.results) && data.results[0]?.error
                ? data.results[0].error
                : data?.error?.message || '수집 실패';
              failures.push(getPlatformLabel(platform) + ': ' + errorMessage);
            }
          } catch(e) { console.error(platform, e); }
        }
        if (totalInserted > 0) {
          const summary = demo
            ? totalInserted + '건의 새 리뷰가 수집되었습니다!'
            : totalInserted + '건의 새 리뷰가 수집되었습니다!\\n실행 플랫폼: ' + targetPlatforms.map(getPlatformLabel).join(', ');
          alert(summary);
          location.reload();
        } else if (!demo && totalFailed > 0) {
          alert('실제 수집에 실패한 플랫폼이 있습니다.\\n\\n' + failures.join('\\n\\n'));
        } else {
          alert('새로운 리뷰가 없거나 크롤러 서버가 실행 중이 아닙니다.\\n\\n크롤러 시작: pm2 start crawler/ecosystem.config.cjs');
        }
      } catch(e) { alert('리뷰 수집 실패: ' + e.message); }
      finally {
        btn.disabled = false;
        updateSyncButtonLabel(getLiveReadyPlatforms());
      }
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
function customersPage(options: PageOptions) {
  return `${baseHead('고객 분석')}
<body class="bg-gray-50 min-h-screen">
  ${userSidebar('customers', options.billingEnabled)}
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
function billingPage(options: PageOptions) {
  if (!options.billingEnabled) {
    return `${baseHead('무료 베타 운영')}
<body class="bg-gray-50 min-h-screen">
  ${userSidebar('billing', options.billingEnabled)}
  <main class="ml-[72px] p-6">
    <div id="billing-alert" class="mb-6 rounded-2xl border border-blue-200 bg-blue-50 px-5 py-4 text-sm text-blue-700">
      현재는 무료 베타 운영 중입니다. PortOne 결제는 아직 열지 않았고, 핵심 자동화 기능 검증에 집중하고 있습니다.
    </div>

    <div class="bg-white rounded-2xl p-6 border border-gray-100 mb-6">
      <h1 class="text-2xl font-bold text-gray-900 mb-3">무료 베타 운영 안내</h1>
      <p class="text-sm text-gray-600 leading-relaxed">
        지금은 리뷰 수집, AI 답변 생성, 승인 후 등록, 플랫폼 연결 기능을 먼저 안정화하는 단계입니다.
        결제와 구독 관리는 정식 출시 시점에 PortOne과 함께 다시 열립니다.
      </p>
    </div>

    <div class="grid lg:grid-cols-3 gap-6 mb-6">
      ${[
        {
          icon: 'fa-robot',
          title: '지금 바로 쓸 수 있는 기능',
          body: '리뷰 동기화, 감정 분석, AI 답변 생성, 승인 후 등록, 고객 분석을 바로 테스트할 수 있습니다.'
        },
        {
          icon: 'fa-list-check',
          title: '베타 시작 순서',
          body: '설정에서 플랫폼 계정을 연결하고, 리뷰 관리 화면에서 동기화 후 AI 답변 생성 흐름을 확인하면 됩니다.'
        },
        {
          icon: 'fa-credit-card',
          title: '결제는 나중에 추가',
          body: 'PortOne 값이 준비되면 셀프 결제와 구독 관리 화면이 그대로 다시 활성화됩니다.'
        }
      ].map((card) => `
        <div class="bg-white rounded-2xl border border-gray-100 p-6 card-hover">
          <div class="w-12 h-12 bg-brand-50 rounded-2xl flex items-center justify-center mb-4">
            <i class="fas ${card.icon} text-brand-500 text-lg"></i>
          </div>
          <h2 class="text-lg font-bold text-gray-900 mb-2">${card.title}</h2>
          <p class="text-sm text-gray-600 leading-relaxed">${card.body}</p>
        </div>
      `).join('')}
    </div>

    <div class="bg-white rounded-2xl p-6 border border-gray-100">
      <h2 class="text-lg font-bold text-gray-900 mb-4">다음으로 하면 좋은 일</h2>
      <div class="space-y-3 text-sm text-gray-600">
        <div class="flex items-start gap-3"><span class="w-6 h-6 rounded-full bg-brand-500 text-white flex items-center justify-center text-xs font-bold">1</span><span>설정 화면에서 배민, 쿠팡이츠, 요기요 계정을 연결합니다.</span></div>
        <div class="flex items-start gap-3"><span class="w-6 h-6 rounded-full bg-brand-500 text-white flex items-center justify-center text-xs font-bold">2</span><span>리뷰 관리 화면에서 실시간 동기화를 실행해 실제 리뷰를 가져옵니다.</span></div>
        <div class="flex items-start gap-3"><span class="w-6 h-6 rounded-full bg-brand-500 text-white flex items-center justify-center text-xs font-bold">3</span><span>AI 답변 생성과 승인 후 등록 흐름을 먼저 검증합니다.</span></div>
      </div>
      <div class="mt-6 flex flex-wrap gap-3">
        <a href="/settings" class="bg-brand-500 text-white px-5 py-3 rounded-xl text-sm font-semibold hover:bg-brand-600 transition">플랫폼 연결하러 가기</a>
        <a href="/reviews" class="border border-gray-200 text-gray-700 px-5 py-3 rounded-xl text-sm font-semibold hover:bg-gray-50 transition">리뷰 관리 열기</a>
      </div>
    </div>
  </main>
</body>
</html>`
  }

  return `${baseHead('구독 및 결제', '<script src="https://cdn.portone.io/v2/browser-sdk.js"></script>')}
<body class="bg-gray-50 min-h-screen">
  ${userSidebar('billing', options.billingEnabled)}
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
function settingsPage(options: PageOptions) {
  return `${baseHead('설정')}
<body class="bg-gray-50 min-h-screen">
  ${userSidebar('settings', options.billingEnabled)}
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
            <p class="text-sm text-gray-500 mt-1">새 방향은 사용자 직접 로그인 세션입니다. 모바일 앱/WebView 연결이 붙으면 직접 로그인 세션을 쓰고, 그 전까지는 레거시 자동 로그인도 함께 유지합니다.</p>
          </div>
          <div class="flex items-center gap-2">
            <a href="/mobile/app-shell" class="border border-brand-200 text-brand-600 px-4 py-2 rounded-xl text-sm hover:bg-brand-50 transition">
              모바일 앱 셸
            </a>
            <button onclick="loadConnections()" class="border border-gray-200 text-gray-600 px-4 py-2 rounded-xl text-sm hover:bg-gray-50 transition">
              상태 새로고침
            </button>
          </div>
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
      el.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }

    function setPlatformActionLoading(platform, action, isLoading) {
      const button = document.getElementById(platform + '-' + action + '-btn');
      if (!button) return;

      if (isLoading) {
        button.disabled = true;
        button.dataset.originalText = button.textContent || '';
        button.classList.add('opacity-70', 'cursor-not-allowed');
        button.innerHTML = '<i class="fas fa-spinner fa-spin mr-2"></i>' + (action === 'connect' ? '연결 중...' : '해제 중...');
        return;
      }

      button.disabled = false;
      button.classList.remove('opacity-70', 'cursor-not-allowed');
      button.textContent = button.dataset.originalText || (action === 'connect' ? '계정 연결' : '연결 해제');
    }

    function setReplyStyle(style) {
      const radio = document.querySelector('input[name="style"][value="' + style + '"]');
      if (radio) radio.checked = true;
    }

    function getConnectionModeLabel(connection) {
      return connection?.auth_mode === 'direct_session' ? '직접 로그인 세션' : '자동 로그인(레거시)';
    }

    function getSessionStatusLabel(connection) {
      const status = connection?.session_status || 'inactive';
      if (status === 'connected') return '<span class="text-xs bg-green-100 text-green-700 px-2 py-1 rounded-full">세션 활성</span>';
      if (status === 'pending') return '<span class="text-xs bg-yellow-100 text-yellow-700 px-2 py-1 rounded-full">세션 대기</span>';
      if (status === 'error') return '<span class="text-xs bg-red-100 text-red-700 px-2 py-1 rounded-full">세션 오류</span>';
      if (status === 'expired') return '<span class="text-xs bg-orange-100 text-orange-700 px-2 py-1 rounded-full">세션 만료</span>';
      return '<span class="text-xs bg-gray-100 text-gray-700 px-2 py-1 rounded-full">세션 없음</span>';
    }

    async function loadStoreSettings() {
      const response = await apiFetch('/api/v1/store/settings');
      const data = await readJsonResponse(response);
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
        const directSessionMode = connection.auth_mode === 'direct_session';
        const modeControls = '<div class="flex flex-wrap items-center gap-2 mt-2">'
          + '<button onclick="setAuthMode(\\'' + platform + '\\', \\'direct_session\\')" class="' + (directSessionMode ? 'bg-brand-500 text-white border-brand-500 ' : 'bg-white text-gray-600 border-gray-200 ') + 'border px-3 py-1.5 rounded-lg text-xs font-semibold transition">직접 로그인 세션</button>'
          + '<button onclick="setAuthMode(\\'' + platform + '\\', \\'credentials\\')" class="' + (!directSessionMode ? 'bg-brand-50 text-brand-600 border-brand-200 ' : 'bg-white text-gray-600 border-gray-200 ') + 'border px-3 py-1.5 rounded-lg text-xs font-semibold transition">자동 로그인(레거시)</button>'
          + '</div>';
        const bodyFields = directSessionMode
          ? '<div class="rounded-2xl border border-blue-100 bg-blue-50 p-4 text-sm text-blue-800 mb-4">'
            + '<div class="font-semibold mb-1">모바일 직접 로그인 세션 모드</div>'
            + '<div>최종 목표는 사용자가 모바일 앱/WebView에서 직접 로그인하고, 로그인한 동안만 세션을 유지하는 구조입니다.</div>'
            + '<div class="mt-2 text-blue-700">현재 웹앱 토대는 준비 중이며, 연결 완료 처리는 모바일 앱/WebView 연동 단계에서 붙습니다.</div>'
            + '</div>'
          : '<div class="grid md:grid-cols-3 gap-3 mb-4">'
            + '<input id="' + platform + '-email" type="email" value="' + (connection.login_email || '') + '" placeholder="로그인 이메일" class="px-4 py-3 border border-gray-200 rounded-xl focus:ring-2 focus:ring-brand-500 outline-none">'
            + '<input id="' + platform + '-password" type="password" placeholder="' + (connection.has_credentials ? '비밀번호 재입력 필요' : '로그인 비밀번호') + '" class="px-4 py-3 border border-gray-200 rounded-xl focus:ring-2 focus:ring-brand-500 outline-none">'
            + '<input id="' + platform + '-store-id" type="text" value="' + (connection.platform_store_id || '') + '" placeholder="플랫폼 매장 ID (선택)" class="px-4 py-3 border border-gray-200 rounded-xl focus:ring-2 focus:ring-brand-500 outline-none">'
            + '</div>';
        return '<div class="border border-gray-200 rounded-2xl p-5">'
          + '<div class="flex items-center justify-between mb-4"><div class="flex items-center gap-3">'
          + '<div class="w-10 h-10 rounded-full text-white text-xs font-bold flex items-center justify-center" style="background:' + meta.color + '">' + meta.label.slice(0, 2) + '</div>'
          + '<div><div class="font-semibold text-gray-900">' + meta.label + '</div><div class="text-xs text-gray-400">' + (connection.last_error || '운영 계정 연결 후 실제 수집 가능') + '</div>' + modeControls + '</div></div>'
          + '<div class="flex items-center gap-2">' + statusBadge + getSessionStatusLabel(connection) + '</div></div>'
          + '<div class="mb-4 flex flex-wrap items-center gap-2 text-xs text-gray-500">'
          + '<span class="bg-gray-100 text-gray-700 px-2 py-1 rounded-full">연결 방식: ' + getConnectionModeLabel(connection) + '</span>'
          + '<span class="bg-gray-100 text-gray-700 px-2 py-1 rounded-full">최근 세션 확인: ' + (connection.session_last_validated_at ? new Date(connection.session_last_validated_at).toLocaleString('ko-KR') : '-') + '</span>'
          + '</div>'
          + bodyFields
          + '<div class="flex flex-wrap items-center gap-3">'
          + '<button id="' + platform + '-connect-btn" onclick="connectPlatform(\\'' + platform + '\\')" class="bg-brand-500 text-white px-4 py-2.5 rounded-xl text-sm font-semibold hover:bg-brand-600 transition">' + (directSessionMode ? '직접 로그인 준비' : '계정 연결') + '</button>'
          + '<button id="' + platform + '-disconnect-btn" onclick="disconnectPlatform(\\'' + platform + '\\')" class="border border-gray-200 text-gray-600 px-4 py-2.5 rounded-xl text-sm font-medium hover:bg-gray-50 transition">연결 해제</button>'
          + '<span class="text-xs text-gray-400">마지막 동기화: ' + (connection.last_sync_at ? new Date(connection.last_sync_at).toLocaleString('ko-KR') : '-') + '</span>'
          + '</div></div>';
      }).join('');
    }

    async function loadConnections() {
      const response = await apiFetch('/api/v1/platform_connections');
      const data = await readJsonResponse(response);
      if (!response.ok || data.error) {
        throw new Error(data?.error?.message || '플랫폼 연결 상태를 불러오지 못했습니다.');
      }

      platformConnections = data.connections || [];
      renderConnections(platformConnections);
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
        const data = await readJsonResponse(response);
        if (!response.ok || data.error) {
          showSettingsAlert(data?.error?.message || '설정 저장에 실패했습니다.', 'error');
          return;
        }

        showSettingsAlert('매장 설정이 저장되었습니다.', 'success');
      } catch (error) {
        showSettingsAlert('설정 저장 실패: ' + error.message, 'error');
      }
    }

    async function setAuthMode(platform, authMode) {
      try {
        const response = await apiFetch('/api/v1/platform_connections/' + platform + '/auth-mode', {
          method: 'POST',
          body: JSON.stringify({ auth_mode: authMode })
        });
        const data = await readJsonResponse(response);
        if (!response.ok || data.error) {
          showSettingsAlert(data?.error?.message || '연결 방식 변경에 실패했습니다.', 'error');
          return;
        }

        showSettingsAlert(data.message || '연결 방식을 변경했습니다.', 'success');
        await loadConnections();
      } catch (error) {
        showSettingsAlert('연결 방식 변경 실패: ' + error.message, 'error');
      }
    }

    async function connectPlatform(platform) {
      const connection = platformConnections.find(item => item.platform === platform) || {};
      if (connection.auth_mode === 'direct_session') {
        try {
          const response = await apiFetch('/api/v1/platform_connections/' + platform + '/connect', {
            method: 'POST',
            body: JSON.stringify({ auth_mode: 'direct_session' })
          });
          const data = await readJsonResponse(response);
          if (!response.ok || data.error) {
            showSettingsAlert(data?.error?.message || '직접 로그인 세션 준비에 실패했습니다.', 'error');
            return;
          }

          showSettingsAlert(data.message || '직접 로그인 세션 모드가 준비되었습니다. 다음 단계는 모바일 앱/WebView 연결입니다.', 'info');
          await loadConnections();
          return;
        } catch (error) {
          showSettingsAlert('직접 로그인 세션 준비 실패: ' + error.message, 'error');
          return;
        }
      }

      const loginEmail = document.getElementById(platform + '-email').value.trim();
      const loginPassword = document.getElementById(platform + '-password').value;
      const platformStoreId = document.getElementById(platform + '-store-id').value.trim();

      if (!loginEmail || !loginPassword) {
        showSettingsAlert('플랫폼 이메일과 비밀번호를 모두 입력해주세요. 저장된 비밀번호가 있어도 보안상 다시 입력해야 합니다.', 'error');
        return;
      }

      setPlatformActionLoading(platform, 'connect', true);
      try {
        const response = await apiFetch('/api/v1/platform_connections/' + platform + '/connect', {
          method: 'POST',
          body: JSON.stringify({
            login_email: loginEmail,
            login_password: loginPassword,
            platform_store_id: platformStoreId || null
          })
        });
        const data = await readJsonResponse(response);
        if (!response.ok || data.error || !data.success) {
          showSettingsAlert(data?.message || data?.error?.message || '플랫폼 연결에 실패했습니다.', 'error');
          await loadConnections();
          return;
        }

        showSettingsAlert(platformMeta[platform].label + ' 계정이 연결되었습니다.', 'success');
        await loadConnections();
      } catch (error) {
        showSettingsAlert('플랫폼 연결 실패: ' + error.message, 'error');
      } finally {
        setPlatformActionLoading(platform, 'connect', false);
      }
    }

    async function disconnectPlatform(platform) {
      setPlatformActionLoading(platform, 'disconnect', true);
      try {
        const response = await apiFetch('/api/v1/platform_connections/' + platform + '/disconnect', {
          method: 'POST'
        });
        const data = await readJsonResponse(response);
        if (!response.ok || data.error) {
          showSettingsAlert(data?.error?.message || '플랫폼 연결 해제에 실패했습니다.', 'error');
          return;
        }

        showSettingsAlert(platformMeta[platform].label + ' 연결을 해제했습니다.', 'success');
        await loadConnections();
      } catch (error) {
        showSettingsAlert('플랫폼 연결 해제 실패: ' + error.message, 'error');
      } finally {
        setPlatformActionLoading(platform, 'disconnect', false);
      }
    }

    Promise.all([loadStoreSettings(), loadConnections()]).catch(error => {
      showSettingsAlert(error.message, 'error');
    });
  </script>
</body>
</html>`
}

function mobileSessionCenterPage(isAppShell = false) {
  const cardPaddingClass = isAppShell ? 'p-5' : 'p-6'
  const gridColsClass = isAppShell ? 'grid-cols-1' : 'md:grid-cols-2'
  const actionRowClass = isAppShell ? 'flex flex-col gap-3' : 'flex flex-wrap items-center gap-3'
  const actionButtonWidthClass = isAppShell ? 'w-full' : ''

  return `${baseHead('모바일 세션 센터')}
<body class="bg-gray-50 min-h-screen">
  <main class="${isAppShell ? 'max-w-none mx-auto px-4 py-4' : 'max-w-5xl mx-auto px-4 py-8'}">
    ${isAppShell ? '' : `
    <div class="mb-6">
      <a href="/settings" class="text-sm text-brand-600 hover:text-brand-700"><i class="fas fa-arrow-left mr-2"></i>설정으로 돌아가기</a>
    </div>`}
    <div class="bg-white border border-gray-100 rounded-3xl p-6 mb-6">
      <div class="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
        <div>
          <h1 class="text-2xl font-bold text-gray-900">모바일 직접 로그인 세션 센터</h1>
          <p class="text-sm text-gray-500 mt-2">${isAppShell
            ? '앱 전용 직접 로그인 허브입니다. 아래에서 플랫폼을 선택하면 앱이 로그인 WebView를 열고, 로그인 성공 후 세션 상태를 이 화면으로 다시 전달합니다.'
            : '이 화면은 향후 모바일 앱/WebView 안에서 플랫폼 직접 로그인을 시작하는 허브입니다. 현재 웹 브라우저에서는 브리지 호출만 준비되고, 실제 세션 생성은 모바일 앱 구현이 필요합니다.'}</p>
        </div>
        <button onclick="loadConnections()" class="border border-gray-200 text-gray-600 px-4 py-2 rounded-xl text-sm hover:bg-gray-50 transition">상태 새로고침</button>
      </div>
    </div>
    <div id="mobile-session-alert" class="hidden rounded-2xl border px-5 py-4 text-sm mb-6"></div>
    <div id="mobile-session-list" class="space-y-4">
      <div class="text-sm text-gray-400">플랫폼 세션 상태를 불러오는 중...</div>
    </div>
  </main>
  <script>
    ensureAuthenticated();

    const mobilePlatformMeta = {
      baemin: {
        label: '배달의민족',
        color: '#00C4B4',
        loginUrl: 'https://self.baemin.com/bridge',
        reviewUrl: 'https://self.baemin.com/reviews'
      },
      coupang_eats: {
        label: '쿠팡이츠',
        color: '#E4002B',
        loginUrl: 'https://store.coupangeats.com/login',
        reviewUrl: 'https://store.coupangeats.com/reviews'
      },
      yogiyo: {
        label: '요기요',
        color: '#FA0050',
        loginUrl: 'https://ceo.yogiyo.co.kr/login',
        reviewUrl: 'https://ceo.yogiyo.co.kr/reviews'
      }
    };

    function showMobileSessionAlert(message, tone) {
      const el = document.getElementById('mobile-session-alert');
      const styles = tone === 'error'
        ? 'border-red-200 bg-red-50 text-red-700'
        : tone === 'success'
          ? 'border-green-200 bg-green-50 text-green-700'
          : 'border-blue-200 bg-blue-50 text-blue-700';
      el.className = 'rounded-2xl border px-5 py-4 text-sm mb-6 ' + styles;
      el.textContent = message;
      el.classList.remove('hidden');
      el.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }

    function getSessionBadge(connection) {
      const status = connection?.session_status || 'inactive';
      if (status === 'connected') return '<span class="text-xs bg-green-100 text-green-700 px-2 py-1 rounded-full">세션 활성</span>';
      if (status === 'pending') return '<span class="text-xs bg-yellow-100 text-yellow-700 px-2 py-1 rounded-full">세션 준비중</span>';
      if (status === 'error') return '<span class="text-xs bg-red-100 text-red-700 px-2 py-1 rounded-full">세션 오류</span>';
      if (status === 'expired') return '<span class="text-xs bg-orange-100 text-orange-700 px-2 py-1 rounded-full">세션 만료</span>';
      return '<span class="text-xs bg-gray-100 text-gray-700 px-2 py-1 rounded-full">세션 없음</span>';
    }

    function sendNativeBridgeMessage(payload) {
      if (window.RespondioNativeBridge && typeof window.RespondioNativeBridge.postMessage === 'function') {
        window.RespondioNativeBridge.postMessage(JSON.stringify(payload));
        return true;
      }

      if (window.webkit && window.webkit.messageHandlers && window.webkit.messageHandlers.respondio) {
        window.webkit.messageHandlers.respondio.postMessage(payload);
        return true;
      }

      if (window.AndroidRespondio && typeof window.AndroidRespondio.postMessage === 'function') {
        window.AndroidRespondio.postMessage(JSON.stringify(payload));
        return true;
      }

      if (window.parent && window.parent !== window && typeof window.parent.postMessage === 'function') {
        window.parent.postMessage(payload, '*');
        return true;
      }

      return false;
    }

    function renderMobileConnections(connections) {
      const container = document.getElementById('mobile-session-list');
      container.innerHTML = Object.entries(mobilePlatformMeta).map(([platform, meta]) => {
        const connection = (connections || []).find(item => item.platform === platform) || {};
        const statusText = connection.last_error || '앱에서 바로 로그인하면 세션 준비와 로그인 창 열기가 함께 진행됩니다.';
        return '<div class="bg-white border border-gray-100 rounded-3xl ${cardPaddingClass} shadow-sm">'
          + '<div class="flex flex-col gap-3 md:flex-row md:items-center md:justify-between mb-4">'
          + '<div class="flex items-center gap-3">'
          + '<div class="w-11 h-11 rounded-full text-white text-xs font-bold flex items-center justify-center" style="background:' + meta.color + '">' + meta.label.slice(0, 2) + '</div>'
          + '<div><div class="font-semibold text-gray-900 text-base">' + meta.label + '</div><div class="text-xs text-gray-400 leading-5 mt-1">' + statusText + '</div></div></div>'
          + '<div class="flex flex-wrap items-center gap-2"><span class="text-xs bg-gray-100 text-gray-700 px-2 py-1 rounded-full">방식: ' + (connection.auth_mode || 'direct_session') + '</span>' + getSessionBadge(connection) + '</div></div>'
          + '<div class="grid ${gridColsClass} gap-3 mb-4">'
          + '<input id="' + platform + '-mobile-store-id" type="text" value="' + (connection.platform_store_id || '') + '" placeholder="플랫폼 매장 ID (선택)" class="px-4 py-3 border border-gray-200 rounded-xl focus:ring-2 focus:ring-brand-500 outline-none">'
          + '<div class="text-sm text-gray-500 border border-dashed border-gray-200 rounded-xl px-4 py-3">로그인 URL: ' + meta.loginUrl + '</div>'
          + '</div>'
          + '<div class="${actionRowClass}">'
          + '<button onclick="openNativeLogin(\\'' + platform + '\\')" class="${actionButtonWidthClass} bg-brand-500 text-white px-4 py-3 rounded-xl text-sm font-semibold hover:bg-brand-600 transition">앱에서 바로 로그인</button>'
          + '<button onclick="loadConnections()" class="${actionButtonWidthClass} border border-gray-200 text-gray-600 px-4 py-3 rounded-xl text-sm font-medium hover:bg-gray-50 transition">상태 확인</button>'
          + '<span class="text-xs text-gray-400 leading-5">세션 연결 시각: ' + (connection.session_connected_at ? new Date(connection.session_connected_at).toLocaleString('ko-KR') : '-') + '</span>'
          + '</div></div>';
      }).join('');
    }

    async function loadConnections() {
      const response = await apiFetch('/api/v1/platform_connections');
      const data = await readJsonResponse(response);
      if (!response.ok || data.error) {
        throw new Error(data?.error?.message || '플랫폼 세션 상태를 불러오지 못했습니다.');
      }

      renderMobileConnections(data.connections || []);
    }

    async function prepareDirectSession(platform) {
      const storeId = document.getElementById(platform + '-mobile-store-id').value.trim();
      try {
        const response = await apiFetch('/api/v1/platform_connections/' + platform + '/connect', {
          method: 'POST',
          body: JSON.stringify({
            auth_mode: 'direct_session',
            platform_store_id: storeId || null
          })
        });
        const data = await readJsonResponse(response);
        if (!response.ok || data.error) {
          showMobileSessionAlert(data?.error?.message || '직접 로그인 세션 준비에 실패했습니다.', 'error');
          return;
        }

        showMobileSessionAlert(data.message || '직접 로그인 세션이 준비되었습니다.', 'success');
        await loadConnections();
      } catch (error) {
        showMobileSessionAlert('직접 로그인 세션 준비 실패: ' + error.message, 'error');
      }
    }

    async function openNativeLogin(platform) {
      const meta = mobilePlatformMeta[platform];
      const storeId = document.getElementById(platform + '-mobile-store-id').value.trim();
      try {
        const response = await apiFetch('/api/v1/platform_connections/' + platform + '/connect', {
          method: 'POST',
          body: JSON.stringify({
            auth_mode: 'direct_session',
            platform_store_id: storeId || null
          })
        });
        const data = await readJsonResponse(response);
        if (!response.ok || data.error) {
          showMobileSessionAlert(data?.error?.message || '직접 로그인 세션 준비에 실패했습니다.', 'error');
          return;
        }

        await loadConnections();
      } catch (error) {
        showMobileSessionAlert('직접 로그인 세션 준비 실패: ' + error.message, 'error');
        return;
      }

      let delivered = false;
      try {
        delivered = sendNativeBridgeMessage({
          type: 'open_platform_login',
          platform,
          platformStoreId: storeId || null,
          loginUrl: meta.loginUrl,
          reviewUrl: meta.reviewUrl,
          callbackPath: '/api/v1/platform_connections/' + platform + '/session-state'
        });
      } catch (error) {
        showMobileSessionAlert('앱 브리지 호출 실패: ' + (error?.message || 'unknown error'), 'error');
        return;
      }

      if (!delivered) {
        showMobileSessionAlert('현재 브라우저에는 앱 브리지가 연결되어 있지 않습니다. 이 화면은 향후 모바일 앱/WebView에서 사용됩니다.', 'info');
      } else {
        showMobileSessionAlert(meta.label + ' 로그인 창을 여는 중입니다. 앱 로그인 화면에서 직접 인증을 완료해 주세요.', 'success');
      }
    }

    async function reportSessionResultFromShell(payload) {
      if (!payload || payload.type !== 'respondio_session_result' || !payload.platform) {
        return;
      }

      try {
        const response = await apiFetch('/api/v1/platform_connections/' + payload.platform + '/session-state', {
          method: 'POST',
          body: JSON.stringify({
            session_status: payload.sessionStatus || payload.session_status || 'error',
            platform_store_id: payload.platformStoreId || null,
            last_error: payload.lastError ?? null
          })
        });
        const data = await readJsonResponse(response);
        if (!response.ok || data.error) {
          showMobileSessionAlert(data?.error?.message || '세션 상태 동기화에 실패했습니다.', 'error');
          return;
        }

        const nextState = payload.sessionStatus || payload.session_status;
        showMobileSessionAlert('모바일 셸이 보고한 세션 상태를 반영했습니다: ' + nextState, nextState === 'connected' ? 'success' : 'info');
        await loadConnections();
      } catch (error) {
        showMobileSessionAlert('세션 상태 동기화 실패: ' + error.message, 'error');
      }
    }

    window.addEventListener('message', function(event) {
      const payload = event.data;
      if (!payload || typeof payload !== 'object') {
        return;
      }

      if (payload.type === 'respondio_session_result') {
        reportSessionResultFromShell(payload);
      }
    });

    loadConnections().catch(error => {
      showMobileSessionAlert(error.message, 'error');
    });
  </script>
</body>
</html>`
}

function mobileAppShellPage() {
  return `${baseHead('모바일 앱 셸')}
<body class="bg-dark-950 min-h-screen text-white">
  <main class="min-h-screen grid lg:grid-cols-[1.1fr_0.9fr]">
    <section class="border-r border-white/10 bg-dark-900/80">
      <div class="px-5 py-4 border-b border-white/10 flex items-center justify-between">
        <div>
          <h1 class="text-lg font-bold">Respondio Mobile App Shell</h1>
          <p class="text-xs text-gray-400 mt-1">향후 네이티브 WebView가 이 역할을 그대로 가져갑니다.</p>
        </div>
        <a href="/settings" class="text-xs border border-white/10 text-gray-300 px-3 py-2 rounded-lg hover:bg-white/5 transition">설정으로 돌아가기</a>
      </div>
      <iframe id="session-center-frame" src="/mobile/session-center?app_shell=1" class="w-full h-[calc(100vh-81px)] bg-white"></iframe>
    </section>
    <section class="p-6 bg-dark-950">
      <div class="max-w-xl">
        <div class="mb-6">
          <div class="text-xs uppercase tracking-[0.24em] text-brand-300 mb-2">Bridge Debug</div>
          <h2 class="text-2xl font-bold mb-2">직접 로그인 세션 시뮬레이터</h2>
          <p class="text-sm text-gray-400 leading-relaxed">왼쪽 세션 센터에서 "앱에서 바로 로그인"을 누르면, 이 셸이 네이티브 앱 브리지처럼 메시지를 받습니다. 지금은 실제 WebView 대신 세션 상태 보고를 시뮬레이션합니다.</p>
        </div>

        <div id="mobile-shell-alert" class="hidden rounded-2xl border px-5 py-4 text-sm mb-5"></div>

        <div class="rounded-3xl border border-white/10 bg-white/5 p-5 mb-5">
          <div class="text-xs text-gray-400 mb-2">현재 브리지 요청</div>
          <div id="bridge-request-empty" class="text-sm text-gray-500">아직 받은 브리지 요청이 없습니다.</div>
          <div id="bridge-request-panel" class="hidden space-y-3">
            <div class="flex items-center gap-2">
              <span id="bridge-platform-badge" class="text-xs px-2 py-1 rounded-full bg-brand-500/20 text-brand-200"></span>
              <span id="bridge-store-id" class="text-xs text-gray-400"></span>
            </div>
            <div class="text-sm text-gray-200" id="bridge-login-url"></div>
            <div class="text-xs text-gray-500" id="bridge-review-url"></div>
            <div class="grid sm:grid-cols-3 gap-3 pt-2">
              <button onclick="submitBridgeState('connected')" class="bg-green-500 text-white px-4 py-3 rounded-xl text-sm font-semibold hover:bg-green-600 transition">로그인 성공 처리</button>
              <button onclick="submitBridgeState('error')" class="bg-red-500 text-white px-4 py-3 rounded-xl text-sm font-semibold hover:bg-red-600 transition">로그인 실패 처리</button>
              <button onclick="submitBridgeState('expired')" class="bg-orange-500 text-white px-4 py-3 rounded-xl text-sm font-semibold hover:bg-orange-600 transition">세션 만료 처리</button>
            </div>
          </div>
        </div>

        <div class="rounded-3xl border border-white/10 bg-white/5 p-5">
          <div class="text-xs text-gray-400 mb-3">사용 흐름</div>
          <ol class="space-y-3 text-sm text-gray-200">
            <li>1. 왼쪽 세션 센터에서 "앱에서 바로 로그인"을 누름</li>
            <li>2. 세션 준비와 브리지 요청이 함께 처리됨</li>
            <li>3. 실제 모바일 앱에서는 여기서 플랫폼 로그인 WebView를 연 뒤 사용자가 직접 로그인</li>
            <li>4. 로그인 성공 시 /api/v1/platform_connections/:platform/session-state 로 세션 활성 보고</li>
          </ol>
        </div>
      </div>
    </section>
  </main>

  <script>
    ensureAuthenticated();

    let activeBridgeRequest = null;

    function showMobileShellAlert(message, tone) {
      const el = document.getElementById('mobile-shell-alert');
      const styles = tone === 'error'
        ? 'border-red-200 bg-red-50 text-red-700'
        : tone === 'success'
          ? 'border-green-200 bg-green-50 text-green-700'
          : 'border-blue-200 bg-blue-50 text-blue-700';
      el.className = 'rounded-2xl border px-5 py-4 text-sm mb-5 ' + styles;
      el.textContent = message;
      el.classList.remove('hidden');
    }

    function renderBridgeRequest() {
      const empty = document.getElementById('bridge-request-empty');
      const panel = document.getElementById('bridge-request-panel');

      if (!activeBridgeRequest) {
        empty.classList.remove('hidden');
        panel.classList.add('hidden');
        return;
      }

      empty.classList.add('hidden');
      panel.classList.remove('hidden');
      document.getElementById('bridge-platform-badge').textContent = activeBridgeRequest.platform;
      document.getElementById('bridge-store-id').textContent = activeBridgeRequest.platformStoreId ? '매장 ID: ' + activeBridgeRequest.platformStoreId : '매장 ID 미입력';
      document.getElementById('bridge-login-url').textContent = '로그인 URL: ' + activeBridgeRequest.loginUrl;
      document.getElementById('bridge-review-url').textContent = '리뷰 URL: ' + activeBridgeRequest.reviewUrl;
    }

    function handleBridgePayload(rawPayload) {
      try {
        activeBridgeRequest = typeof rawPayload === 'string' ? JSON.parse(rawPayload) : rawPayload;
        if (!activeBridgeRequest || activeBridgeRequest.type !== 'open_platform_login') {
          return;
        }
        renderBridgeRequest();
        showMobileShellAlert(activeBridgeRequest.platform + ' 직접 로그인 요청을 받았습니다. 실제 앱에서는 여기서 네이티브 WebView를 엽니다.', 'info');
      } catch (error) {
        showMobileShellAlert('브리지 메시지를 해석하지 못했습니다: ' + error.message, 'error');
      }
    }

    function attachBridge() {
      const frame = document.getElementById('session-center-frame');
      if (!frame || !frame.contentWindow) return;

      frame.contentWindow.RespondioNativeBridge = {
        postMessage: function(payload) {
          handleBridgePayload(payload);
        }
      };
    }

    function postSessionResultToFrame(nextState) {
      const frame = document.getElementById('session-center-frame');
      if (!frame || !frame.contentWindow || !activeBridgeRequest) {
        return;
      }

      frame.contentWindow.postMessage({
        type: 'respondio_session_result',
        platform: activeBridgeRequest.platform,
        platformStoreId: activeBridgeRequest.platformStoreId || null,
        sessionStatus: nextState,
        lastError: nextState === 'connected'
          ? null
          : nextState === 'expired'
            ? '모바일 직접 로그인 세션이 만료되었습니다.'
            : '모바일 직접 로그인 과정에서 사용자가 로그인을 완료하지 못했습니다.'
      }, '*');
    }

    async function submitBridgeState(nextState) {
      if (!activeBridgeRequest) {
        showMobileShellAlert('먼저 직접 로그인 요청을 받아야 합니다.', 'error');
        return;
      }

      try {
        postSessionResultToFrame(nextState);
        showMobileShellAlert('세션 상태를 iframe 안 세션 센터로 전달했습니다: ' + nextState, 'success');
      } catch (error) {
        showMobileShellAlert('세션 상태 보고 실패: ' + error.message, 'error');
      }
    }

    window.addEventListener('message', function(event) {
      handleBridgePayload(event.data);
    });

    const frame = document.getElementById('session-center-frame');
    frame.addEventListener('load', function() {
      attachBridge();
    });
    attachBridge();
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
