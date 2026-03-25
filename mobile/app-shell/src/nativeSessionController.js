import { RespondioNativeBridgeHost } from './nativeBridgeHost.js';
import { buildSessionResultPayload } from '../www/platformLoginHeuristics.js';

export class NativeSessionController {
  constructor({ appBaseUrl, accessTokenProvider, webviewAdapter, openLoginView, onStateChange }) {
    this.host = new RespondioNativeBridgeHost({
      appBaseUrl,
      accessTokenProvider,
      webviewAdapter,
      onBridgeRequest: async (payload) => {
        this.activeRequest = payload;
        if (typeof openLoginView === 'function') {
          await openLoginView(payload);
        }
      }
    });
    this.openLoginView = openLoginView || (() => {});
    this.onStateChange = onStateChange || (() => {});
    this.activeRequest = null;
  }

  attach() {
    this.host.attachToWebView();
  }

  async beginDirectLogin(platform, platformStoreId) {
    await this.host.preparePlatform(platform, platformStoreId);
    const config = await this.host.loadPlatformConfig(platform);
    await this.host.handleBridgePayload(config.bridge_message);
    return config;
  }

  async markConnected(platform, platformStoreId) {
    const result = this.host.dispatchSessionResult(
      buildSessionResultPayload(this.activeRequest || { platform, platformStoreId }, 'connected')
    );
    await this.onStateChange({
      platform,
      sessionStatus: 'connected',
      platformStoreId,
      result
    });
    return result;
  }

  async markFailed(platform, platformStoreId, lastError) {
    const result = this.host.dispatchSessionResult(
      buildSessionResultPayload(
        this.activeRequest || { platform, platformStoreId },
        {
          sessionStatus: 'error',
          reason: lastError || '모바일 직접 로그인에 실패했습니다.'
        }
      )
    );
    await this.onStateChange({
      platform,
      sessionStatus: 'error',
      platformStoreId,
      result
    });
    return result;
  }

  async markExpired(platform, platformStoreId) {
    const result = this.host.dispatchSessionResult(
      buildSessionResultPayload(
        this.activeRequest || { platform, platformStoreId },
        {
          sessionStatus: 'expired',
          reason: '모바일 직접 로그인 세션이 만료되었습니다.'
        }
      )
    );
    await this.onStateChange({
      platform,
      sessionStatus: 'expired',
      platformStoreId,
      result
    });
    return result;
  }
}
