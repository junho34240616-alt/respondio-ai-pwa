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
const { execSync } = require('child_process');

const app = express();
app.use(cors());
app.use(express.json());

const PORT = process.env.PORT || process.env.CRAWLER_PORT || 4000;
const WEBAPP_API = process.env.WEBAPP_API || 'http://localhost:3000/api/v1';
const CRAWLER_SHARED_SECRET = process.env.CRAWLER_SHARED_SECRET || '';
const CRAWLER_TEST_MODE = process.env.CRAWLER_TEST_MODE === '1';

function detectFontStatus() {
  try {
    const nanum = execSync("fc-match 'NanumGothic' | head -n1", { encoding: 'utf8' }).trim();
    const noto = execSync("fc-match 'Noto Sans CJK KR' | head -n1", { encoding: 'utf8' }).trim();
    const hasNanum = /nanum/i.test(nanum);
    const hasNotoKr = /noto/i.test(noto) && /(cjk|kr)/i.test(noto);
    return {
      locale: process.env.LANG || '',
      nanum,
      noto,
      ready: hasNanum || hasNotoKr,
      hasNanum,
      hasNotoKr
    };
  } catch (error) {
    return {
      locale: process.env.LANG || '',
      nanum: '',
      noto: '',
      ready: false,
      hasNanum: false,
      hasNotoKr: false,
      error: error.message
    };
  }
}

const FONT_STATUS = detectFontStatus();
const REMOTE_AUTH_FONT_STYLE = `
html, body, input, textarea, button, select, option, label, span, div, p, a, li, dt, dd, th, td {
  font-family: "NanumGothic", "Nanum Gothic", "NanumBarunGothic", "Nanum Myeongjo", "Noto Sans CJK KR", "Noto Sans KR", "UnDotum", "Malgun Gothic", sans-serif !important;
  font-variant-ligatures: none !important;
}
`;
const REMOTE_AUTH_SCREENSHOT_OPTIONS = {
  type: 'png',
  scale: 'css',
  animations: 'disabled',
  caret: 'hide',
  timeout: 4000,
  style: REMOTE_AUTH_FONT_STYLE
};
const REMOTE_AUTH_FALLBACK_SCREENSHOT_OPTIONS = {
  type: 'png',
  scale: 'css',
  timeout: 0,
  style: REMOTE_AUTH_FONT_STYLE
};
const REMOTE_AUTH_SCREENSHOT_CACHE_MS = 180;
const REMOTE_AUTH_SCREENSHOT_PREWARM_DELAY_MS = 12;
const REMOTE_AUTH_TYPING_DELAY_MS = 0;

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
const platformSessions = new Map(); // `${platform}:${storeId}` -> { browser, context, page, loggedIn }
const remoteAuthSessions = new Map(); // sessionId -> { sessionId, platform, storeId, sessionKey, createdAt, updatedAt, status, lastError }
const crawlJobs = [];
const jobHistory = [];

function normalizeStoreId(storeId) {
  const parsed = Number(storeId || 1);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : 1;
}

function getSessionKey(platform, storeId) {
  return `${platform}:${normalizeStoreId(storeId)}`;
}

function createRemoteAuthSessionId() {
  if (globalThis.crypto && typeof globalThis.crypto.randomUUID === 'function') {
    return globalThis.crypto.randomUUID();
  }

  return `remote_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`;
}

async function requestWebappSessionState(method, platform, storeId, payload = null) {
  const normalizedStoreId = normalizeStoreId(storeId);
  const url = new URL(`${WEBAPP_API}/crawler/platform-session-state`);
  url.searchParams.set('platform', platform);
  url.searchParams.set('store_id', String(normalizedStoreId));

  const response = await fetch(method === 'GET' ? url.toString() : `${WEBAPP_API}/crawler/platform-session-state`, {
    method,
    headers: {
      ...(CRAWLER_SHARED_SECRET ? { 'X-Crawler-Secret': CRAWLER_SHARED_SECRET } : {}),
      ...(method === 'GET' ? {} : { 'Content-Type': 'application/json' })
    },
    ...(method === 'GET'
      ? {}
      : {
          body: JSON.stringify({
            platform,
            store_id: normalizedStoreId,
            ...(payload || {})
          })
        })
  });

  const result = await response.json().catch(() => ({}));
  if (!response.ok || result?.success === false) {
    throw new Error(result?.error?.message || result?.error || result?.message || '웹앱 세션 상태 요청에 실패했습니다.');
  }

  return result;
}

async function readSavedSessionState(platform, storeId) {
  try {
    const result = await requestWebappSessionState('GET', platform, storeId);
    return result?.session_state ? { state: result.session_state } : null;
  } catch (error) {
    console.warn(`[${platform}] 저장 세션 조회 실패: ${error.message}`);
    return null;
  }
}

async function hasSavedSessionState(platform, storeId) {
  return !!(await readSavedSessionState(platform, storeId));
}

async function deleteSavedSessionState(platform, storeId) {
  try {
    await requestWebappSessionState('POST', platform, storeId, { clear: true });
  } catch (error) {
    console.warn(`[${platform}] 저장 세션 삭제 실패: ${error.message}`);
  }
}

