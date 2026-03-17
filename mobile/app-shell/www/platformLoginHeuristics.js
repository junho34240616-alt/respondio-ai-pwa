function normalizeText(value) {
  return String(value || '')
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim();
}

function normalizeUrl(value) {
  const raw = String(value || '').trim();
  if (!raw) {
    return '';
  }

  try {
    return new URL(raw).toString().toLowerCase();
  } catch {
    return raw.toLowerCase();
  }
}

function containsAny(text, patterns) {
  return patterns.some((pattern) => text.includes(pattern));
}

export function shouldAutoSubmitOutcome(outcome) {
  if (!outcome || !outcome.sessionStatus) {
    return false;
  }

  if (!['connected', 'error', 'expired'].includes(outcome.sessionStatus)) {
    return false;
  }

  return Number(outcome.confidence || 0) >= 0.85;
}

function makeOutcome({
  decision,
  sessionStatus = null,
  reason,
  confidence,
  nextAction = 'wait',
  evidence = []
}) {
  const outcome = {
    decision,
    sessionStatus,
    reason,
    confidence,
    nextAction,
    evidence
  };

  outcome.autoSubmit = shouldAutoSubmitOutcome(outcome);
  return outcome;
}

const GENERIC_BLOCKED_PATTERNS = [
  'access denied',
  'you don\'t have permission',
  'forbidden',
  'request blocked',
  'bot detected',
  '서비스 이용이 제한',
  '접근이 거부',
  '권한이 없습니다'
];

const GENERIC_EXPIRED_PATTERNS = [
  'session expired',
  '로그아웃',
  '다시 로그인',
  '세션이 만료',
  '인증이 만료',
  'login again'
];

const GENERIC_INVALID_PATTERNS = [
  '비밀번호를 다시 확인',
  '아이디를 다시 확인',
  '아이디 또는 비밀번호',
  '잘못 입력',
  'incorrect password',
  'invalid password',
  'invalid username',
  'wrong password'
];

const GENERIC_USER_ACTION_PATTERNS = [
  'captcha',
  '자동입력 방지',
  '보안문자',
  'qr코드',
  'qr code',
  '본인 인증',
  '추가 인증',
  '2차 인증',
  '인증번호',
  'otp',
  '일회용 번호',
  '새로운 환경',
  '휴대폰 인증'
];

function detectGenericOutcome(signals) {
  const combinedText = [signals.title, signals.bodyText].filter(Boolean).join(' ');

  if (containsAny(combinedText, GENERIC_EXPIRED_PATTERNS)) {
    return makeOutcome({
      decision: 'expired',
      sessionStatus: 'expired',
      reason: '플랫폼 세션이 만료된 것으로 보입니다. 다시 로그인 흐름이 필요합니다.',
      confidence: 0.92,
      nextAction: 'relogin',
      evidence: ['generic:expired']
    });
  }

  if (containsAny(combinedText, GENERIC_BLOCKED_PATTERNS)) {
    return makeOutcome({
      decision: 'blocked',
      sessionStatus: 'error',
      reason: '플랫폼이 현재 환경의 접근을 차단한 것으로 보입니다.',
      confidence: 0.94,
      nextAction: 'manual_review',
      evidence: ['generic:blocked']
    });
  }

  return null;
}

