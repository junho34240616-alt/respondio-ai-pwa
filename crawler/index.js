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

// ============================================================
//  SYNC WITH WEBAPP
// ============================================================
async function syncReviewsToWebapp(reviews, storeId) {
  try {
    const response = await fetch(`${WEBAPP_API}/crawler/reviews`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
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
  console.log(`
  ╔══════════════════════════════════════════════╗
  ║   Respondio Crawler Server                   ║
  ║   Port: ${PORT}                                 ║
  ║   Webapp API: ${WEBAPP_API}           ║
  ║   Platforms: ${Object.keys(PLATFORMS).join(', ')}   ║
  ║   Mode: Demo (실제 크롤링은 크리덴셜 필요)    ║
  ╚══════════════════════════════════════════════╝
  `);
});
