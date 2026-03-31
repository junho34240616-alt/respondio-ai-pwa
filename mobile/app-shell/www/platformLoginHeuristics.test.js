import test from 'node:test';
import assert from 'node:assert/strict';

import {
  buildSessionResultPayload,
  detectPlatformLoginOutcome,
  shouldAutoSubmitOutcome
} from './platformLoginHeuristics.js';

test('baemin naver captcha is treated as user action, not failure', () => {
  const outcome = detectPlatformLoginOutcome({
    platform: 'baemin',
    url: 'https://nid.naver.com/nidlogin.login',
    title: '네이버 : 로그인',
    bodyText: '아이디 또는 전화번호 비밀번호 자동입력 방지 문자 본인 인증'
  });

  assert.equal(outcome.decision, 'needs_user_action');
  assert.equal(outcome.sessionStatus, null);
  assert.equal(shouldAutoSubmitOutcome(outcome), false);
});

test('baemin selfservice start page is not auto-submitted as connected', () => {
  const outcome = detectPlatformLoginOutcome({
    platform: 'baemin',
    url: 'https://self.baemin.com/start',
    title: '배민셀프서비스',
    bodyText: '셀프서비스 시작하기 회사소개 이용약관 개인정보처리방침'
  });

  assert.equal(outcome.decision, 'needs_user_action');
  assert.equal(outcome.sessionStatus, null);
  assert.equal(shouldAutoSubmitOutcome(outcome), false);
});

test('baemin temporary restriction page is treated as blocked', () => {
  const outcome = detectPlatformLoginOutcome({
    platform: 'baemin',
    url: 'https://self.baemin.com/bridge',
    title: '배민셀프서비스',
    bodyText: '잠시 이용이 제한돼요 비정상 동작이 감지되어 잠시 이용이 제한돼요. 잠시후 다시 시도해 주세요.'
  });

  assert.equal(outcome.decision, 'blocked');
  assert.equal(outcome.sessionStatus, 'error');
  assert.equal(shouldAutoSubmitOutcome(outcome), true);
});

test('baemin review page is treated as connected', () => {
  const outcome = detectPlatformLoginOutcome({
    platform: 'baemin',
    url: 'https://self.baemin.com/reviews',
    title: '배달의민족 사장님사이트',
    bodyText: '리뷰관리 주문접수 매장관리'
  });

  assert.equal(outcome.decision, 'connected');
  assert.equal(outcome.sessionStatus, 'connected');
  assert.equal(shouldAutoSubmitOutcome(outcome), true);
});

test('coupang access denied is treated as blocked error', () => {
  const outcome = detectPlatformLoginOutcome({
    platform: 'coupang_eats',
    url: 'https://store.coupangeats.com/merchant/app/fee',
    title: 'Access Denied',
    bodyText: 'Access Denied You do not have permission to access this server.'
  });

  assert.equal(outcome.decision, 'blocked');
  assert.equal(outcome.sessionStatus, 'error');
  assert.equal(shouldAutoSubmitOutcome(outcome), true);
});

test('yogiyo internal page is treated as connected', () => {
  const outcome = detectPlatformLoginOutcome({
    platform: 'yogiyo',
    url: 'https://ceo.yogiyo.co.kr/reviews',
    title: '요기요 사장님포털',
    bodyText: '리뷰 답변 주문 매장'
  });

  assert.equal(outcome.decision, 'connected');
  assert.equal(outcome.sessionStatus, 'connected');
  assert.equal(shouldAutoSubmitOutcome(outcome), true);
});

test('session result payload uses outcome reason for non-connected states', () => {
  const payload = buildSessionResultPayload(
    { platform: 'baemin', platformStoreId: '123' },
    {
      sessionStatus: 'error',
      reason: '배달의민족 추가 인증 실패'
    }
  );

  assert.deepEqual(payload, {
    type: 'respondio_session_result',
    platform: 'baemin',
    platformStoreId: '123',
    sessionStatus: 'error',
    lastError: '배달의민족 추가 인증 실패'
  });
});
