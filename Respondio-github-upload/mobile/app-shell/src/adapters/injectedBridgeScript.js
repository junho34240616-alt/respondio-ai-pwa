function serializePostMessageExpression(postMessageExpression) {
  return typeof postMessageExpression === 'string' && postMessageExpression.trim()
    ? postMessageExpression.trim()
    : 'console.warn("Respondio bridge target is missing");';
}

export function buildInjectedBridgeScript(postMessageExpression) {
  const targetExpression = serializePostMessageExpression(postMessageExpression);

  return `
    (function() {
      var sendToNative = function(payload) {
        var serialized = typeof payload === 'string' ? payload : JSON.stringify(payload);
        ${targetExpression.replace(/__PAYLOAD__/g, 'serialized')}
      };

      window.RespondioNativeBridge = {
        postMessage: function(payload) {
          sendToNative(payload);
        }
      };
    })();
    true;
  `;
}

export function buildReactNativeInjectedBridgeScript() {
  return buildInjectedBridgeScript('window.ReactNativeWebView.postMessage(__PAYLOAD__);');
}

export function buildWebKitInjectedBridgeScript() {
  return buildInjectedBridgeScript('window.webkit.messageHandlers.respondio.postMessage(__PAYLOAD__);');
}
