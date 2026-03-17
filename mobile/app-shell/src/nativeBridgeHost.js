import {
  fetchMobileSessionConfig,
  prepareDirectSession,
  reportSessionState
} from './sessionStateClient.js';

export class RespondioNativeBridgeHost {
  constructor({ appBaseUrl, accessTokenProvider, webviewAdapter, onBridgeRequest }) {
    this.appBaseUrl = appBaseUrl;
    this.accessTokenProvider = accessTokenProvider;
    this.webviewAdapter = webviewAdapter;
    this.onBridgeRequest = onBridgeRequest || (() => {});
    this.activeRequest = null;
  }

  async getAccessToken() {
    if (typeof this.accessTokenProvider !== 'function') {
      return null;
    }

    return this.accessTokenProvider();
  }

  async loadPlatformConfig(platform) {
    const accessToken = await this.getAccessToken();
    return fetchMobileSessionConfig({
      appBaseUrl: this.appBaseUrl,
      accessToken,
      platform
    });
  }

  async preparePlatform(platform, platformStoreId) {
    const accessToken = await this.getAccessToken();
    return prepareDirectSession({
      appBaseUrl: this.appBaseUrl,
      accessToken,
      platform,
      platformStoreId
    });
  }

  async handleBridgePayload(rawPayload) {
    const payload = typeof rawPayload === 'string' ? JSON.parse(rawPayload) : rawPayload;
    this.activeRequest = payload;
    await this.onBridgeRequest(payload);
    return payload;
  }

  async report(platform, sessionStatus, options = {}) {
    const accessToken = await this.getAccessToken();
    return reportSessionState({
      appBaseUrl: this.appBaseUrl,
      accessToken,
      platform,
      sessionStatus,
      platformStoreId: options.platformStoreId || null,
      lastError: options.lastError ?? null
    });
  }

  dispatchSessionResult(payload) {
    if (!this.webviewAdapter) {
      throw new Error('webviewAdapter is required to post session results back to the session center.');
    }

    if (typeof this.webviewAdapter.postMessageToWebView === 'function') {
      this.webviewAdapter.postMessageToWebView(payload);
      return payload;
    }

    if (typeof this.webviewAdapter.injectJavaScript === 'function') {
      const script = `window.postMessage(${JSON.stringify(payload)}, '*'); true;`;
      this.webviewAdapter.injectJavaScript(script);
      return payload;
    }

    throw new Error('webviewAdapter.postMessageToWebView(...) or webviewAdapter.injectJavaScript(...) is required.');
  }

  attachToWebView() {
    if (!this.webviewAdapter || typeof this.webviewAdapter.setBridge !== 'function') {
      throw new Error('webviewAdapter.setBridge(...) is required.');
    }

    this.webviewAdapter.setBridge({
      postMessage: (payload) => this.handleBridgePayload(payload)
    });
  }
}
