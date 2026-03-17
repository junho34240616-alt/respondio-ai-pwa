import { buildSessionResultPayload } from './platformLoginHeuristics.js';

const frame = document.getElementById('session-center-frame');
const appBaseUrlInput = document.getElementById('app-base-url');
const openButton = document.getElementById('open-session-center-button');
const reloadButton = document.getElementById('reload-frame-button');
const emptyState = document.getElementById('empty-state');
const requestPanel = document.getElementById('request-panel');
const platformBadge = document.getElementById('platform-badge');
const storeIdText = document.getElementById('store-id-text');
const loginUrl = document.getElementById('login-url');
const reviewUrl = document.getElementById('review-url');
const eventLog = document.getElementById('event-log');
const openPlatformLoginButton = document.getElementById('open-platform-login-button');

let activeRequest = null;
let platformLoginWindow = null;
let popupMonitorTimer = null;

function trimTrailingSlash(value) {
  return String(value || '').replace(/\/$/, '');
}

function logEvent(message) {
  const item = document.createElement('div');
  item.className = 'log-entry';
  item.textContent = new Date().toLocaleTimeString('ko-KR') + ' · ' + message;
  eventLog.prepend(item);
}

function getSessionCenterUrl() {
  return trimTrailingSlash(appBaseUrlInput.value) + '/mobile/session-center';
}

function openSessionCenter() {
  const nextUrl = getSessionCenterUrl();
  frame.src = nextUrl;
  logEvent('세션 센터 로드: ' + nextUrl);
}

function renderRequest() {
  if (!activeRequest) {
    emptyState.classList.remove('hidden');
    requestPanel.classList.add('hidden');
    return;
  }

  emptyState.classList.add('hidden');
  requestPanel.classList.remove('hidden');
  platformBadge.textContent = activeRequest.platform;
  storeIdText.textContent = activeRequest.platformStoreId
    ? '매장 ID: ' + activeRequest.platformStoreId
    : '매장 ID 미입력';
  loginUrl.textContent = '로그인 URL: ' + activeRequest.loginUrl;
  reviewUrl.textContent = '리뷰 URL: ' + activeRequest.reviewUrl;
}

function isBridgeRequest(payload) {
  return payload && typeof payload === 'object' && payload.type === 'open_platform_login';
}

function postSessionResult(sessionStatus) {
  if (!activeRequest || !frame.contentWindow) {
    logEvent('세션 결과를 보낼 활성 요청이 없습니다.');
    return;
  }

  const payload = buildSessionResultPayload(activeRequest, sessionStatus);

  frame.contentWindow.postMessage(payload, '*');
  logEvent('세션 결과 전달: ' + activeRequest.platform + ' -> ' + sessionStatus);
}

function startPopupMonitor() {
  if (popupMonitorTimer) {
    window.clearInterval(popupMonitorTimer);
  }

  popupMonitorTimer = window.setInterval(() => {
    if (!platformLoginWindow) {
      return;
    }

    if (platformLoginWindow.closed) {
      window.clearInterval(popupMonitorTimer);
      popupMonitorTimer = null;
      platformLoginWindow = null;
      logEvent('로그인 창이 닫혔습니다. 브라우저 프로토타입에서는 자동 판별이 제한되므로 아래 상태 버튼으로 결과를 선택해 주세요.');
    }
  }, 1000);
}

function openPlatformLoginWindow() {
  if (!activeRequest || !activeRequest.loginUrl) {
    logEvent('열 수 있는 로그인 URL이 없습니다.');
    return;
  }

  platformLoginWindow = window.open(activeRequest.loginUrl, '_blank', 'noopener,noreferrer');
  logEvent('플랫폼 로그인 창 열기: ' + activeRequest.loginUrl);
  logEvent('참고: 브라우저 프로토타입은 크로스 도메인 제한 때문에 로그인 성공 여부를 자동 판별하지 못합니다. 실제 네이티브 WebView에서 자동 판별이 동작합니다.');
  startPopupMonitor();
}

window.addEventListener('message', (event) => {
  const payload = event.data;
  if (!isBridgeRequest(payload)) {
    return;
  }

  activeRequest = payload;
  renderRequest();
  logEvent('브리지 요청 수신: ' + payload.platform + ' (' + payload.loginUrl + ')');
});

openButton.addEventListener('click', openSessionCenter);
reloadButton.addEventListener('click', () => {
  if (frame.src) {
    frame.contentWindow.location.reload();
    logEvent('세션 센터 새로고침');
  } else {
    openSessionCenter();
  }
});

document.querySelectorAll('[data-state]').forEach((button) => {
  button.addEventListener('click', () => {
    postSessionResult(button.dataset.state);
  });
});

openPlatformLoginButton.addEventListener('click', openPlatformLoginWindow);

appBaseUrlInput.addEventListener('change', () => {
  localStorage.setItem('respondio_mobile_shell_base_url', appBaseUrlInput.value);
});

const savedBaseUrl = localStorage.getItem('respondio_mobile_shell_base_url');
if (savedBaseUrl) {
  appBaseUrlInput.value = savedBaseUrl;
}

openSessionCenter();
