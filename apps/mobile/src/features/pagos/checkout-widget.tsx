import { useRef } from 'react';
import { Modal, View } from 'react-native';
import { WebView, type WebViewMessageEvent } from 'react-native-webview';
import { useTheme } from '@/design-system/theme';
import {
  SDK_URL,
  mapResponse,
  type CheckoutWidgetProps,
  type CheckoutWidgetResult,
  type PaymentCheckoutResponse,
} from './checkout-shared';

/** Documento que hospeda el SDK oficial y abre el modal con la referencia. */
function buildHtml(reference: string, envMode: string, locale: string): string {
  const j = (v: string) => JSON.stringify(v);
  return `<!doctype html><html><head>
<meta name="viewport" content="width=device-width, initial-scale=1, maximum-scale=1, user-scalable=no">
<script src="${SDK_URL}"></script>
</head><body style="margin:0;padding:0;background:transparent">
<script>
  function post(m){ try { window.ReactNativeWebView && window.ReactNativeWebView.postMessage(JSON.stringify(m)); } catch(e){} }
  function start(){
    try {
      var modal = new window.PaymentCheckout.modal({
        env_mode: ${j(envMode)},
        locale: ${j(locale)},
        onOpen: function(){ post({ t: 'open' }); },
        onClose: function(){ post({ t: 'close' }); },
        onResponse: function(resp){ post({ t: 'response', resp: resp }); }
      });
      modal.open({ reference: ${j(reference)} });
    } catch (e) { post({ t: 'error', message: String(e) }); }
  }
  (function(){
    if (window.PaymentCheckout) return start();
    var n = 0, iv = setInterval(function(){
      if (window.PaymentCheckout) { clearInterval(iv); start(); }
      else if (++n > 120) { clearInterval(iv); post({ t: 'error', message: 'sdk timeout' }); }
    }, 100);
  })();
</script></body></html>`;
}

/**
 * Nativo (iOS/Android): hospeda el SDK oficial de Paymentez en un WebView
 * DENTRO de la app y puentea onResponse a RN vía postMessage. Mismo flujo
 * que la web (modal + open({reference})).
 */
export function CheckoutWidget({ reference, envMode, locale, onResult }: CheckoutWidgetProps) {
  const t = useTheme();
  const done = useRef(false);
  const finish = (r: CheckoutWidgetResult) => {
    if (done.current) return;
    done.current = true;
    onResult(r);
  };

  const onMessage = (e: WebViewMessageEvent) => {
    let m: { t?: string; resp?: PaymentCheckoutResponse; message?: string } | null = null;
    try {
      m = JSON.parse(e.nativeEvent.data);
    } catch {
      return;
    }
    if (m?.t === 'response') finish(mapResponse(m.resp));
    else if (m?.t === 'close') finish({ status: 'cancelled' });
    else if (m?.t === 'error') finish({ status: 'error', raw: m });
  };

  // baseUrl del dominio Paymentez del entorno: el SDK necesita un origen https.
  const origin = `https://ccapi${envMode === 'prod' ? '' : '-stg'}.paymentez.com`;

  return (
    <Modal visible transparent animationType="slide" onRequestClose={() => finish({ status: 'cancelled' })}>
      <View style={{ flex: 1, backgroundColor: t.colors.bg }}>
        <WebView
          originWhitelist={['*']}
          javaScriptEnabled
          domStorageEnabled
          thirdPartyCookiesEnabled
          source={{ html: buildHtml(reference, envMode, locale ?? 'es'), baseUrl: origin }}
          onMessage={onMessage}
          style={{ flex: 1, backgroundColor: 'transparent' }}
        />
      </View>
    </Modal>
  );
}
