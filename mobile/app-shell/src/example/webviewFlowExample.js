import { RespondioNativeBridgeHost } from '../nativeBridgeHost.js';

export function createWebViewFlowExample({ appBaseUrl, accessTokenProvider, webviewAdapter }) {
  const host = new RespondioNativeBridgeHost({
    appBaseUrl,
    accessTokenProvider,
    webviewAdapter,
    onBridgeRequest: async (payload) => {
      console.log('[RespondioMobile] open login request', payload);
      console.log('[RespondioMobile] open native WebView with:', payload.loginUrl);
    }
  });

  return {
    host,
    async bootstrap() {
      host.attachToWebView();
    },
    async prepareAndOpen(platform, platformStoreId) {
      await host.preparePlatform(platform, platformStoreId);
      const config = await host.loadPlatformConfig(platform);
      await host.handleBridgePayload(config.bridge_message);
      return config;
    },
    async markConnected(platform, platformStoreId) {
      return host.dispatchSessionResult({
        type: 'respondio_session_result',
        platform,
        platformStoreId: platformStoreId || null,
        sessionStatus: 'connected',
        lastError: null
      });
    },
    async markExpired(platform, platformStoreId) {
      return host.dispatchSessionResult({
        type: 'respondio_session_result',
        platform,
        platformStoreId: platformStoreId || null,
        sessionStatus: 'expired',
        lastError: '모바일 직접 로그인 세션이 만료되었습니다.'
      });
    }
  };
}
