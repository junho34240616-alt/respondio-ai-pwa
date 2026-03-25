import { NativeSessionController } from '../nativeSessionController.js';

export function createDirectLoginFlow({ appBaseUrl, accessTokenProvider, webviewAdapter }) {
  return new NativeSessionController({
    appBaseUrl,
    accessTokenProvider,
    webviewAdapter,
    openLoginView: async (payload) => {
      console.log('[RespondioMobile] open login view', payload.platform, payload.loginUrl);
    },
    onStateChange: async (event) => {
      console.log('[RespondioMobile] session state updated', event);
    }
  });
}
