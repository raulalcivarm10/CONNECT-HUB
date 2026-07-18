import { useMemo, useRef } from 'react';
import { Modal, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
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
  // Insets leídos AQUÍ (dentro del SafeAreaProvider). SafeAreaView DENTRO de un
  // <Modal> devuelve insets 0 (bug conocido), por eso el cierre quedaba pegado
  // arriba; aplicamos el padding como número fijo.
  const insets = useSafeAreaInsets();
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

  // CRÍTICO: memoizar el source. Si su identidad cambia (p.ej. el padre
  // re-renderiza durante el pago), react-native-webview RECARGA la página y
  // reinicia el modal de Paymentez EN PLENO COBRO → riesgo de tumbar/duplicar
  // la transacción. Con useMemo el html es estable mientras dura el checkout.
  const source = useMemo(
    () => ({ html: buildHtml(reference, envMode, locale ?? 'es'), baseUrl: origin }),
    [reference, envMode, locale, origin],
  );

  return (
    <Modal visible transparent animationType="slide" onRequestClose={() => finish({ status: 'cancelled' })}>
      {/* paddingTop/Bottom con los insets reales → el WebView (y el botón "X
          Close" del SDK, que se dibuja arriba) queda DEBAJO del notch y es
          alcanzable. Un mínimo de 44 arriba por si insets.top llega en 0. */}
      <View style={{ flex: 1, paddingTop: Math.max(insets.top, 44), paddingBottom: insets.bottom, backgroundColor: t.colors.bg }}>
        <WebView
          originWhitelist={['*']}
          javaScriptEnabled
          domStorageEnabled
          thirdPartyCookiesEnabled
          source={source}
          onMessage={onMessage}
          style={{ flex: 1, backgroundColor: 'transparent' }}
        />
      </View>
    </Modal>
  );
}