// ============================================================
//  PLATFORM CONFIGS
// ============================================================
const PLATFORMS = {
  baemin: {
    name: '배달의민족',
    loginUrl: 'https://self.baemin.com/login',
    reviewUrl: 'https://self.baemin.com/reviews',
    fallbackLoginUrls: [
      'https://self.baemin.com/bridge',
      'https://nid.naver.com/nidlogin.login?mode=form&url=https%3A%2F%2Fself.baemin.com%2Fbridge'
    ],
    selectors: {
      loginEmail: 'input[type="email"], input[name="email"], #email, input[name="id"], #id, input[aria-label="아이디 또는 전화번호"], input[placeholder*="아이디"], input[placeholder*="전화번호"], input[autocomplete="username"]',
      loginPassword: 'input[type="password"], input[name="password"], #password, input[name="pw"], #pw, input[aria-label="비밀번호"]',
      loginButton: 'button[type="submit"], .login-btn, #log\\.login, button.btn_login, input[type="submit"], button:has-text("로그인"), button:has-text("다음"), a:has-text("네이버")',
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
    fallbackLoginUrls: [
      'https://store.coupangeats.com/merchant/app',
      'https://store.coupangeats.com/merchant/app/fee'
    ],
    selectors: {
      loginEmail: 'input[type="email"], input[name="email"], input[name="id"], input[name="username"], input[name="phone"], input[type="tel"], input[type="text"], #email, #id, #phone, input[placeholder*="이메일"], input[placeholder*="아이디"], input[placeholder*="전화"], input[autocomplete="username"]',
      loginPassword: 'input[type="password"], input[name="password"], input[name="pw"], #password, #pw, input[placeholder*="비밀번호"], input[aria-label*="비밀번호"]',
      loginButton: 'button[type="submit"], button:has-text("로그인"), button:has-text("다음"), [role="button"]:has-text("로그인"), input[type="submit"]',
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
      loginEmail: 'input[type="email"], input[name="id"], input[name="email"], input[name="phone"], input[type="tel"], #id, #email, #phone, input[id^="field-"]:not([type="password"]), input[placeholder*="전화번호"], input[placeholder*="휴대폰"], input[placeholder*="아이디"], input[aria-label*="전화"], input[aria-label*="휴대폰"], input[aria-label*="아이디"]',
      loginPassword: 'input[type="password"], input[name="password"], input[name="pw"], #password, #pw, input[id^="field-"][type="password"], input[placeholder*="비밀번호"], input[aria-label*="비밀번호"]',
      loginButton: 'button[type="submit"], button:has-text("로그인"), button:has-text("다음"), [role="button"]:has-text("로그인")',
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
const launchArgs = [
  '--no-sandbox',
  '--disable-setuid-sandbox',
  '--disable-dev-shm-usage'
];

function isSessionActive(session) {
  return !!(
    session &&
    session.browser &&
    session.browser.isConnected &&
    session.browser.isConnected() &&
    session.page &&
    typeof session.page.isClosed === 'function' &&
    !session.page.isClosed()
  );
}

async function closePlatformSession(platform, storeId) {
  const sessionKey = getSessionKey(platform, storeId);
  const session = platformSessions.get(sessionKey);
  if (!session) return;

  platformSessions.delete(sessionKey);

  try {
    await session.page?.close();
  } catch (error) {}

  try {
    await session.context?.close();
  } catch (error) {}

  try {
    await session.browser?.close();
  } catch (error) {}
}

async function createPlatformSession(platform, storeId) {
  const sessionKey = getSessionKey(platform, storeId);
  const normalizedStoreId = normalizeStoreId(storeId);
  const viewport = { width: 1280, height: 1760 };
  const savedState = await readSavedSessionState(platform, normalizedStoreId);
  const browser = await chromium.launch({
    headless: true,
    chromiumSandbox: false,
    args: launchArgs
  });

  browser.on('disconnected', () => {
    const current = platformSessions.get(sessionKey);
    if (current && current.browser === browser) {
      platformSessions.delete(sessionKey);
    }
  });

  const context = await browser.newContext({
    userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
    viewport,
    deviceScaleFactor: 2,
    locale: 'ko-KR',
    timezoneId: 'Asia/Seoul',
    ...(savedState?.state ? { storageState: savedState.state } : {}),
    extraHTTPHeaders: {
      'Accept-Language': 'ko-KR,ko;q=0.9,en-US;q=0.8,en;q=0.7'
    }
  });

  const page = await context.newPage();
  page.setDefaultTimeout(15000);
  page.setDefaultNavigationTimeout(30000);

  const sessionData = {
    browser,
    context,
    page,
    platform,
    storeId: normalizedStoreId,
    sessionKey,
    viewport,
    loggedIn: false,
    lastActivity: Date.now(),
    lastScreenshot: null,
    lastScreenshotAt: null,
    pendingScreenshotPromise: null,
    screenshotDirty: true,
    hasSavedSessionState: !!savedState
  };

  const markVisualChange = () => {
    sessionData.lastActivity = Date.now();
    sessionData.screenshotDirty = true;
  };

  page.on('domcontentloaded', markVisualChange);
  page.on('load', markVisualChange);
  page.on('framenavigated', markVisualChange);

  platformSessions.set(sessionKey, sessionData);
  return sessionData;
}

async function getContext(platform, storeId, options = {}) {
  const { fresh = false } = options;
  const sessionKey = getSessionKey(platform, storeId);
  const existing = platformSessions.get(sessionKey);

  if (fresh && existing) {
    await closePlatformSession(platform, storeId);
  } else if (isSessionActive(existing)) {
    return existing;
  } else if (existing) {
    await closePlatformSession(platform, storeId);
  }

  return createPlatformSession(platform, storeId);
}

function getRemoteAuthActionSettleMs(action) {
  if (action === 'reload' || action === 'back' || action === 'goto') return 170;
  if (action === 'click') return 16;
  if (action === 'press') return 8;
  if (action === 'type') return 0;
  if (action === 'wait') return 0;
  return 0;
}

async function captureRemoteAuthScreenshot(session, options = {}) {
  const { force = false, delayMs = 0 } = options;
  if (!isSessionActive(session)) {
    throw new Error('원격 인증 세션이 종료되었습니다.');
  }

  const cacheIsFresh = session.lastScreenshot && session.lastScreenshotAt && (Date.now() - session.lastScreenshotAt) < REMOTE_AUTH_SCREENSHOT_CACHE_MS;
  if (!force && !session.screenshotDirty && cacheIsFresh) {
    return session.lastScreenshot;
  }

  if (session.pendingScreenshotPromise) {
    return session.pendingScreenshotPromise;
  }

  const task = (async () => {
    if (delayMs > 0) {
      await session.page.waitForTimeout(delayMs).catch(() => {});
    }

    let image = null;
    try {
      image = await session.page.screenshot(REMOTE_AUTH_SCREENSHOT_OPTIONS);
    } catch (primaryError) {
      try {
        image = await session.page.screenshot(REMOTE_AUTH_FALLBACK_SCREENSHOT_OPTIONS);
      } catch (fallbackError) {
        if (session.lastScreenshot) {
          image = session.lastScreenshot;
        } else {
          throw fallbackError;
        }
      }
    }

    session.lastScreenshot = image;
    session.lastScreenshotAt = Date.now();
    session.lastActivity = Date.now();
    session.screenshotDirty = false;
    return image;
  })().finally(() => {
    if (session.pendingScreenshotPromise === task) {
      session.pendingScreenshotPromise = null;
    }
  });

  session.pendingScreenshotPromise = task;
  return task;
}

function prewarmRemoteAuthScreenshot(session, delayMs = REMOTE_AUTH_SCREENSHOT_PREWARM_DELAY_MS) {
  if (!session) return null;
  session.screenshotDirty = true;
  return captureRemoteAuthScreenshot(session, { force: true, delayMs }).catch(() => null);
}

async function persistPlatformSessionState(session) {
  if (!isSessionActive(session) || !session.context) {
    throw new Error('세션 상태를 저장할 활성 브라우저 컨텍스트가 없습니다.');
  }

  const state = await session.context.storageState();
  await requestWebappSessionState('POST', session.platform, session.storeId, { session_state: state });
  session.hasSavedSessionState = true;
  session.lastPersistedAt = Date.now();
  return true;
}

function serializePlatformSession(session) {
  return {
    name: PLATFORMS[session.platform]?.name || session.platform,
    platform: session.platform,
    storeId: session.storeId,
    loggedIn: session.loggedIn,
    lastActivity: session.lastActivity ? new Date(session.lastActivity).toISOString() : null,
    hasSavedSessionState: !!session.hasSavedSessionState
  };
}

async function restoreSavedPlatformSession(platform, storeId, options = {}) {
  const config = PLATFORMS[platform];
  if (!config) {
    throw new Error(`Unsupported platform: ${platform}`);
  }

  const normalizedStoreId = normalizeStoreId(storeId);
  const savedState = await readSavedSessionState(platform, normalizedStoreId);
  if (!savedState) {
    return {
      success: false,
      restored: false,
      platform,
      message: '저장된 플랫폼 세션이 없습니다.'
    };
  }

  const session = await getContext(platform, normalizedStoreId, { fresh: true });

  try {
    await session.page.goto(config.reviewUrl || config.loginUrl, { waitUntil: 'domcontentloaded', timeout: 30000 });
    await session.page.waitForTimeout(1200);

    const currentUrl = session.page.url();
    session.loggedIn = isLoginSuccessUrl(platform, currentUrl);
    session.lastActivity = Date.now();
    session.screenshotDirty = true;

    if (!session.loggedIn) {
      const loginSurfaceVisible = await hasVisibleLoginSurface(session.page, config).catch(() => false);
      const diagnostics = await getPageDiagnostics(session.page);
      const failureMessage = deriveLoginFailureMessage(platform, currentUrl, diagnostics);

      if (loginSurfaceVisible) {
        await deleteSavedSessionState(platform, normalizedStoreId);
      }

      await closePlatformSession(platform, normalizedStoreId);
      return {
        success: false,
        restored: false,
        platform,
        message: failureMessage
      };
    }

    await persistPlatformSessionState(session).catch(() => null);
    return {
      success: true,
      restored: true,
      platform,
      session,
      message: '저장된 플랫폼 세션을 복원했습니다.'
    };
  } catch (error) {
    await closePlatformSession(platform, normalizedStoreId);
    return {
      success: false,
      restored: false,
      platform,
      message: `저장된 세션 복원 실패: ${error.message}`
    };
  }
}

async function waitForVisibleSelector(page, selector, timeout = 15000) {
  const deadline = Date.now() + timeout;
  while (Date.now() < deadline) {
    const locator = page.locator(selector).first();
    try {
      if (await locator.isVisible({ timeout: 500 })) {
        return locator;
      }
    } catch (error) {
      // Keep polling while the login flow redirects between providers.
    }
    await page.waitForTimeout(250);
  }

  throw new Error(`Timeout ${timeout}ms exceeded while waiting for selector: ${selector}`);
}

function getAllFrames(page) {
  const main = page.mainFrame();
  return [main, ...page.frames().filter((frame) => frame !== main)];
}

async function waitForVisibleSelectorInFrames(page, selector, timeout = 15000) {
  const deadline = Date.now() + timeout;
  while (Date.now() < deadline) {
    for (const frame of getAllFrames(page)) {
      const locator = frame.locator(selector).first();
      try {
        if (await locator.isVisible({ timeout: 400 })) {
          return { frame, locator, selector };
        }
      } catch (error) {
        // Keep polling while auth pages redirect or replace iframes.
      }
    }
    await page.waitForTimeout(250);
  }

  throw new Error(`Timeout ${timeout}ms exceeded while waiting for selector: ${selector}`);
}

async function probeVisibleSelectorInFrames(page, selector, timeout = 1500) {
  try {
    return await waitForVisibleSelectorInFrames(page, selector, timeout);
  } catch (error) {
    return null;
  }
}

async function getFrameDomSummary(frame) {
  try {
    return await frame.evaluate(() => {
      const pick = (elements, mapper, limit = 8) =>
        Array.from(elements)
          .map(mapper)
          .filter(Boolean)
          .slice(0, limit);

      const inputs = pick(document.querySelectorAll('input, textarea'), (el) => {
        const style = window.getComputedStyle(el);
        if (style.display === 'none' || style.visibility === 'hidden') return null;
        return {
          tag: el.tagName.toLowerCase(),
          type: el.getAttribute('type') || '',
          name: el.getAttribute('name') || '',
          id: el.getAttribute('id') || '',
          placeholder: el.getAttribute('placeholder') || '',
          autocomplete: el.getAttribute('autocomplete') || '',
          ariaLabel: el.getAttribute('aria-label') || ''
        };
      });

      const buttons = pick(document.querySelectorAll('button, input[type="submit"], a, [role="button"]'), (el) => {
        const style = window.getComputedStyle(el);
        const text = (el.textContent || el.getAttribute('value') || '').trim();
        if (style.display === 'none' || style.visibility === 'hidden' || !text) return null;
        return {
          tag: el.tagName.toLowerCase(),
          type: el.getAttribute('type') || '',
          id: el.getAttribute('id') || '',
          text: text.slice(0, 80)
        };
      });

      const bodyText = (document.body?.innerText || '').replace(/\s+/g, ' ').trim().slice(0, 240);
      return {
        title: document.title || '',
        bodyText,
        inputs,
        buttons
      };
    });
  } catch (error) {
    return {
      title: '',
      bodyText: '',
      inputs: [],
      buttons: [],
      error: error.message
    };
  }
}

async function getPageDiagnostics(page) {
  const frameSummaries = [];
  for (const frame of getAllFrames(page)) {
    const summary = await getFrameDomSummary(frame);
    frameSummaries.push({
      url: frame.url(),
      ...summary
    });
  }

  return {
    currentUrl: page.url(),
    frameCount: frameSummaries.length,
    frames: frameSummaries
  };
}

function formatPageDiagnostics(diagnostics) {
  const parts = [
    `url=${diagnostics.currentUrl}`,
    `frames=${diagnostics.frameCount}`
  ];

  diagnostics.frames.slice(0, 3).forEach((frame, index) => {
    const inputs = (frame.inputs || [])
      .map((input) => {
        const details = [input.tag, input.type, input.name, input.id, input.placeholder, input.ariaLabel]
          .filter(Boolean)
          .join('/');
        return details || input.tag;
      })
      .join('; ');

    const buttons = (frame.buttons || [])
      .map((button) => button.text || button.id || button.tag)
      .join('; ');

    parts.push(
      `frame${index + 1}=${frame.url}`,
      frame.title ? `title=${frame.title}` : '',
      frame.bodyText ? `body=${frame.bodyText}` : '',
      inputs ? `inputs=${inputs}` : '',
      buttons ? `buttons=${buttons}` : ''
    );
  });

  return parts.filter(Boolean).join(' | ');
}

function flattenDiagnosticsText(diagnostics) {
  return [
    diagnostics.currentUrl,
    ...(diagnostics.frames || []).flatMap((frame) => [
      frame.url,
      frame.title,
      frame.bodyText,
      ...(frame.inputs || []).flatMap((input) => [
        input.tag,
        input.type,
        input.name,
        input.id,
        input.placeholder,
        input.ariaLabel
      ]),
      ...(frame.buttons || []).map((button) => button.text)
    ])
  ]
    .filter(Boolean)
    .join(' ')
    .toLowerCase();
}

function deriveLoginFailureMessage(platform, currentUrl, diagnostics) {
  const text = flattenDiagnosticsText(diagnostics);

  if (platform === 'baemin') {
    if (text.includes('captcha') || text.includes('자동입력 방지')) {
      return `로그인 실패 - 네이버 추가 인증 또는 CAPTCHA가 표시되었습니다. 현재 서버 자동 로그인으로는 진행하기 어렵습니다. (${currentUrl})`;
    }

    if (text.includes('비밀번호를 확인') || text.includes('아이디 또는 전화번호') || text.includes('다시 확인해주세요')) {
      return `로그인 실패 - 네이버 로그인 단계에서 크리덴셜 검증 또는 추가 인증이 필요합니다. (${currentUrl})`;
    }
  }

  if (platform === 'coupang_eats') {
    if (text.includes('access denied') || text.includes('errors.edgesuite.net')) {
      return `로그인 실패 - 쿠팡이츠가 현재 서버 IP를 차단하고 있습니다. Render 서버 대신 로컬 또는 다른 IP 환경이 필요합니다. (${currentUrl})`;
    }
  }

  return `로그인 실패 - 크리덴셜 또는 추가 인증 상태 확인 필요 (${currentUrl})`;
}

function isLoginSuccessUrl(platform, currentUrl) {
  if (!currentUrl) return false;

  const normalized = currentUrl.toLowerCase();
  if (platform === 'baemin') {
    return (
      normalized.includes('self.baemin.com') &&
      !normalized.includes('/login') &&
      !normalized.includes('/bridge') &&
      !normalized.includes('nid.naver.com/nidlogin')
    );
  }

  if (platform === 'coupang_eats') {
    return normalized.includes('store.coupangeats.com') && !normalized.includes('/login');
  }

  return !normalized.includes('login');
}

async function hasVisibleLoginSurface(page, config) {
  const probes = [
    config.selectors.loginEmail,
    config.selectors.loginPassword,
    config.selectors.loginButton
  ];

  for (const selector of probes) {
    const found = await probeVisibleSelectorInFrames(page, selector, 1200);
    if (found) return true;
  }

  return false;
}

async function openLoginSurface(platform, page, config) {
  const loginUrls = [config.loginUrl, ...(config.fallbackLoginUrls || [])].filter(Boolean);

  for (const candidateUrl of loginUrls) {
    await page.goto(candidateUrl, { waitUntil: 'domcontentloaded', timeout: 30000 });
    await page.waitForTimeout(2000);

    if (await hasVisibleLoginSurface(page, config)) {
      return;
    }
  }
}

async function getRemoteAuthSnapshot(remoteSession) {
  const session = platformSessions.get(remoteSession.sessionKey);
  if (!isSessionActive(session)) {
    return {
      success: false,
      status: 'closed',
      message: '원격 인증 세션이 종료되었습니다.',
      current_url: '',
      title: '',
      can_complete: false,
      viewport: { width: 0, height: 0 }
    };
  }

  const currentUrl = session.page.url();
  const title = await session.page.title().catch(() => '');
  const bodyText = await session.page.evaluate(() => {
    return (document.body?.textContent || '').replace(/\s+/g, ' ').trim().slice(0, 1500);
  }).catch(() => '');
  const normalizedBody = String(bodyText || '').toLowerCase();
  const canComplete = isLoginSuccessUrl(remoteSession.platform, currentUrl);

  let stage = canComplete ? 'ready' : 'auth_in_progress';
  let message = '로그인 화면을 진행 중입니다.';

  if (remoteSession.platform === 'baemin') {
    if (currentUrl.includes('nid.naver.com/nidlogin')) {
      stage = 'auth_in_progress';
      message = '네이버 로그인 화면입니다. 아이디/비밀번호 입력 후 추가 인증이 나오면 그대로 진행해주세요.';
    } else if (normalizedBody.includes('셀프서비스 시작하기')) {
      stage = 'needs_user_action';
      message = '배민 셀프서비스 시작 화면입니다. "셀프서비스 시작하기"를 눌러 실제 운영 화면으로 이동해주세요.';
    } else if (canComplete) {
      stage = 'ready';
      message = '배민 운영 화면에 진입했습니다. 인증 완료 처리 후 웹앱으로 돌아갈 수 있습니다.';
    }
  }

  if (remoteSession.platform === 'coupang_eats' && normalizedBody.includes('access denied')) {
    stage = 'blocked';
    message = '쿠팡이츠가 현재 서버 환경을 차단하고 있습니다. 다른 실행 환경이 필요할 수 있습니다.';
  }

  if (remoteSession.platform === 'yogiyo' && canComplete) {
    stage = 'ready';
    message = '요기요 운영 화면에 진입했습니다. 인증 완료 처리 후 웹앱으로 돌아갈 수 있습니다.';
  }

  remoteSession.updatedAt = Date.now();
  remoteSession.status = stage;

  return {
    success: true,
    status: stage,
    message,
    current_url: currentUrl,
    title,
    can_complete: canComplete,
    viewport: session.viewport || session.page.viewportSize() || { width: 1440, height: 1880 }
  };
}

async function cleanupRemoteAuthSession(sessionId, options = {}) {
  const { closeBrowser = false } = options;
  const remoteSession = remoteAuthSessions.get(sessionId);
  if (!remoteSession) return;

  remoteAuthSessions.delete(sessionId);

  if (closeBrowser) {
    await closePlatformSession(remoteSession.platform, remoteSession.storeId);
  }
}

async function findLoginField(page, primarySelector, fallbackSelectors, timeout) {
  const selectors = [primarySelector, ...fallbackSelectors];
  const deadline = Date.now() + timeout;

  while (Date.now() < deadline) {
    for (const selector of selectors) {
      const found = await probeVisibleSelectorInFrames(page, selector, 900);
      if (found) {
        return found;
      }
    }
    await page.waitForTimeout(250);
  }

  throw new Error(`Timeout ${timeout}ms exceeded while waiting for selectors: ${selectors.join(' || ')}`);
}

function safeText(value) {
  if (value === null || value === undefined) return '';
  if (typeof value === 'string') return value.trim();
  if (typeof value === 'number' || typeof value === 'boolean') return String(value).trim();
  return '';
}

function parseNumber(value) {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (typeof value === 'string') {
    const normalized = value.replace(/[^0-9.]/g, '');
    const parsed = Number(normalized);
    return Number.isFinite(parsed) ? parsed : 0;
  }
  return 0;
}

function firstNonEmpty(...values) {
  for (const value of values) {
    if (Array.isArray(value)) {
      const text = normalizeMenuItems(value);
      if (text) return text;
      continue;
    }
    const text = safeText(value);
    if (text) return text;
  }
  return '';
}

function normalizeMenuItems(value) {
  if (!value) return '';

  if (Array.isArray(value)) {
    return value
      .map((item) => {
        if (typeof item === 'string') return item.trim();
        if (!item || typeof item !== 'object') return '';

        const name = firstNonEmpty(
          item.name,
          item.menu_name,
          item.title,
          item.display_name,
          item.option_name
        );
        const quantity = firstNonEmpty(item.quantity, item.count, item.qty);
        if (!name) return '';
        return quantity ? `${name} x${quantity}` : name;
      })
      .filter(Boolean)
      .join(', ');
  }

  if (typeof value === 'object') {
    return normalizeMenuItems(
      value.menu_items ||
      value.menus ||
      value.order_items ||
      value.items ||
      value.orders
    );
  }

  return safeText(value);
}

function extractYogiyoVendorId(input) {
  const source = safeText(input);
  const match = source.match(/\/vendor\/(\d+)\/reviews(?:\/v2\/|\/info\/)/);
  return match ? match[1] : '';
}

function normalizeYogiyoReviewItem(item, storeId) {
  if (!item || typeof item !== 'object' || Array.isArray(item)) return null;

  const reviewNode =
    item.review ||
    item.customer_review ||
    item.review_data ||
    item.owner_review ||
    null;

  const reviewText = firstNonEmpty(
    item.review_text,
    item.review_comment,
    item.comment,
    item.content,
    item.contents,
    item.text,
    reviewNode?.review_text,
    reviewNode?.comment,
    reviewNode?.content,
    reviewNode?.contents,
    reviewNode?.text
  );

  if (!reviewText) {
    return null;
  }

  const rating = parseNumber(
    firstNonEmpty(
      item.rating,
      item.score,
      item.star,
      item.star_point,
      reviewNode?.rating,
      reviewNode?.score,
      reviewNode?.star,
      reviewNode?.star_point
    )
  );

  const platformReviewId = firstNonEmpty(
    item.review_id,
    item.id,
    item.pk,
    item.reviewPk,
    reviewNode?.review_id,
    reviewNode?.id,
    reviewNode?.pk
  );

  const customerName = firstNonEmpty(
    item.customer_name,
    item.nickname,
    item.name,
    item.reviewer_name,
    item.writer_name,
    item.user_name,
    reviewNode?.customer_name,
    reviewNode?.nickname,
    reviewNode?.name
  ) || '고객';

  const menuItems = normalizeMenuItems(
    item.menu_items ||
    item.menu_names ||
    item.menus ||
    item.ordered_menus ||
    item.order_items ||
    item.order_menu_list ||
    reviewNode?.menu_items ||
    reviewNode?.menus
  );

  const reviewDate = firstNonEmpty(
    item.review_date,
    item.created_at,
    item.created,
    item.registered_at,
    item.reg_date,
    item.date,
    reviewNode?.review_date,
    reviewNode?.created_at,
    reviewNode?.created
  ) || new Date().toISOString();

  const hasReply =
    item.has_reply === true ||
    item.replied === true ||
    item.reply_status === 'completed' ||
    item.reply_status === 'done' ||
    item.reply_status === 'replied' ||
    !!item.owner_reply ||
    !!item.reply ||
    (Array.isArray(item.replies) && item.replies.length > 0) ||
    !!reviewNode?.owner_reply ||
    !!reviewNode?.reply;

  return {
    platform_review_id: platformReviewId || `yogiyo_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
    customer_name: customerName,
    rating: rating || 4,
    review_text: reviewText,
    menu_items: menuItems,
    review_date: reviewDate,
    platform: 'yogiyo',
    store_id: storeId,
    has_reply: hasReply
  };
}

function extractYogiyoReviewsFromPayload(payload, storeId) {
  const visited = new Set();
  let bestMatch = [];

  function visit(node) {
    if (!node || typeof node !== 'object') return;
    if (visited.has(node)) return;
    visited.add(node);

    if (Array.isArray(node)) {
      const normalized = node
        .map((item) => normalizeYogiyoReviewItem(item, storeId))
        .filter(Boolean);

      const unanswered = normalized.filter((item) => !item.has_reply);
      const candidate = unanswered.length ? unanswered : normalized;
      if (candidate.length > bestMatch.length) {
        bestMatch = candidate;
      }

      for (const item of node) {
        visit(item);
      }
      return;
    }

    for (const value of Object.values(node)) {
      visit(value);
    }
  }

  visit(payload);

  const seen = new Set();
  return bestMatch
    .filter((review) => {
      const key = `${review.platform_review_id}:${review.review_text}`;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    })
    .map(({ has_reply, ...review }) => review);
}

function normalizeGenericReviewItem(item, platform, storeId) {
  if (!item || typeof item !== 'object' || Array.isArray(item)) return null;

  const nestedReview =
    item.review ||
    item.review_data ||
    item.customer_review ||
    item.reviewInfo ||
    item.orderReview ||
    item.reviewContent ||
    null;

  const reviewText = firstNonEmpty(
    item.review_text,
    item.review_comment,
    item.comment,
    item.content,
    item.contents,
    item.text,
    item.message,
    nestedReview?.review_text,
    nestedReview?.comment,
    nestedReview?.content,
    nestedReview?.contents,
    nestedReview?.text,
    nestedReview?.message
  );

  if (!reviewText) {
    return null;
  }

  const platformReviewId = firstNonEmpty(
    item.review_id,
    item.reviewId,
    item.order_review_id,
    item.orderReviewId,
    item.id,
    item.pk,
    nestedReview?.review_id,
    nestedReview?.reviewId,
    nestedReview?.id,
    nestedReview?.pk
  );

  const customerName = firstNonEmpty(
    item.customer_name,
    item.customerName,
    item.nickname,
    item.name,
    item.reviewer_name,
    item.writer_name,
    item.user_name,
    item.memberName,
    nestedReview?.customer_name,
    nestedReview?.customerName,
    nestedReview?.nickname,
    nestedReview?.name
  ) || '고객';

  const rating = parseNumber(
    firstNonEmpty(
      item.rating,
      item.score,
      item.star,
      item.stars,
      item.point,
      nestedReview?.rating,
      nestedReview?.score,
      nestedReview?.star,
      nestedReview?.stars
    )
  );

  const menuItems = normalizeMenuItems(
    item.menu_items ||
    item.menu_names ||
    item.menus ||
    item.order_items ||
    item.order_menu_list ||
    item.ordered_menus ||
    item.items ||
    nestedReview?.menu_items ||
    nestedReview?.menus
  );

  const reviewDate = firstNonEmpty(
    item.review_date,
    item.created_at,
    item.created,
    item.registered_at,
    item.reg_date,
    item.date,
    nestedReview?.review_date,
    nestedReview?.created_at,
    nestedReview?.created
  ) || new Date().toISOString();

  const hasReply =
    item.has_reply === true ||
    item.replied === true ||
    item.reply_status === 'completed' ||
    item.reply_status === 'done' ||
    item.reply_status === 'replied' ||
    !!item.reply ||
    !!item.owner_reply ||
    !!item.reply_content ||
    (Array.isArray(item.replies) && item.replies.length > 0) ||
    !!nestedReview?.reply ||
    !!nestedReview?.owner_reply;

  return {
    platform_review_id: platformReviewId || `${platform}_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
    customer_name: customerName,
    rating: rating || 4,
    review_text: reviewText,
    menu_items: menuItems,
    review_date: reviewDate,
    platform,
    store_id: storeId,
    has_reply: hasReply
  };
}

function extractGenericReviewsFromPayload(payload, platform, storeId) {
  const visited = new Set();
  let bestMatch = [];

  function visit(node) {
    if (!node || typeof node !== 'object') return;
    if (visited.has(node)) return;
    visited.add(node);

    if (Array.isArray(node)) {
      const normalized = node
        .map((item) => normalizeGenericReviewItem(item, platform, storeId))
        .filter(Boolean);

      const unanswered = normalized.filter((item) => !item.has_reply);
      const candidate = unanswered.length ? unanswered : normalized;
      if (candidate.length > bestMatch.length) {
        bestMatch = candidate;
      }

      for (const item of node) {
        visit(item);
      }
      return;
    }

    for (const value of Object.values(node)) {
      visit(value);
    }
  }

  visit(payload);

  const seen = new Set();
  return bestMatch
    .filter((review) => {
      const key = `${review.platform_review_id}:${review.review_text}`;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    })
    .map(({ has_reply, ...review }) => review);
}

async function collectObservedReviewApi(page, platform, storeId, reviewUrl) {
  const observedResponses = [];
  const listener = (response) => {
    const url = response.url().toLowerCase();
    const contentType = response.headers()['content-type'] || '';
    if (url.includes('review') && contentType.includes('application/json')) {
      observedResponses.push(response);
    }
  };

  page.on('response', listener);
  try {
    await page.goto(reviewUrl, { waitUntil: 'domcontentloaded', timeout: 30000 });

    const deadline = Date.now() + 15000;
    while (Date.now() < deadline) {
      if (observedResponses.length > 0) {
        break;
      }
      await page.waitForTimeout(250);
    }
  } finally {
    page.off('response', listener);
  }

  const observedUrls = observedResponses.map((response) => response.url());

  for (const response of observedResponses) {
    const payload = await response.json().catch(() => null);
    const reviews = extractGenericReviewsFromPayload(payload, platform, storeId);
    if (reviews.length > 0) {
      return {
        reviews,
        source: response.url(),
        observedUrls
      };
    }
  }

  return {
    reviews: [],
    source: '',
    observedUrls
  };
}

async function collectYogiyoReviewsViaApi(page, storeId, reviewUrl) {
  const observedResponses = [];
  const listener = (response) => {
    const url = response.url();
    if (
      url.includes('ceo-api.yogiyo.co.kr') &&
      (url.includes('/reviews/v2/') || url.includes('/reviews/info/'))
    ) {
      observedResponses.push(response);
    }
  };

  page.on('response', listener);
  try {
    await page.goto(reviewUrl, { waitUntil: 'domcontentloaded', timeout: 30000 });

    const deadline = Date.now() + 15000;
    while (Date.now() < deadline) {
      if (observedResponses.some((response) => response.url().includes('/reviews/v2/'))) {
        break;
      }
      await page.waitForTimeout(250);
    }
  } finally {
    page.off('response', listener);
  }

  let vendorId = '';
  const observedUrls = observedResponses.map((response) => response.url());

  for (const response of observedResponses) {
    vendorId = vendorId || extractYogiyoVendorId(response.url());
    if (!response.url().includes('/reviews/v2/')) {
      continue;
    }

    const payload = await response.json().catch(() => null);
    const reviews = extractYogiyoReviewsFromPayload(payload, storeId);
    if (reviews.length > 0) {
      return {
        reviews,
        source: response.url(),
        vendorId,
        observedUrls
      };
    }
  }

  if (vendorId) {
    const manualFetch = await page.evaluate(async (resolvedVendorId) => {
      try {
        const response = await fetch(`https://ceo-api.yogiyo.co.kr/vendor/${resolvedVendorId}/reviews/v2/`, {
          method: 'GET',
          credentials: 'include'
        });
        return {
          ok: response.ok,
          status: response.status,
          url: response.url,
          payload: await response.json().catch(() => null)
        };
      } catch (error) {
        return {
          ok: false,
          status: 0,
          url: `https://ceo-api.yogiyo.co.kr/vendor/${resolvedVendorId}/reviews/v2/`,
          error: error.message
        };
      }
    }, vendorId);

    if (manualFetch?.ok) {
      const reviews = extractYogiyoReviewsFromPayload(manualFetch.payload, storeId);
      if (reviews.length > 0) {
        return {
          reviews,
          source: manualFetch.url,
          vendorId,
          observedUrls
        };
      }
    }
  }

  return {
    reviews: [],
    source: '',
    vendorId,
    observedUrls
  };
}

// ============================================================
//  CORE CRAWLING FUNCTIONS
// ============================================================

/**
 * 플랫폼 로그인
 */
async function loginPlatform(platform, storeId, credentials) {
  const config = PLATFORMS[platform];
  if (!config) throw new Error(`Unsupported platform: ${platform}`);
  const normalizedStoreId = normalizeStoreId(storeId);
  const sessionKey = getSessionKey(platform, normalizedStoreId);

  if (CRAWLER_TEST_MODE) {
    platformSessions.set(sessionKey, {
      browser: null,
      context: null,
      page: null,
      platform,
      storeId: normalizedStoreId,
      sessionKey,
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

  const session = await getContext(platform, normalizedStoreId, { fresh: true });
  const { page } = session;

  try {
    console.log(`[${config.name}] 로그인 시도...`);

    await openLoginSurface(platform, page, config);

    const usernameField = await findLoginField(
      page,
      config.selectors.loginEmail,
      [
        'input:not([type="hidden"]):not([type="password"]):not([type="checkbox"]):not([type="radio"]):not([disabled])',
        'textarea:not([disabled])'
      ],
      25000
    );
    await usernameField.locator.fill(credentials.email);

    let passwordField = await probeVisibleSelectorInFrames(page, config.selectors.loginPassword, 3000);
    if (!passwordField) {
      const nextButton = await probeVisibleSelectorInFrames(page, config.selectors.loginButton, 3000);
      if (nextButton) {
        await nextButton.locator.click().catch(() => {});
        await page.waitForTimeout(1500);
      }

      passwordField = await findLoginField(
        page,
        config.selectors.loginPassword,
        ['input[type="password"]:not([disabled])'],
        12000
      );
    }
    await passwordField.locator.fill(credentials.password);

    const loginButton = await findLoginField(
      page,
      config.selectors.loginButton,
      ['button[type="submit"]', 'input[type="submit"]', 'button', '[role="button"]'],
      10000
    );
    await loginButton.locator.click();

    await page.waitForNavigation({ timeout: 15000 }).catch(() => {});
    await page.waitForLoadState('domcontentloaded').catch(() => {});
    await page.waitForTimeout(3000);

    const currentUrl = page.url();
    session.loggedIn = isLoginSuccessUrl(platform, currentUrl);
    session.lastActivity = Date.now();

    console.log(`[${config.name}] 로그인 ${session.loggedIn ? '성공' : '실패'}: ${currentUrl}`);

    if (!session.loggedIn) {
      const diagnostics = await getPageDiagnostics(page);
      const failureMessage = deriveLoginFailureMessage(platform, currentUrl, diagnostics);
      console.warn(`[${config.name}] 로그인 실패 진단: ${formatPageDiagnostics(diagnostics)}`);
      await closePlatformSession(platform, normalizedStoreId);

      return {
        success: false,
        platform,
        message: failureMessage
      };
    }

    await persistPlatformSessionState(session).catch((persistError) => {
      console.warn(`[${config.name}] 세션 상태 저장 실패: ${persistError.message}`);
    });

    return {
      success: session.loggedIn,
      platform,
      message: '로그인 성공'
    };
  } catch (error) {
    const currentUrl = page.url();
    const diagnostics = await getPageDiagnostics(page);
    const failureMessage = deriveLoginFailureMessage(platform, currentUrl, diagnostics);
    console.error(
      `[${config.name}] 로그인 에러:`,
      error.message,
      currentUrl,
      formatPageDiagnostics(diagnostics)
    );
    session.loggedIn = false;
    await closePlatformSession(platform, normalizedStoreId);
    return {
      success: false,
      platform,
      message: `${failureMessage}${failureMessage.includes(error.message) ? '' : ` / 원본: ${error.message}`}`
    };
  }
}

/**
 * 리뷰 수집
 */
async function fetchReviews(platform, storeId) {
  const config = PLATFORMS[platform];
  if (!config) throw new Error(`Unsupported platform: ${platform}`);
  const normalizedStoreId = normalizeStoreId(storeId);
  let session = platformSessions.get(getSessionKey(platform, normalizedStoreId));

  if (!isSessionActive(session) || !session?.loggedIn) {
    const restored = await restoreSavedPlatformSession(platform, normalizedStoreId);
    if (restored.success && restored.session) {
      session = restored.session;
    }
  }

  if (!isSessionActive(session) || !session?.loggedIn) {
    const savedSessionExists = await hasSavedSessionState(platform, normalizedStoreId).catch(() => false);
    return {
      success: false,
      platform,
      error: savedSessionExists
        ? '저장된 플랫폼 세션을 복원하지 못했습니다. 설정 화면에서 다시 인증해주세요.'
        : '플랫폼 운영 세션이 연결되어 있지 않습니다. 설정 화면에서 계정 연결을 다시 시도해주세요.',
      reviews: []
    };
  }

  if (CRAWLER_TEST_MODE) {
    console.log(`[${config.name}] 테스트 운영 모드 리뷰 수집`);
    return generateOperationalMockReviews(platform, storeId);
  }

  const { page } = session;
  
  try {
    console.log(`[${config.name}] 리뷰 페이지 접속...`);

    if (platform === 'yogiyo') {
      const apiResult = await collectYogiyoReviewsViaApi(page, normalizedStoreId, config.reviewUrl);
      if (apiResult.reviews.length > 0) {
        session.lastActivity = Date.now();
        console.log(
          `[${config.name}] ${apiResult.reviews.length}건의 리뷰 수집 완료 (API: ${apiResult.source || 'unknown'})`
        );
        return {
          success: true,
          platform,
          store_id: normalizedStoreId,
          reviews: apiResult.reviews,
          fetched_at: new Date().toISOString(),
          count: apiResult.reviews.length
        };
      }

      console.warn(
        `[${config.name}] API 리뷰 응답에서 데이터를 찾지 못했습니다. DOM fallback 시도`,
        {
          vendorId: apiResult.vendorId || null,
          observedUrls: apiResult.observedUrls
        }
      );
    } else {
      const apiResult = await collectObservedReviewApi(page, platform, normalizedStoreId, config.reviewUrl);
      if (apiResult.reviews.length > 0) {
        session.lastActivity = Date.now();
        console.log(
          `[${config.name}] ${apiResult.reviews.length}건의 리뷰 수집 완료 (API: ${apiResult.source || 'unknown'})`
        );
        return {
          success: true,
          platform,
          store_id: normalizedStoreId,
          reviews: apiResult.reviews,
          fetched_at: new Date().toISOString(),
          count: apiResult.reviews.length
        };
      }

      console.warn(
        `[${config.name}] API 리뷰 응답에서 데이터를 찾지 못했습니다. DOM fallback 시도`,
        { observedUrls: apiResult.observedUrls }
      );

      await page.goto(config.reviewUrl, { waitUntil: 'networkidle', timeout: 30000 });
    }
    
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
      store_id: normalizedStoreId,
      reviews,
      fetched_at: new Date().toISOString(),
      count: reviews.length
    };
  } catch (error) {
    const diagnostics = await getPageDiagnostics(page);
    console.error(
      `[${config.name}] 리뷰 수집 에러:`,
      error.message,
      page.url(),
      formatPageDiagnostics(diagnostics)
    );
    await closePlatformSession(platform, normalizedStoreId);
    return {
      success: false,
      platform,
      error: `${error.message} (${page.url()})`,
      reviews: []
    };
  }
}

/**
 * 답변 게시
 */
async function postReply(platform, storeId, reviewId, replyText) {
  const config = PLATFORMS[platform];
  if (!config) throw new Error(`Unsupported platform: ${platform}`);
  const normalizedStoreId = normalizeStoreId(storeId);
  let session = platformSessions.get(getSessionKey(platform, normalizedStoreId));
  
  if (!isSessionActive(session) || !session?.loggedIn) {
    const restored = await restoreSavedPlatformSession(platform, normalizedStoreId);
    if (restored.success && restored.session) {
      session = restored.session;
    }
  }

  if (!isSessionActive(session) || !session?.loggedIn) {
    console.log(`[${config.name}] 운영 세션이 없어 답변 게시를 중단합니다. (review: ${reviewId})`);
    return {
      success: false,
      platform,
      review_id: reviewId,
      error: '플랫폼 운영 세션이 연결되어 있지 않습니다. 설정 화면에서 계정 연결을 다시 시도해주세요.'
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
    await closePlatformSession(platform, normalizedStoreId);
    return {
      success: false,
      platform,
      review_id: reviewId,
      error: error.message
    };
  }
}

// ============================================================
//  TEST DATA GENERATOR
// ============================================================
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
  for (const [sessionKey, session] of platformSessions) {
    sessions[sessionKey] = {
      platform: session.platform,
      storeId: session.storeId,
      loggedIn: session.loggedIn,
      lastActivity: session.lastActivity ? new Date(session.lastActivity).toISOString() : null
    };
  }
  
  res.json({
    status: 'ok',
    mode: CRAWLER_TEST_MODE ? 'test' : 'live',
    uptime: process.uptime(),
    timestamp: new Date().toISOString(),
    fonts: FONT_STATUS,
    browser: Array.from(platformSessions.values()).some((session) => isSessionActive(session)) ? 'connected' : 'disconnected',
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
  const { platform, store_id, email, password } = req.body;
  
  if (!platform || !PLATFORMS[platform]) {
    return res.status(400).json({ error: 'Invalid platform', supported: Object.keys(PLATFORMS) });
  }
  if (!email || !password) {
    return res.status(400).json({ error: 'Email and password required' });
  }

  try {
    const result = await loginPlatform(platform, store_id || 1, { email, password });
    res.json(result);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.post('/remote-auth/start', async (req, res) => {
  const { platform, store_id } = req.body || {};

  if (!platform || !PLATFORMS[platform]) {
    return res.status(400).json({ error: 'Invalid platform', supported: Object.keys(PLATFORMS) });
  }

  try {
    const normalizedStoreId = normalizeStoreId(store_id);
    const session = await getContext(platform, normalizedStoreId, { fresh: true });
    await openLoginSurface(platform, session.page, PLATFORMS[platform]);
    session.loggedIn = false;
    session.lastActivity = Date.now();

    const sessionId = createRemoteAuthSessionId();
    const remoteSession = {
      sessionId,
      platform,
      storeId: normalizedStoreId,
      sessionKey: session.sessionKey,
      createdAt: Date.now(),
      updatedAt: Date.now(),
      status: 'auth_in_progress',
      lastError: null
    };
    remoteAuthSessions.set(sessionId, remoteSession);
    prewarmRemoteAuthScreenshot(session, 0);

    const snapshot = await getRemoteAuthSnapshot(remoteSession);
    res.json({
      success: true,
      session_id: sessionId,
      platform,
      ...snapshot
    });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

app.get('/remote-auth/:sessionId/status', async (req, res) => {
  const remoteSession = remoteAuthSessions.get(req.params.sessionId);
  if (!remoteSession) {
    return res.status(404).json({ success: false, error: '원격 인증 세션을 찾을 수 없습니다.' });
  }

  try {
    const snapshot = await getRemoteAuthSnapshot(remoteSession);
    res.status(snapshot.success ? 200 : 410).json({
      success: snapshot.success,
      session_id: remoteSession.sessionId,
      platform: remoteSession.platform,
      ...snapshot
    });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

app.get('/remote-auth/:sessionId/screenshot', async (req, res) => {
  const remoteSession = remoteAuthSessions.get(req.params.sessionId);
  if (!remoteSession) {
    return res.status(404).json({ error: '원격 인증 세션을 찾을 수 없습니다.' });
  }

  const session = platformSessions.get(remoteSession.sessionKey);
  if (!isSessionActive(session)) {
    return res.status(410).json({ error: '원격 인증 세션이 종료되었습니다.' });
  }

  try {
    const image = await captureRemoteAuthScreenshot(session);
    res.setHeader('Content-Type', 'image/png');
    res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
    res.end(image);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.post('/remote-auth/:sessionId/action', async (req, res) => {
  const remoteSession = remoteAuthSessions.get(req.params.sessionId);
  if (!remoteSession) {
    return res.status(404).json({ success: false, error: '원격 인증 세션을 찾을 수 없습니다.' });
  }

  const session = platformSessions.get(remoteSession.sessionKey);
  if (!isSessionActive(session)) {
    await cleanupRemoteAuthSession(req.params.sessionId);
    return res.status(410).json({ success: false, error: '원격 인증 세션이 종료되었습니다.' });
  }

  const { action, x, y, text, key, deltaY, url, ms } = req.body || {};

  try {
    if (action === 'click') {
      await session.page.mouse.click(Number(x || 0), Number(y || 0));
    } else if (action === 'type') {
      const nextText = String(text || '');
      if (nextText) {
        try {
          await session.page.keyboard.insertText(nextText);
        } catch (insertError) {
          await session.page.keyboard.type(nextText, { delay: REMOTE_AUTH_TYPING_DELAY_MS });
        }
      }
    } else if (action === 'press') {
      await session.page.keyboard.press(String(key || 'Enter'));
    } else if (action === 'scroll') {
      await session.page.mouse.wheel(0, Number(deltaY || 600));
    } else if (action === 'reload') {
      await session.page.reload({ waitUntil: 'domcontentloaded', timeout: 30000 }).catch(() => {});
    } else if (action === 'back') {
      await session.page.goBack({ waitUntil: 'domcontentloaded', timeout: 30000 }).catch(() => {});
    } else if (action === 'goto' && url) {
      await session.page.goto(String(url), { waitUntil: 'domcontentloaded', timeout: 30000 });
    } else if (action === 'wait') {
      await session.page.waitForTimeout(Math.max(200, Math.min(Number(ms || 800), 5000)));
    } else {
      return res.status(400).json({ success: false, error: '지원하지 않는 원격 인증 액션입니다.' });
    }

    const settleMs = getRemoteAuthActionSettleMs(action);
    if (settleMs > 0) {
      await session.page.waitForTimeout(settleMs);
    }

    session.lastActivity = Date.now();
    session.screenshotDirty = true;
    prewarmRemoteAuthScreenshot(session);
    res.json({
      success: true,
      session_id: remoteSession.sessionId,
      platform: remoteSession.platform,
      action,
      acknowledged: true
    });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

app.post('/remote-auth/:sessionId/complete', async (req, res) => {
  const remoteSession = remoteAuthSessions.get(req.params.sessionId);
  if (!remoteSession) {
    return res.status(404).json({ success: false, error: '원격 인증 세션을 찾을 수 없습니다.' });
  }

  const session = platformSessions.get(remoteSession.sessionKey);
  if (!isSessionActive(session)) {
    await cleanupRemoteAuthSession(req.params.sessionId);
    return res.status(410).json({ success: false, error: '원격 인증 세션이 종료되었습니다.' });
  }

  try {
    const snapshot = await getRemoteAuthSnapshot(remoteSession);
    if (!snapshot.can_complete) {
      return res.status(400).json({
        success: false,
        error: snapshot.message || '아직 인증 완료 상태로 확인되지 않았습니다. 운영 화면까지 진행한 뒤 다시 시도해주세요.'
      });
    }

    session.loggedIn = true;
    session.lastActivity = Date.now();
    remoteSession.status = 'connected';
    remoteSession.updatedAt = Date.now();

    let persistenceWarning = null;
    await persistPlatformSessionState(session).catch((error) => {
      persistenceWarning = `세션 저장 경고: ${error.message}`;
      console.warn(`[${remoteSession.platform}] ${persistenceWarning}`);
    });

    res.json({
      success: true,
      platform: remoteSession.platform,
      store_id: remoteSession.storeId,
      message: '원격 인증 세션이 연결되었습니다.',
      warning: persistenceWarning
    });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

app.post('/remote-auth/:sessionId/cancel', async (req, res) => {
  const remoteSession = remoteAuthSessions.get(req.params.sessionId);
  if (!remoteSession) {
    return res.status(404).json({ success: false, error: '원격 인증 세션을 찾을 수 없습니다.' });
  }

  await cleanupRemoteAuthSession(req.params.sessionId, { closeBrowser: true });
  res.json({ success: true, message: '원격 인증 세션을 종료했습니다.' });
});

// 리뷰 수집
app.post('/fetch-reviews', async (req, res) => {
  const { platform, store_id } = req.body;
  
  if (!platform || !PLATFORMS[platform]) {
    return res.status(400).json({ error: 'Invalid platform', supported: Object.keys(PLATFORMS) });
  }

  const jobId = `fetch_${platform}_${Date.now()}`;
  const job = { id: jobId, type: 'fetch', platform, store_id, status: 'running', started_at: new Date().toISOString() };
  crawlJobs.push(job);

  try {
    const result = await fetchReviews(platform, store_id || 1);
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
  const { store_id } = req.body;
  const results = {};

  for (const platform of Object.keys(PLATFORMS)) {
    try {
      results[platform] = await fetchReviews(platform, store_id || 1);
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
  const { platform, store_id, review_id, reply_text } = req.body;
  
  if (!platform || !review_id || !reply_text) {
    return res.status(400).json({ error: 'platform, review_id, reply_text required' });
  }

  try {
    const result = await postReply(platform, store_id || 1, review_id, reply_text);
    res.json(result);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// 세션 상태
app.get('/sessions', async (req, res) => {
  const requestedPlatform = req.query.platform;
  const requestedStoreId = req.query.store_id ? normalizeStoreId(req.query.store_id) : null;
  const shouldRestore = req.query.restore === '1' || req.query.restore === 'true';
  const sessions = {};
  for (const [sessionKey, session] of platformSessions) {
    if (requestedPlatform && session.platform !== requestedPlatform) continue;
    if (requestedStoreId && session.storeId !== requestedStoreId) continue;

    sessions[sessionKey] = serializePlatformSession(session);
  }

  let directSession = requestedPlatform && requestedStoreId
    ? sessions[getSessionKey(requestedPlatform, requestedStoreId)] || null
    : null;
  let message = directSession ? '활성 세션을 찾았습니다.' : '일치하는 활성 세션이 없습니다.';
  let savedStateAvailable = false;

  if (requestedPlatform && requestedStoreId) {
    savedStateAvailable = await hasSavedSessionState(requestedPlatform, requestedStoreId).catch(() => false);

    if (!directSession && savedStateAvailable && shouldRestore) {
      const restored = await restoreSavedPlatformSession(requestedPlatform, requestedStoreId);
      message = restored.message || message;
      if (restored.success && restored.session) {
        const sessionKey = getSessionKey(requestedPlatform, requestedStoreId);
        sessions[sessionKey] = serializePlatformSession(restored.session);
        directSession = sessions[sessionKey];
      }
    }
  }

  res.json({
    sessions,
    session: directSession,
    saved_state_available: savedStateAvailable,
    message: directSession ? message : message
  });
});

app.post('/sessions/clear', async (req, res) => {
  const { platform, store_id } = req.body || {};

  if (!platform || !PLATFORMS[platform]) {
    return res.status(400).json({ success: false, error: 'Invalid platform', supported: Object.keys(PLATFORMS) });
  }

  const normalizedStoreId = normalizeStoreId(store_id);
  await deleteSavedSessionState(platform, normalizedStoreId).catch(() => {});
  await closePlatformSession(platform, normalizedStoreId).catch(() => {});

  res.json({
    success: true,
    platform,
    store_id: normalizedStoreId,
    message: '저장된 플랫폼 세션과 활성 브라우저를 정리했습니다.'
  });
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
    sessions: Array.from(platformSessions.values())
      .filter((session) => session.platform === key)
      .map((session) => ({
        storeId: session.storeId,
        loggedIn: session.loggedIn,
        lastActivity: session.lastActivity
      }))
  }));
  res.json({ platforms });
});

// 리뷰를 웹앱 DB에 동기화
app.post('/sync-to-webapp', async (req, res) => {
  const { platform, store_id } = req.body;
  
  try {
    // 1. 리뷰 수집
    const fetchResult = await fetchReviews(platform || 'baemin', store_id || 1);
    
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
        const result = await fetchReviews(platform, 1);
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
  for (const session of Array.from(platformSessions.values())) {
    await closePlatformSession(session.platform, session.storeId);
  }
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
