export const PLATFORM_SESSION_CONFIGS = {
  baemin: {
    label: '배달의민족',
    loginUrl: 'https://self.baemin.com/bridge',
    reviewUrl: 'https://self.baemin.com/reviews'
  },
  coupang_eats: {
    label: '쿠팡이츠',
    loginUrl: 'https://store.coupangeats.com/login',
    reviewUrl: 'https://store.coupangeats.com/reviews'
  },
  yogiyo: {
    label: '요기요',
    loginUrl: 'https://ceo.yogiyo.co.kr/login',
    reviewUrl: 'https://ceo.yogiyo.co.kr/reviews'
  }
};

export const ALLOWED_SESSION_STATES = ['inactive', 'pending', 'connected', 'expired', 'error'];

export function buildBridgeMessage(platform, platformStoreId) {
  const config = PLATFORM_SESSION_CONFIGS[platform];
  if (!config) {
    throw new Error(`Unsupported platform: ${platform}`);
  }

  return {
    type: 'open_platform_login',
    platform,
    platformStoreId: platformStoreId || null,
    loginUrl: config.loginUrl,
    reviewUrl: config.reviewUrl,
    callbackPath: `/api/v1/platform_connections/${platform}/session-state`
  };
}
