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

const PORT = process.env.PORT || process.env.CRAWLER_PORT || 4000;
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

async function closePlatformSession(platform) {
  const session = platformSessions.get(platform);
  if (!session) return;

  platformSessions.delete(platform);

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

async function createPlatformSession(platform) {
  const browser = await chromium.launch({
    headless: true,
    chromiumSandbox: false,
    args: launchArgs
  });

  browser.on('disconnected', () => {
    const current = platformSessions.get(platform);
    if (current && current.browser === browser) {
      platformSessions.delete(platform);
    }
  });

  const context = await browser.newContext({
    userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
    viewport: { width: 1280, height: 720 },
    locale: 'ko-KR',
    extraHTTPHeaders: {
      'Accept-Language': 'ko-KR,ko;q=0.9,en-US;q=0.8,en;q=0.7'
    }
  });

  const page = await context.newPage();
  page.setDefaultTimeout(15000);
  page.setDefaultNavigationTimeout(30000);

  const sessionData = { browser, context, page, loggedIn: false, lastActivity: Date.now() };
  platformSessions.set(platform, sessionData);
  return sessionData;
}

async function getContext(platform, options = {}) {
  const { fresh = false } = options;
  const existing = platformSessions.get(platform);

  if (fresh && existing) {
    await closePlatformSession(platform);
  } else if (isSessionActive(existing)) {
    return existing;
  } else if (existing) {
    await closePlatformSession(platform);
  }

  return createPlatformSession(platform);
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

  const session = await getContext(platform, { fresh: true });
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
      await closePlatformSession(platform);

      return {
        success: false,
        platform,
        message: failureMessage
      };
    }

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
    await closePlatformSession(platform);
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
async function fetchReviews(platform, storeId, options = {}) {
  const config = PLATFORMS[platform];
  if (!config) throw new Error(`Unsupported platform: ${platform}`);

  const session = platformSessions.get(platform);
  
  // 데모 모드: 실제 크롤링 없이 시뮬레이션 데이터 반환
  if (options.demo) {
    console.log(`[${config.name}] 데모 모드로 리뷰 수집 시뮬레이션`);
    return generateDemoReviews(platform, storeId);
  }

  if (!isSessionActive(session) || !session?.loggedIn) {
    return {
      success: false,
      platform,
      error: '플랫폼 운영 세션이 연결되어 있지 않습니다. 설정 화면에서 계정 연결을 다시 시도해주세요.',
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
      const apiResult = await collectYogiyoReviewsViaApi(page, storeId, config.reviewUrl);
      if (apiResult.reviews.length > 0) {
        session.lastActivity = Date.now();
        console.log(
          `[${config.name}] ${apiResult.reviews.length}건의 리뷰 수집 완료 (API: ${apiResult.source || 'unknown'})`
        );
        return {
          success: true,
          platform,
          store_id: storeId,
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
      const apiResult = await collectObservedReviewApi(page, platform, storeId, config.reviewUrl);
      if (apiResult.reviews.length > 0) {
        session.lastActivity = Date.now();
        console.log(
          `[${config.name}] ${apiResult.reviews.length}건의 리뷰 수집 완료 (API: ${apiResult.source || 'unknown'})`
        );
        return {
          success: true,
          platform,
          store_id: storeId,
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
      store_id: storeId,
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
    await closePlatformSession(platform);
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
async function postReply(platform, reviewId, replyText) {
  const config = PLATFORMS[platform];
  if (!config) throw new Error(`Unsupported platform: ${platform}`);

  const session = platformSessions.get(platform);
  
  // 데모 모드
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
    await closePlatformSession(platform);
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
  for (const platform of Array.from(platformSessions.keys())) {
    await closePlatformSession(platform);
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
