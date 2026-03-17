import React, { useMemo, useRef, useState } from 'react';
import { Modal, SafeAreaView, ScrollView, StyleSheet, Text, TouchableOpacity, View, useWindowDimensions } from 'react-native';
import { WebView } from 'react-native-webview';
import { buildReactNativeInjectedBridgeScript } from '../../src/adapters/injectedBridgeScript.js';
import { buildReactNativePlatformPageSignalScript } from '../../src/adapters/platformPageSignalScript.js';
import {
  buildSessionResultPayload,
  detectPlatformLoginOutcome,
  formatOutcomeSummary
} from '../../www/platformLoginHeuristics.js';

function getOutcomeTone(outcome) {
  if (!outcome) {
    return 'idle';
  }

  if (outcome.sessionStatus === 'connected') {
    return 'success';
  }

  if (outcome.decision === 'needs_user_action' || outcome.decision === 'loading') {
    return 'info';
  }

  if (outcome.sessionStatus === 'expired') {
    return 'warning';
  }

  if (outcome.sessionStatus === 'error') {
    return 'error';
  }

  return 'info';
}

function buildPostMessageScript(payload) {
  return `
    window.postMessage(${JSON.stringify(payload)}, '*');
    true;
  `;
}

function getPlatformInstructions(platform) {
  if (platform === 'baemin') {
    return [
      '네이버 로그인 화면이 열리면 아이디/비밀번호 입력 후 추가 인증이 나오더라도 그대로 진행해 주세요.',
      '보안문자나 QR 인증이 떠도 앱이 막지 않으니 그대로 해결하면 됩니다.',
      '배민 사장님 내부 페이지로 이동하면 자동 성공 처리될 수 있습니다.'
    ];
  }

  if (platform === 'coupang_eats') {
    return [
      '쿠팡이츠 로그인에서 이메일 또는 아이디를 직접 입력해 주세요.',
      '접근 차단 문구가 보이면 현재 접속 환경이 차단된 상태일 수 있습니다.',
      '운영 페이지 진입이 확인되면 자동 성공 처리될 수 있습니다.'
    ];
  }

  if (platform === 'yogiyo') {
    return [
      '요기요는 로그인 후 운영 페이지로 이동하면 자동 성공 확률이 높습니다.',
      '추가 인증이 보이면 그대로 완료해 주세요.',
      '페이지 전환 후 잠깐 기다리면 상태가 반영됩니다.'
    ];
  }

  return [
    '플랫폼 로그인 페이지에서 직접 인증을 완료해 주세요.',
    '추가 인증이나 CAPTCHA가 나오면 앱을 닫지 말고 그대로 해결해 주세요.'
  ];
}