function detectBaemin(signals) {
  const combinedText = [signals.title, signals.bodyText].filter(Boolean).join(' ');

  if (
    signals.url.includes('self.baemin.com') &&
    !signals.url.includes('/login') &&
    !signals.url.includes('/bridge') &&
    !signals.url.includes('nid.naver.com')
  ) {
    return makeOutcome({
      decision: 'connected',
      sessionStatus: 'connected',
      reason: '배달의민족 사장님 사이트 내부 페이지로 이동했습니다.',
      confidence: 0.96,
      nextAction: 'continue',
      evidence: ['baemin:internal-page']
    });
  }

  if (containsAny(combinedText, GENERIC_INVALID_PATTERNS)) {
    return makeOutcome({
      decision: 'invalid_credentials',
      sessionStatus: 'error',
      reason: '배달의민족 로그인 정보가 맞지 않거나 보안문자를 잘못 입력한 것으로 보입니다.',
      confidence: 0.92,
      nextAction: 'retry',
      evidence: ['baemin:invalid-credentials']
    });
  }

  if (
    signals.url.includes('nid.naver.com/nidlogin.login') ||
    containsAny(combinedText, GENERIC_USER_ACTION_PATTERNS) ||
    containsAny(combinedText, ['naver id', '전화번호', '일회용 번호'])
  ) {
    return makeOutcome({
      decision: 'needs_user_action',
      reason: '네이버 로그인 추가 인증 또는 CAPTCHA 해결이 필요합니다.',
      confidence: 0.9,
      nextAction: 'user_action',
      evidence: ['baemin:naver-auth']
    });
  }

  if (signals.url.includes('self.baemin.com/login') || signals.url.includes('self.baemin.com/bridge')) {
    return makeOutcome({
      decision: 'loading',
      reason: '배달의민족 로그인 화면 또는 브리지 화면을 불러오는 중입니다.',
      confidence: 0.72,
      nextAction: 'wait',
      evidence: ['baemin:login-loading']
    });
  }

  return makeOutcome({
    decision: 'unknown',
    reason: '배달의민족 로그인 상태를 아직 확정하기 어렵습니다.',
    confidence: 0.35,
    nextAction: 'wait',
    evidence: ['baemin:unknown']
  });
}

function detectCoupang(signals) {
  const combinedText = [signals.title, signals.bodyText].filter(Boolean).join(' ');

  if (containsAny(combinedText, GENERIC_BLOCKED_PATTERNS) || signals.url.includes('errors.edgesuite.net')) {
    return makeOutcome({
      decision: 'blocked',
      sessionStatus: 'error',
      reason: '쿠팡이츠가 현재 접속 환경을 차단한 것으로 보입니다.',
      confidence: 0.96,
      nextAction: 'manual_review',
      evidence: ['coupang:block']
    });
  }

  if (
    signals.url.includes('store.coupangeats.com') &&
    !signals.url.includes('/login') &&
    !containsAny(combinedText, ['access denied', 'permission'])
  ) {
    return makeOutcome({
      decision: 'connected',
      sessionStatus: 'connected',
      reason: '쿠팡이츠 내부 운영 페이지로 이동했습니다.',
      confidence: 0.9,
      nextAction: 'continue',
      evidence: ['coupang:internal-page']
    });
  }

  if (containsAny(combinedText, GENERIC_INVALID_PATTERNS)) {
    return makeOutcome({
      decision: 'invalid_credentials',
      sessionStatus: 'error',
      reason: '쿠팡이츠 로그인 정보가 올바르지 않은 것으로 보입니다.',
      confidence: 0.9,
      nextAction: 'retry',
      evidence: ['coupang:invalid-credentials']
    });
  }

  if (containsAny(combinedText, GENERIC_USER_ACTION_PATTERNS)) {
    return makeOutcome({
      decision: 'needs_user_action',
      reason: '쿠팡이츠 로그인 과정에서 추가 인증을 기다리고 있습니다.',
      confidence: 0.82,
      nextAction: 'user_action',
      evidence: ['coupang:user-action']
    });
  }

  if (signals.url.includes('store.coupangeats.com/login')) {
    return makeOutcome({
      decision: 'loading',
      reason: '쿠팡이츠 로그인 화면을 불러오는 중입니다.',
      confidence: 0.72,
      nextAction: 'wait',
      evidence: ['coupang:login-loading']
    });
  }

  return makeOutcome({
    decision: 'unknown',
    reason: '쿠팡이츠 로그인 상태를 아직 확정하기 어렵습니다.',
    confidence: 0.35,
    nextAction: 'wait',
    evidence: ['coupang:unknown']
  });
}

