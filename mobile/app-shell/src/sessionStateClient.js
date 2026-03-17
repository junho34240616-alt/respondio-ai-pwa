function trimTrailingSlash(value) {
  return String(value || '').replace(/\/$/, '');
}

function buildHeaders(accessToken, extraHeaders = {}) {
  const headers = { ...extraHeaders };
  if (accessToken) {
    headers.Authorization = `Bearer ${accessToken}`;
  }

  return headers;
}

async function readJsonResponse(response) {
  const text = await response.text();
  if (!text) {
    return {};
  }

  try {
    return JSON.parse(text);
  } catch (error) {
    throw new Error(`Invalid JSON response: ${text.slice(0, 180)}`);
  }
}

export async function fetchMobileSessionConfig({ appBaseUrl, accessToken, platform }) {
  const response = await fetch(
    `${trimTrailingSlash(appBaseUrl)}/api/v1/platform_connections/${platform}/mobile-session-config`,
    {
      credentials: 'include',
      headers: buildHeaders(accessToken)
    }
  );

  const data = await readJsonResponse(response);
  if (!response.ok || data?.error) {
    throw new Error(data?.error?.message || '모바일 세션 설정을 불러오지 못했습니다.');
  }

  return data;
}

export async function prepareDirectSession({ appBaseUrl, accessToken, platform, platformStoreId }) {
  const response = await fetch(
    `${trimTrailingSlash(appBaseUrl)}/api/v1/platform_connections/${platform}/connect`,
    {
      method: 'POST',
      credentials: 'include',
      headers: buildHeaders(accessToken, {
        'Content-Type': 'application/json'
      }),
      body: JSON.stringify({
        auth_mode: 'direct_session',
        platform_store_id: platformStoreId || null
      })
    }
  );

  const data = await readJsonResponse(response);
  if (!response.ok || data?.error) {
    throw new Error(data?.error?.message || '직접 로그인 세션 준비에 실패했습니다.');
  }

  return data;
}

export async function reportSessionState({
  appBaseUrl,
  accessToken,
  platform,
  sessionStatus,
  platformStoreId,
  lastError
}) {
  const response = await fetch(
    `${trimTrailingSlash(appBaseUrl)}/api/v1/platform_connections/${platform}/session-state`,
    {
      method: 'POST',
      credentials: 'include',
      headers: buildHeaders(accessToken, {
        'Content-Type': 'application/json'
      }),
      body: JSON.stringify({
        session_status: sessionStatus,
        platform_store_id: platformStoreId || null,
        last_error: lastError ?? null
      })
    }
  );

  const data = await readJsonResponse(response);
  if (!response.ok || data?.error) {
    throw new Error(data?.error?.message || '세션 상태 보고에 실패했습니다.');
  }

  return data;
}