export function RespondioSessionShell(props) {
  const {
    appBaseUrl = 'https://respondio-ai-pwa.pages.dev'
  } = props || {};

  const { width } = useWindowDimensions();
  const isCompact = width < 768;
  const webViewRef = useRef(null);
  const loginWebViewRef = useRef(null);
  const autoSubmittedRef = useRef('');
  const [activeRequest, setActiveRequest] = useState(null);
  const [eventLog, setEventLog] = useState([]);
  const [isInspectorOpen, setIsInspectorOpen] = useState(false);
  const [isLoginViewOpen, setIsLoginViewOpen] = useState(false);
  const [loginOutcome, setLoginOutcome] = useState(null);
  const [sessionCenterNavState, setSessionCenterNavState] = useState({
    url: '',
    canGoBack: false,
    canGoForward: false,
    loading: true
  });
  const [loginNavState, setLoginNavState] = useState({
    url: '',
    canGoBack: false,
    canGoForward: false,
    loading: false
  });

  const sessionCenterUrl = useMemo(() => {
    return String(appBaseUrl || '').replace(/\/$/, '') + '/mobile/session-center?app_shell=1';
  }, [appBaseUrl]);

  const injectedJavaScriptBeforeContentLoaded = useMemo(() => {
    return buildReactNativeInjectedBridgeScript();
  }, []);

  const loginSignalScript = useMemo(() => {
    return buildReactNativePlatformPageSignalScript();
  }, []);

  const platformInstructions = useMemo(() => {
    return getPlatformInstructions(activeRequest?.platform);
  }, [activeRequest]);

  function appendLog(message) {
    setEventLog((current) => [
      new Date().toLocaleTimeString('ko-KR') + ' · ' + message,
      ...current
    ].slice(0, 20));
  }

  function handleWebViewMessage(event) {
    try {
      const payload = JSON.parse(event?.nativeEvent?.data || '{}');
      if (payload.type !== 'open_platform_login') {
        return;
      }

      setActiveRequest(payload);
      setLoginOutcome(null);
      autoSubmittedRef.current = '';
      setLoginNavState({
        url: payload.loginUrl || '',
        canGoBack: false,
        canGoForward: false,
        loading: true
      });
      setIsInspectorOpen(true);
      setIsLoginViewOpen(true);
      appendLog(payload.platform + ' 직접 로그인 요청 수신');
    } catch (error) {
      appendLog('브리지 메시지 파싱 실패: ' + error.message);
    }
  }

  function maybeAutoSubmitOutcome(outcome, sourceLabel) {
    if (!activeRequest || !outcome || !outcome.autoSubmit) {
      return;
    }

    const signature = [
      activeRequest.platform,
      outcome.decision,
      outcome.sessionStatus,
      outcome.reason
    ].join('|');

    if (autoSubmittedRef.current === signature) {
      return;
    }

    autoSubmittedRef.current = signature;
    appendLog((sourceLabel || '자동 감지') + ' -> ' + formatOutcomeSummary(outcome));
    sendSessionResult(outcome);
  }

  function applyDetectedOutcome(candidate, sourceLabel) {
    if (!activeRequest || !candidate) {
      return;
    }

    const outcome = detectPlatformLoginOutcome({
      platform: activeRequest.platform,
      url: candidate.url,
      title: candidate.title,
      bodyText: candidate.bodyText
    });

    setLoginOutcome(outcome);
    appendLog((sourceLabel || '로그인 진단') + ': ' + formatOutcomeSummary(outcome));
    maybeAutoSubmitOutcome(outcome, sourceLabel);
  }

  function sendSessionResult(nextStateOrOutcome) {
    if (!activeRequest || !webViewRef.current) {
      appendLog('활성 로그인 요청이 없습니다.');
      return;
    }

    const payload = buildSessionResultPayload(activeRequest, nextStateOrOutcome);
    webViewRef.current.injectJavaScript(buildPostMessageScript(payload));
    setIsLoginViewOpen(false);
    setLoginOutcome(null);
    appendLog(activeRequest.platform + ' 세션 결과 전달: ' + payload.sessionStatus);
  }

  function handleLoginWebViewMessage(event) {
    try {
      const payload = JSON.parse(event?.nativeEvent?.data || '{}');
      if (payload.type !== 'respondio_platform_page_signal') {
        return;
      }

      applyDetectedOutcome({
        url: payload.url,
        title: payload.title,
        bodyText: payload.bodyText
      }, 'WebView 페이지 신호');
    } catch (error) {
      appendLog('로그인 WebView 메시지 파싱 실패: ' + error.message);
    }
  }

  function handleLoginNavigationStateChange(navState) {
    if (!navState || !activeRequest) {
      return;
    }

    setLoginNavState({
      url: navState.url || '',
      canGoBack: !!navState.canGoBack,
      canGoForward: !!navState.canGoForward,
      loading: !!navState.loading
    });

    applyDetectedOutcome({
      url: navState.url,
      title: navState.title,
      bodyText: ''
    }, 'WebView URL 이동');
  }

  function handleSessionCenterNavigationStateChange(navState) {
    if (!navState) {
      return;
    }

    setSessionCenterNavState({
      url: navState.url || '',
      canGoBack: !!navState.canGoBack,
      canGoForward: !!navState.canGoForward,
      loading: !!navState.loading
    });
  }

  function reloadSessionCenter() {
    webViewRef.current?.reload();
    appendLog('세션 센터 새로고침');
  }

  function clearEventLog() {
    setEventLog([]);
  }

  function reloadLoginWebView() {
    loginWebViewRef.current?.reload();
    appendLog('로그인 WebView 새로고침');
  }

  const loginStatusTone = getOutcomeTone(loginOutcome);
  const controlsContent = React.createElement(
    ScrollView,
    { style: styles.sidebar, contentContainerStyle: styles.sidebarContent },
    React.createElement(
      View,
      { style: styles.card },
      React.createElement(Text, { style: styles.cardEyebrow }, 'Environment'),
      React.createElement(Text, { style: styles.cardTitle }, '세션 센터 연결'),
      React.createElement(Text, { style: styles.cardText }, '앱 기본 URL: ' + appBaseUrl),
      React.createElement(Text, { style: styles.cardText }, '현재 주소: ' + (sessionCenterNavState.url || sessionCenterUrl)),
      React.createElement(
        View,
        { style: styles.inlineButtonRow },
        React.createElement(
          TouchableOpacity,
          { style: styles.ghostButton, onPress: reloadSessionCenter },
          React.createElement(Text, { style: styles.ghostButtonText }, sessionCenterNavState.loading ? '불러오는 중...' : '세션 센터 새로고침')
        ),
        React.createElement(
          TouchableOpacity,
          { style: styles.ghostButton, onPress: clearEventLog },
          React.createElement(Text, { style: styles.ghostButtonText }, '로그 지우기')
        )
      )
    ),
    React.createElement(
      View,
      { style: styles.card },
      React.createElement(Text, { style: styles.cardEyebrow }, 'Active Request'),
      React.createElement(Text, { style: styles.cardTitle }, activeRequest ? activeRequest.platform : '요청 없음'),
      React.createElement(Text, { style: styles.cardText }, activeRequest ? activeRequest.loginUrl : '세션 센터에서 플랫폼 직접 로그인 요청을 기다리는 중입니다.'),
      React.createElement(
        View,
        { style: styles.buttonGroup },
        React.createElement(
          TouchableOpacity,
          { style: [styles.actionButton, styles.successButton], onPress: () => sendSessionResult('connected') },
          React.createElement(Text, { style: styles.actionButtonText }, '성공 처리')
        ),
        React.createElement(
          TouchableOpacity,
          { style: [styles.actionButton, styles.errorButton], onPress: () => sendSessionResult('error') },
          React.createElement(Text, { style: styles.actionButtonText }, '실패 처리')
        ),
        React.createElement(
          TouchableOpacity,
          { style: [styles.actionButton, styles.warningButton], onPress: () => sendSessionResult('expired') },
          React.createElement(Text, { style: styles.actionButtonText }, '만료 처리')
        )
      )
    ),
    React.createElement(
      View,
      { style: styles.card },
      React.createElement(Text, { style: styles.cardEyebrow }, 'Login Guide'),
      React.createElement(Text, { style: styles.cardTitle }, activeRequest ? '직접 로그인 안내' : '대기 중'),
      ...(platformInstructions.length
        ? platformInstructions.map((entry, index) =>
            React.createElement(Text, { key: entry + index, style: styles.logText }, '• ' + entry)
          )
        : [React.createElement(Text, { key: 'guide-empty', style: styles.cardText }, '플랫폼 요청이 오면 안내가 표시됩니다.')])
    ),
    React.createElement(
      View,
      { style: styles.card },
      React.createElement(Text, { style: styles.cardEyebrow }, 'Event Log'),
      ...(eventLog.length
        ? eventLog.map((entry) => React.createElement(Text, { key: entry, style: styles.logText }, entry))
        : [React.createElement(Text, { key: 'empty', style: styles.cardText }, '아직 브리지 로그가 없습니다.')])
    )
  );

  return React.createElement(
    SafeAreaView,
    { style: styles.safeArea },
    React.createElement(
      View,
      { style: styles.layout },
      React.createElement(
        View,
        { style: [styles.viewerPane, isCompact ? styles.viewerPaneCompact : null] },
        React.createElement(
          View,
          { style: [styles.header, isCompact ? styles.headerCompact : null] },
          React.createElement(Text, { style: styles.title }, 'Respondio Session Shell'),
          React.createElement(Text, { style: styles.subtitle }, '원격 세션 센터를 WebView로 열고 직접 로그인 세션을 중계합니다.'),
          React.createElement(
            View,
            { style: styles.inlineMetaRow },
            React.createElement(Text, { style: styles.inlineMetaLabel }, 'Session Center'),
            React.createElement(Text, { style: styles.inlineMetaValue }, sessionCenterNavState.url || sessionCenterUrl)
          )
        ),
        React.createElement(WebView, {
          ref: webViewRef,
          source: { uri: sessionCenterUrl },
          onMessage: handleWebViewMessage,
          onNavigationStateChange: handleSessionCenterNavigationStateChange,
          injectedJavaScriptBeforeContentLoaded,
          originWhitelist: ['*'],
          sharedCookiesEnabled: true,
          thirdPartyCookiesEnabled: true,
          javaScriptEnabled: true,
          domStorageEnabled: true,
          cacheEnabled: true,
          setSupportMultipleWindows: false,
          allowsBackForwardNavigationGestures: true,
          style: styles.webView
        })
      ),
      isCompact
        ? React.createElement(
            View,
            { style: styles.compactToolbar },
            React.createElement(
              TouchableOpacity,
              { style: styles.compactToolbarButton, onPress: () => setIsInspectorOpen(true) },
              React.createElement(Text, { style: styles.compactToolbarButtonText }, activeRequest ? '로그인 도구 열기' : '세션 도구 열기')
            ),
            React.createElement(
              TouchableOpacity,
              { style: styles.compactToolbarGhostButton, onPress: reloadSessionCenter },
              React.createElement(Text, { style: styles.compactToolbarGhostText }, '새로고침')
            )
          )
        : controlsContent
    ),
    React.createElement(
      Modal,
      {
        visible: isCompact && isInspectorOpen,
        animationType: 'slide',
        presentationStyle: 'pageSheet',
        onRequestClose: () => setIsInspectorOpen(false)
      },
      React.createElement(
        SafeAreaView,
        { style: styles.inspectorSafeArea },
        React.createElement(
          View,
          { style: styles.inspectorHeader },
          React.createElement(
            View,
            null,
            React.createElement(Text, { style: styles.modalTitle }, '세션 도구'),
            React.createElement(Text, { style: styles.modalSubtitle }, activeRequest ? activeRequest.platform + ' 로그인 상태를 여기서 확인하세요.' : '필요할 때만 열어 쓰는 보조 패널입니다.')
          ),
          React.createElement(
            TouchableOpacity,
            { style: styles.modalCloseButton, onPress: () => setIsInspectorOpen(false) },
            React.createElement(Text, { style: styles.modalCloseButtonText }, '닫기')
          )
        ),
        controlsContent
      )
    ),
    React.createElement(
      Modal,
      {
        visible: isLoginViewOpen && !!activeRequest,
        animationType: 'slide',
        presentationStyle: 'fullScreen'
      },
      React.createElement(
        SafeAreaView,
        { style: styles.modalSafeArea },
        React.createElement(
          View,
          { style: styles.modalHeader },
          React.createElement(
            View,
            null,
            React.createElement(Text, { style: styles.modalTitle }, activeRequest ? activeRequest.platform + ' 로그인' : '플랫폼 로그인'),
            React.createElement(Text, { style: styles.modalSubtitle }, activeRequest ? activeRequest.loginUrl : '')
          ),
          React.createElement(
            View,
            { style: styles.modalHeaderActions },
            React.createElement(
              TouchableOpacity,
              { style: styles.modalCloseButton, onPress: () => loginWebViewRef.current?.goBack(), disabled: !loginNavState.canGoBack },
              React.createElement(Text, { style: styles.modalCloseButtonText }, '뒤로')
            ),
            React.createElement(
              TouchableOpacity,
              { style: styles.modalCloseButton, onPress: reloadLoginWebView },
              React.createElement(Text, { style: styles.modalCloseButtonText }, '새로고침')
            ),
            React.createElement(
              TouchableOpacity,
              { style: styles.modalCloseButton, onPress: () => setIsLoginViewOpen(false) },
              React.createElement(Text, { style: styles.modalCloseButtonText }, '닫기')
            )
          )
        ),
        React.createElement(
          View,
          { style: styles.modalUrlBar },
          React.createElement(Text, { style: styles.modalUrlBarText }, loginNavState.url || (activeRequest ? activeRequest.loginUrl : ''))
        ),
        activeRequest ? React.createElement(WebView, {
          ref: loginWebViewRef,
          source: { uri: activeRequest.loginUrl },
          onNavigationStateChange: handleLoginNavigationStateChange,
          onMessage: handleLoginWebViewMessage,
          injectedJavaScriptBeforeContentLoaded: loginSignalScript,
          originWhitelist: ['*'],
          sharedCookiesEnabled: true,
          thirdPartyCookiesEnabled: true,
          javaScriptEnabled: true,
          domStorageEnabled: true,
          cacheEnabled: true,
          setSupportMultipleWindows: false,
          allowsBackForwardNavigationGestures: true,
          style: styles.modalWebView
        }) : null,
        React.createElement(
          View,
          {
            style: [
              styles.loginStatusBanner,
              loginStatusTone === 'success'
                ? styles.loginStatusSuccess
                : loginStatusTone === 'error'
                  ? styles.loginStatusError
                  : loginStatusTone === 'warning'
                    ? styles.loginStatusWarning
                    : styles.loginStatusInfo
            ]
          },
          React.createElement(
            Text,
            { style: styles.loginStatusText },
            loginOutcome
              ? formatOutcomeSummary(loginOutcome)
              : '로그인 WebView 상태를 기다리는 중입니다. 추가 인증이 나오면 그대로 진행해 주세요.'
          )
        ),
        React.createElement(
          View,
          { style: styles.modalGuideCard },
          platformInstructions.map((entry, index) =>
            React.createElement(Text, { key: entry + ':modal:' + index, style: styles.modalGuideText }, '• ' + entry)
          )
        ),
        React.createElement(
          View,
          { style: styles.modalFooter },
          React.createElement(
            TouchableOpacity,
            { style: [styles.actionButton, styles.successButton], onPress: () => sendSessionResult('connected') },
            React.createElement(Text, { style: styles.actionButtonText }, '로그인 성공 처리')
          ),
          React.createElement(
            TouchableOpacity,
            { style: [styles.actionButton, styles.errorButton], onPress: () => sendSessionResult('error') },
            React.createElement(Text, { style: styles.actionButtonText }, '로그인 실패 처리')
          ),
          React.createElement(
            TouchableOpacity,
            { style: [styles.actionButton, styles.warningButton], onPress: () => sendSessionResult('expired') },
            React.createElement(Text, { style: styles.actionButtonText }, '세션 만료 처리')
          )
        )
      )
    )
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: '#0B1120'
  },
  layout: {
    flex: 1,
    backgroundColor: '#0B1120'
  },
  viewerPane: {
    flex: 1,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(255,255,255,0.08)'
  },
  viewerPaneCompact: {
    borderBottomWidth: 0
  },
  header: {
    paddingHorizontal: 20,
    paddingVertical: 16
  },
  headerCompact: {
    paddingHorizontal: 16,
    paddingVertical: 12
  },
  title: {
    color: '#F8FAFC',
    fontSize: 20,
    fontWeight: '700',
    marginBottom: 6
  },
  subtitle: {
    color: '#94A3B8',
    fontSize: 13,
    lineHeight: 18
  },
  inlineMetaRow: {
    marginTop: 12,
    borderRadius: 14,
    backgroundColor: 'rgba(255,255,255,0.04)',
    paddingHorizontal: 12,
    paddingVertical: 10
  },
  inlineMetaLabel: {
    color: '#FDBA74',
    fontSize: 11,
    fontWeight: '700',
    marginBottom: 4
  },
  inlineMetaValue: {
    color: '#E2E8F0',
    fontSize: 12,
    lineHeight: 16
  },
  webView: {
    flex: 1,
    backgroundColor: '#FFFFFF'
  },
  compactToolbar: {
    position: 'absolute',
    left: 16,
    right: 16,
    bottom: 16,
    flexDirection: 'row',
    gap: 10
  },
  compactToolbarButton: {
    flex: 1,
    borderRadius: 16,
    backgroundColor: '#F97316',
    paddingVertical: 14,
    paddingHorizontal: 16
  },
  compactToolbarButtonText: {
    color: '#FFFFFF',
    textAlign: 'center',
    fontWeight: '700',
    fontSize: 14
  },
  compactToolbarGhostButton: {
    borderRadius: 16,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.18)',
    backgroundColor: 'rgba(15,23,42,0.92)',
    paddingVertical: 14,
    paddingHorizontal: 18
  },
  compactToolbarGhostText: {
    color: '#E2E8F0',
    textAlign: 'center',
    fontWeight: '700',
    fontSize: 14
  },
  sidebar: {
    flex: 1,
    backgroundColor: '#0F172A'
  },
  sidebarContent: {
    padding: 16,
    gap: 16
  },
  card: {
    backgroundColor: 'rgba(255,255,255,0.04)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.08)',
    borderRadius: 24,
    padding: 18
  },
  cardEyebrow: {
    color: '#FDBA74',
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 2,
    marginBottom: 8
  },
  cardTitle: {
    color: '#F8FAFC',
    fontSize: 18,
    fontWeight: '700',
    marginBottom: 8
  },
  cardText: {
    color: '#94A3B8',
    fontSize: 13,
    lineHeight: 18
  },
  buttonGroup: {
    marginTop: 16,
    gap: 10
  },
  inlineButtonRow: {
    flexDirection: 'row',
    gap: 10,
    marginTop: 16
  },
  actionButton: {
    borderRadius: 14,
    paddingVertical: 12,
    paddingHorizontal: 16
  },
  actionButtonText: {
    color: '#FFFFFF',
    textAlign: 'center',
    fontWeight: '700'
  },
  successButton: {
    backgroundColor: '#16A34A'
  },
  errorButton: {
    backgroundColor: '#DC2626'
  },
  warningButton: {
    backgroundColor: '#EA580C'
  },
  ghostButton: {
    flex: 1,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.16)',
    paddingVertical: 12,
    paddingHorizontal: 14
  },
  ghostButtonText: {
    color: '#E2E8F0',
    textAlign: 'center',
    fontWeight: '600',
    fontSize: 13
  },
  inspectorSafeArea: {
    flex: 1,
    backgroundColor: '#0F172A'
  },
  inspectorHeader: {
    paddingHorizontal: 16,
    paddingVertical: 14,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(255,255,255,0.08)',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12
  },
  modalSafeArea: {
    flex: 1,
    backgroundColor: '#0B1120'
  },
  modalHeader: {
    paddingHorizontal: 16,
    paddingVertical: 14,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(255,255,255,0.08)',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12
  },
  modalHeaderActions: {
    flexDirection: 'row',
    gap: 8
  },
  modalTitle: {
    color: '#F8FAFC',
    fontSize: 18,
    fontWeight: '700',
    marginBottom: 4
  },
  modalSubtitle: {
    color: '#94A3B8',
    fontSize: 12
  },
  modalCloseButton: {
    borderRadius: 12,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.12)',
    paddingVertical: 10,
    paddingHorizontal: 14
  },
  modalCloseButtonText: {
    color: '#E2E8F0',
    fontWeight: '600'
  },
  modalUrlBar: {
    marginHorizontal: 16,
    marginTop: 12,
    borderRadius: 14,
    backgroundColor: 'rgba(255,255,255,0.04)',
    paddingHorizontal: 12,
    paddingVertical: 10
  },
  modalUrlBarText: {
    color: '#CBD5E1',
    fontSize: 12,
    lineHeight: 16
  },
  modalWebView: {
    flex: 1,
    backgroundColor: '#FFFFFF'
  },
  loginStatusBanner: {
    marginHorizontal: 16,
    marginTop: 12,
    borderRadius: 14,
    paddingHorizontal: 14,
    paddingVertical: 12
  },
  loginStatusInfo: {
    backgroundColor: '#1E293B'
  },
  loginStatusSuccess: {
    backgroundColor: '#14532D'
  },
  loginStatusError: {
    backgroundColor: '#7F1D1D'
  },
  loginStatusWarning: {
    backgroundColor: '#7C2D12'
  },
  loginStatusText: {
    color: '#F8FAFC',
    fontSize: 13,
    lineHeight: 18
  },
  modalGuideCard: {
    marginHorizontal: 16,
    marginTop: 12,
    borderRadius: 14,
    backgroundColor: 'rgba(255,255,255,0.04)',
    paddingHorizontal: 14,
    paddingVertical: 12,
    gap: 6
  },
  modalGuideText: {
    color: '#CBD5E1',
    fontSize: 12,
    lineHeight: 18
  },
  modalFooter: {
    padding: 16,
    gap: 10,
    borderTopWidth: 1,
    borderTopColor: 'rgba(255,255,255,0.08)',
    backgroundColor: '#0F172A'
  },
  logText: {
    color: '#CBD5E1',
    fontSize: 12,
    lineHeight: 18,
    marginTop: 6
  }
});

export default RespondioSessionShell;