function detectYogiyo(signals) {
  const combinedText = [signals.title, signals.bodyText].filter(Boolean).join(' ');

  if (signals.url.includes('ceo.yogiyo.co.kr') && !signals.url.includes('/login')) {
    return makeOutcome({
      decision: 'connected',
      sessionStatus: 'connected',
      reason: '요기요 사장님 사이트 내부 페이지로 이동했습니다.',
      confidence: 0.95,
      nextAction: 'continue',
      evidence: ['yogiyo:internal-page']
    });
  }

  if (containsAny(combinedText, GENERIC_INVALID_PATTERNS)) {
    return makeOutcome({
      decision: 'invalid_credentials',
      sessionStatus: 'error',
      reason: '요기요 로그인 정보가 올바르지 않은 것으로 보입니다.',
      confidence: 0.88,
      nextAction: 'retry',
      evidence: ['yogiyo:invalid-credentials']
    });
  }

  if (containsAny(combinedText, GENERIC_USER_ACTION_PATTERNS)) {
    return makeOutcome({
      decision: 'needs_user_action',
      reason: '요기요 로그인 과정에서 추가 인증을 기다리고 있습니다.',
      confidence: 0.82,
      nextAction: 'user_action',
      evidence: ['yogiyo:user-action']
    });
  }

  if (signals.url.includes('ceo.yogiyo.co.kr/login')) {
    return makeOutcome({
      decision: 'loading',
      reason: '요기요 로그인 화면을 불러오는 중입니다.',
      confidence: 0.72,
      nextAction: 'wait',
      evidence: ['yogiyo:login-loading']
    });
  }

  return makeOutcome({
    decision: 'unknown',
    reason: '요기요 로그인 상태를 아직 확정하기 어렵습니다.',
    confidence: 0.35,
    nextAction: 'wait',
    evidence: ['yogiyo:unknown']
  });
}

export function detectPlatformLoginOutcome({ platform, url, title, bodyText }) {
  const signals = {
    url: normalizeUrl(url),
    title: normalizeText(title),
    bodyText: normalizeText(bodyText)
  };

  const genericOutcome = detectGenericOutcome(signals);
  if (genericOutcome) {
    return genericOutcome;
  }

  if (platform === 'baemin') {
    return detectBaemin(signals);
  }

  if (platform === 'coupang_eats') {
    return detectCoupang(signals);
  }

  if (platform === 'yogiyo') {
    return detectYogiyo(signals);
  }

  return makeOutcome({
    decision: 'unknown',
    reason: '지원되지 않는 플랫폼입니다.',
    confidence: 0.1,
    nextAction: 'manual_review',
    evidence: ['platform:unsupported']
  });
}

export function formatOutcomeSummary(outcome) {
  if (!outcome) {
    return '아직 로그인 진단 정보가 없습니다.';
  }

  return `${outcome.decision} · ${outcome.reason}`;
}

export function buildSessionResultPayload(activeRequest, statusOrOutcome, overrides = {}) {
  const outcome = typeof statusOrOutcome === 'string'
    ? { sessionStatus: statusOrOutcome }
    : (statusOrOutcome || {});
  const sessionStatus = overrides.sessionStatus || outcome.sessionStatus || 'error';
  const lastError = overrides.lastError !== undefined
    ? overrides.lastError
    : sessionStatus === 'connected'
      ? null
      : outcome.reason || (
        sessionStatus === 'expired'
          ? '모바일 직접 로그인 세션이 만료되었습니다.'
          : '모바일 직접 로그인에 실패했습니다.'
      );

  return {
    type: 'respondio_session_result',
    platform: activeRequest?.platform,
    platformStoreId: overrides.platformStoreId ?? activeRequest?.platformStoreId ?? null,
    sessionStatus,
    lastError
  };
}
