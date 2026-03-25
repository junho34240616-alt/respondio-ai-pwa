function serializePostMessageExpression(postMessageExpression) {
  return typeof postMessageExpression === 'string' && postMessageExpression.trim()
    ? postMessageExpression.trim()
    : 'console.warn("Respondio platform signal target is missing");';
}

export function buildPlatformPageSignalScript(postMessageExpression) {
  const targetExpression = serializePostMessageExpression(postMessageExpression);

  return `
    (function() {
      var emitCount = 0;
      var maxEmits = 16;

      function sendToNative(payload) {
        var serialized = typeof payload === 'string' ? payload : JSON.stringify(payload);
        ${targetExpression.replace(/__PAYLOAD__/g, 'serialized')}
      }

      function getBodyText() {
        var text = '';
        try {
          text = document && document.body && document.body.innerText ? document.body.innerText : '';
        } catch (error) {
          text = '';
        }

        return String(text || '').slice(0, 2400);
      }

      function emitSignal(source) {
        if (emitCount >= maxEmits) {
          return;
        }

        emitCount += 1;
        sendToNative({
          type: 'respondio_platform_page_signal',
          source: source || 'interval',
          url: location.href,
          title: document.title || '',
          bodyText: getBodyText(),
          emittedAt: Date.now()
        });
      }

      function scheduleEmit(source, delay) {
        setTimeout(function() {
          emitSignal(source);
        }, delay || 0);
      }

      var originalPushState = history.pushState;
      var originalReplaceState = history.replaceState;

      history.pushState = function() {
        var result = originalPushState.apply(this, arguments);
        scheduleEmit('pushState', 60);
        return result;
      };

      history.replaceState = function() {
        var result = originalReplaceState.apply(this, arguments);
        scheduleEmit('replaceState', 60);
        return result;
      };

      window.addEventListener('hashchange', function() {
        scheduleEmit('hashchange', 40);
      });

      window.addEventListener('popstate', function() {
        scheduleEmit('popstate', 40);
      });

      document.addEventListener('DOMContentLoaded', function() {
        scheduleEmit('domcontentloaded', 0);
        scheduleEmit('domcontentloaded-delayed', 400);
      });

      window.addEventListener('load', function() {
        scheduleEmit('load', 0);
        scheduleEmit('load-delayed', 800);
      });

      var interval = setInterval(function() {
        if (emitCount >= maxEmits) {
          clearInterval(interval);
          return;
        }

        emitSignal('interval');
      }, 2500);

      emitSignal('bootstrap');
    })();
    true;
  `;
}

export function buildReactNativePlatformPageSignalScript() {
  return buildPlatformPageSignalScript('window.ReactNativeWebView.postMessage(__PAYLOAD__);');
}
