import { useEffect, useState } from 'react';
import { ActivityIndicator, InteractionManager, Modal, Platform, Pressable, ScrollView, TextInput, View } from 'react-native';
import { Image } from 'expo-image';
import { Ionicons } from '@expo/vector-icons';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useQueryClient } from '@tanstack/react-query';
import type { CuponValidacion } from '@connecthub/shared-types';
import { AppText, Button, Skeleton } from '@/design-system/components';
import { useConfirm } from '@/design-system/confirm';
import { useTheme } from '@/design-system/theme';
import { radius, spacing, fontWeight, fontSize } from '@/design-system/tokens';
import { useI18n } from '@/i18n';
import { useSettings } from '@/store/settings';
import { useAuth } from '@/store/auth';
import {
  useResumenPago,
  iniciarCheckout,
  confirmarCheckout,
  validarCupon,
  enviarConfirmacionCorreo,
} from '@/api/pagos';
import { CheckoutWidget } from '@/features/pagos/checkout-widget';
import type { CheckoutWidgetResult } from '@/features/pagos/checkout-shared';
import { actualizarPerfil, useMiPerfil } from '@/api/perfil';
import { ApiError, errorCode } from '@/api/client';

function Row({ label, value, strong }: { label: string; value: string; strong?: boolean }) {
  const t = useTheme();
  return (
    <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
      <AppText variant={strong ? 'bodyStrong' : 'body'} muted={!strong}>{label}</AppText>
      <AppText variant={strong ? 'subtitle' : 'body'} color={strong ? t.colors.brandText : undefined}>{value}</AppText>
    </View>
  );
}

export default function Checkout() {
  const t = useTheme();
  const { t: tr } = useI18n();
  const router = useRouter();
  const qc = useQueryClient();
  const { idEvento } = useLocalSearchParams<{ idEvento: string }>();
  const evId = Number(idEvento);

  const confirm = useConfirm();
  const lang = useSettings((s) => s.lang);
  const idUsuario = useAuth((s) => s.user?.id ?? null);
  const numeroId = useAuth((s) => s.user?.numeroId ?? null);
  const authUser = useAuth((s) => s.user);
  const setAuthUser = useAuth((s) => s.setUser);

  // Aviso informativo con el diálogo propio (Alert.alert no funciona en web).
  const aviso = (title: string, message?: string, danger = false) =>
    void confirm({ title, message, confirmText: tr('common.close'), destructive: danger, icon: danger ? 'card-outline' : 'information-circle-outline' });

  // 409 PROFILE_INCOMPLETE → hay que completar nombre/apellido (van al certificado) antes de comprar.
  async function pedirCompletarPerfil() {
    const ok = await confirm({
      title: tr('profile.completeTitle'),
      message: tr('profile.completeBody'),
      confirmText: tr('profile.completeCta'),
      cancelText: tr('common.cancel'),
      icon: 'person-outline',
    });
    if (ok) router.push('/editar-perfil');
  }
  const { data: resumen, isLoading, isError } = useResumenPago(evId);

  const [paying, setPaying] = useState(false);
  const [checkout, setCheckout] = useState<{ reference: string; envMode: 'stg' | 'prod'; referencia: string } | null>(null);
  // Código de descuento (opcional). El descuento lo aplica el servicio de pagos;
  // el botón "validar" solo consulta EVENTO_CUPONES (ConnectHub) para dar feedback.
  const [cupon, setCupon] = useState('');
  const [cuponInfo, setCuponInfo] = useState<CuponValidacion | null>(null);
  const [validandoCupon, setValidandoCupon] = useState(false);
  // Prompt de DATOS DE FACTURACIÓN antes de pagar: nombre/apellido (van al
  // certificado), cédula (la exige el checkout externo) y EMAIL_FACTURA (correo
  // del comprobante — el de login puede ser el relay privado de Apple).
  const [pedirCedula, setPedirCedula] = useState(false);
  const [cedTipo, setCedTipo] = useState('C');
  const [cedNum, setCedNum] = useState('');
  const [datNombre, setDatNombre] = useState('');
  const [datApellido, setDatApellido] = useState('');
  const [datEmailFactura, setDatEmailFactura] = useState('');
  const [guardandoCed, setGuardandoCed] = useState(false);
  const { data: perfil } = useMiPerfil();

  // Evita el DOBLE PAGO por recarga en web: mientras se procesa el pago, el
  // navegador advierte antes de recargar/cerrar (en nativo no hay recarga, y el
  // overlay bloqueante de abajo impide interactuar).
  useEffect(() => {
    if (Platform.OS !== 'web' || !paying) return;
    const handler = (e: BeforeUnloadEvent) => {
      e.preventDefault();
      e.returnValue = '';
    };
    window.addEventListener('beforeunload', handler);
    return () => window.removeEventListener('beforeunload', handler);
  }, [paying]);

  // Checkout de Paymentez (método PRINCIPAL) contra el SERVICIO DE PAGOS:
  //   1) POST /evento-usuario/eventos/{id}/checkout { idUsuario } → { reference, envMode }
  //   2) abre el SDK PaymentCheckout DENTRO de la app con esa reference.
  async function pagarConCheckout() {
    if (!idUsuario) return;
    // Workshop sin el evento principal comprado → no se puede pagar todavía.
    if (resumen?.padreRequerido) {
      aviso(tr('event.parentFirst'), `${resumen.padreRequerido.titulo} · $${resumen.padreRequerido.precio.toFixed(2)}`);
      return;
    }
    // SIEMPRE confirmar los datos de facturación antes de abrir la pasarela:
    // nombre/apellido (certificado), cédula (la exige el checkout externo) y
    // correo de facturación (editable por si factura a otro correo).
    setDatNombre(perfil?.nombre ?? authUser?.nombre ?? '');
    setDatApellido(perfil?.apellido ?? authUser?.apellido ?? '');
    setDatEmailFactura(perfil?.emailFactura ?? authUser?.email ?? '');
    if (numeroId) setCedNum(numeroId);
    if (perfil?.tipoId || authUser?.tipoId) setCedTipo(perfil?.tipoId ?? authUser!.tipoId!);
    setPedirCedula(true);
  }

  // Pide la referencia y abre el widget (ya con cédula garantizada).
  async function iniciarPago() {
    if (!idUsuario) return;
    setPaying(true);
    try {
      const res = await iniciarCheckout(evId, cupon);
      setCheckout(res); // { reference, envMode, referencia } → renderiza el widget
      // paying sigue true mientras el checkout está abierto
    } catch (err) {
      setPaying(false);
      if (errorCode(err) === 'PROFILE_INCOMPLETE') {
        await pedirCompletarPerfil();
      } else if (err instanceof ApiError && err.status === 409) {
        // 409 = workshop cuyo evento padre (de pago) aún no se ha comprado.
        aviso(tr('event.parentFirst'), err.message);
      } else {
        aviso(tr('common.error'), err instanceof ApiError ? err.message : '', true);
      }
    }
  }

  // Guarda los datos de facturación (USUARIOS) y continúa el pago.
  async function guardarCedula() {
    const num = cedNum.trim();
    const nom = datNombre.trim();
    const ape = datApellido.trim();
    const emailFac = datEmailFactura.trim();
    if (!num || !nom || !ape || !emailFac) return;
    setGuardandoCed(true);
    try {
      const p = await actualizarPerfil({
        // el nombre bloqueado (certificado ya emitido) no se reenvía
        ...(perfil?.nombreBloqueado ? {} : { nombre: nom, apellido: ape }),
        tipoId: cedTipo,
        numeroId: num,
        emailFactura: emailFac,
      });
      if (authUser) {
        setAuthUser({ ...authUser, nombre: p.nombre, apellido: p.apellido, tipoId: p.tipoId, numeroId: p.numeroId });
      }
      setPedirCedula(false);
      await iniciarPago();
    } catch (err) {
      aviso(tr('common.error'), err instanceof ApiError ? err.message : '', true);
    } finally {
      setGuardandoCed(false);
    }
  }

  // Valida el cupón contra ConnectHub (EVENTO_CUPONES) → feedback en pantalla.
  async function validarCuponCodigo() {
    const code = cupon.trim();
    if (!code) return;
    setValidandoCupon(true);
    try {
      setCuponInfo(await validarCupon(evId, code));
    } catch (err) {
      aviso(tr('common.error'), err instanceof ApiError ? err.message : '', true);
    } finally {
      setValidandoCupon(false);
    }
  }

  // onResponse del SDK → confirma en NUESTRO backend (verifica en Nuvei e inscribe):
  //   POST /public/pagos/checkout/confirmar  { idEvento, referencia, transactionId }
  async function onCheckoutResult(r: CheckoutWidgetResult) {
    const referencia = checkout?.referencia; // capturar ANTES de limpiar el estado
    setCheckout(null);
    if (r.status === 'cancelled') {
      setPaying(false);
      return;
    }
    if (r.status === 'success' && r.transactionId && referencia) {
      try {
        const res = await confirmarCheckout(evId, referencia, r.transactionId);
        setPaying(false);
        if (res.success) {
          // correo de confirmación (best-effort, no bloquea): monto = con descuento si aplicó
          const montoCobrado = cuponAplicado && cuponInfo?.totalConDescuento != null
            ? cuponInfo.totalConDescuento
            : (resumen?.total ?? 0);
          void enviarConfirmacionCorreo(evId, r.transactionId, montoCobrado).catch(() => {});
          // el servicio de pagos ya registró la inscripción
          await qc.invalidateQueries({ queryKey: ['mis-entradas'] });
          await qc.invalidateQueries({ queryKey: ['resumen-pago', evId] });
          // Sin diálogo de éxito encima del Modal del checkout que se está
          // cerrando (eso encadenaba modales y CONGELABA la pantalla en iOS).
          // Navegamos a Mis Entradas tras cerrar el modal; la entrada es la
          // confirmación visible.
          InteractionManager.runAfterInteractions(() => router.replace('/(tabs)/entradas'));
          return;
        }
        // el SDK aprobó pero la verificación del servicio no confirmó → error de pago
        aviso(tr('pay.errorTitle'), res.message ?? tr('pay.errorBody'), true);
      } catch (err) {
        setPaying(false);
        aviso(tr('pay.errorTitle'), err instanceof ApiError ? err.message : tr('pay.errorBody'), true);
      }
      return;
    }
    setPaying(false);
    if (r.status === 'pending') {
      aviso(tr('pay.pendingTitle'), tr('pay.pendingBody'));
    } else {
      // failure o error del SDK → hubo un error en el pago
      aviso(tr('pay.errorTitle'), tr('pay.errorBody'), true);
    }
  }

  const header = (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.md, paddingHorizontal: spacing.lg, paddingVertical: spacing.md }}>
      <Pressable
        onPress={() => (router.canGoBack() ? router.back() : router.replace('/(tabs)'))}
        hitSlop={10}
        disabled={paying}
        style={{ opacity: paying ? 0.35 : 1 }}
      >
        <Ionicons name="chevron-back" size={26} color={t.colors.text} />
      </Pressable>
      <AppText variant="title">{tr('pay.title')}</AppText>
    </View>
  );

  if (isLoading) {
    return (
      <SafeAreaView style={{ flex: 1, backgroundColor: t.colors.bg }}>
        {header}
        <View style={{ padding: spacing.lg, gap: spacing.md }}>
          <Skeleton height={90} radius={radius.lg} />
          <Skeleton height={120} radius={radius.lg} />
        </View>
      </SafeAreaView>
    );
  }

  if (isError || !resumen) {
    return (
      <SafeAreaView style={{ flex: 1, backgroundColor: t.colors.bg }}>
        {header}
        <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', gap: spacing.md }}>
          <Ionicons name="alert-circle-outline" size={44} color={t.colors.textFaint} />
          <AppText muted>{tr('event.notFound')}</AppText>
        </View>
      </SafeAreaView>
    );
  }

  const money = (n: number) => `$${n.toFixed(2)}`;
  const cuponAplicado = cuponInfo?.valido === true; // cupón válido → código congelado

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: t.colors.bg }}>
      {header}
      <ScrollView contentContainerStyle={{ paddingHorizontal: spacing.lg, paddingBottom: spacing['4xl'], gap: spacing.lg }}>
        {/* evento */}
        <View style={{ flexDirection: 'row', gap: spacing.md, alignItems: 'center' }}>
          <Image source={{ uri: resumen.portadaUrl }} style={{ width: 64, height: 64, borderRadius: radius.md, backgroundColor: t.colors.surfaceAlt }} />
          <AppText variant="subtitle" style={{ flex: 1 }} numberOfLines={2}>{resumen.titulo}</AppText>
        </View>

        {resumen.yaAdquirido ? (
          <View style={{ gap: spacing.md, alignItems: 'center', marginTop: spacing.xl }}>
            <Ionicons name="checkmark-circle" size={48} color={t.colors.success} />
            <AppText variant="subtitle">{tr('event.registered')}</AppText>
            <Button title={tr('event.viewTicket')} onPress={() => router.replace('/(tabs)/entradas')} />
          </View>
        ) : (
          <>
            {/* desglose */}
            <View style={{ gap: spacing.sm, backgroundColor: t.colors.card, borderRadius: radius.lg, borderWidth: 1, borderColor: t.colors.border, padding: spacing.lg }}>
              <Row label={tr('pay.subtotal')} value={money(resumen.subtotal)} />
              {resumen.iva > 0 ? <Row label={tr('pay.tax')} value={money(resumen.iva)} /> : null}
              <View style={{ height: 1, backgroundColor: t.colors.border, marginVertical: 4 }} />
              <Row label={tr('pay.total')} value={money(resumen.total)} strong />
            </View>

            {/* Código de descuento (opcional) — al validar OK se congela el código */}
            <View style={{ gap: spacing.xs }}>
              <AppText variant="caption" muted style={{ fontWeight: fontWeight.semibold }}>{tr('pay.couponLabel')}</AppText>
              <View style={{ flexDirection: 'row', gap: spacing.sm }}>
                <View style={{
                  flex: 1, flexDirection: 'row', alignItems: 'center', gap: spacing.sm,
                  backgroundColor: t.colors.surfaceAlt, borderRadius: radius.md, paddingHorizontal: spacing.md,
                  borderWidth: 1.5, borderColor: cuponAplicado ? t.colors.success : 'transparent',
                }}>
                  <Ionicons name={cuponAplicado ? 'checkmark-circle' : 'pricetag-outline'} size={18} color={cuponAplicado ? t.colors.success : t.colors.textFaint} />
                  <TextInput
                    value={cupon}
                    onChangeText={(v) => { setCupon(v.toUpperCase()); setCuponInfo(null); }}
                    placeholder={tr('pay.couponPh')}
                    placeholderTextColor={t.colors.textFaint}
                    autoCapitalize="characters"
                    autoCorrect={false}
                    maxLength={50}
                    editable={!paying && !cuponAplicado}
                    onSubmitEditing={validarCuponCodigo}
                    style={{ flex: 1, height: 48, color: t.colors.text, fontSize: fontSize.md, letterSpacing: 1 }}
                  />
                  {cupon.trim() && !cuponAplicado ? (
                    <Pressable onPress={() => { setCupon(''); setCuponInfo(null); }} hitSlop={8} disabled={paying}>
                      <Ionicons name="close-circle" size={18} color={t.colors.textFaint} />
                    </Pressable>
                  ) : null}
                </View>
                {cuponAplicado ? (
                  <Pressable
                    onPress={() => { setCupon(''); setCuponInfo(null); }}
                    disabled={paying}
                    style={{ height: 48, paddingHorizontal: spacing.lg, borderRadius: radius.md, alignItems: 'center', justifyContent: 'center', backgroundColor: t.colors.surfaceAlt }}
                  >
                    <AppText variant="caption" color={t.colors.danger} style={{ fontWeight: fontWeight.semibold }}>
                      {tr('pay.couponRemove')}
                    </AppText>
                  </Pressable>
                ) : (
                  <Pressable
                    onPress={validarCuponCodigo}
                    disabled={!cupon.trim() || paying || validandoCupon}
                    style={{ height: 48, paddingHorizontal: spacing.lg, borderRadius: radius.md, alignItems: 'center', justifyContent: 'center', backgroundColor: cupon.trim() && !paying ? t.colors.brand : t.colors.surfaceAlt }}
                  >
                    {validandoCupon ? (
                      <ActivityIndicator size="small" color={t.colors.onBrand} />
                    ) : (
                      <AppText variant="caption" color={cupon.trim() && !paying ? t.colors.onBrand : t.colors.textFaint} style={{ fontWeight: fontWeight.semibold }}>
                        {tr('pay.couponValidate')}
                      </AppText>
                    )}
                  </Pressable>
                )}
              </View>
              {cuponInfo ? (
                cuponInfo.valido ? (
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                    <Ionicons name="checkmark-circle" size={15} color={t.colors.success} />
                    <AppText variant="caption" color={t.colors.success}>
                      {tr('pay.couponApplied')} · −{money(cuponInfo.descuento ?? 0)} → {money(cuponInfo.totalConDescuento ?? cuponInfo.total)}
                    </AppText>
                  </View>
                ) : (
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                    <Ionicons name="alert-circle" size={15} color={t.colors.danger} />
                    <AppText variant="caption" color={t.colors.danger}>
                      {cuponInfo.motivo === 'exhausted' ? tr('pay.couponExhausted') : tr('pay.couponInvalid')}
                    </AppText>
                  </View>
                )
              ) : null}
            </View>

            {resumen.padreRequerido ? (
              /* Workshop sin el evento principal → no se puede pagar aún */
              <View style={{ gap: spacing.sm, backgroundColor: t.colors.card, borderRadius: radius.lg, borderWidth: 1, borderColor: t.colors.border, padding: spacing.lg }}>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.sm }}>
                  <Ionicons name="alert-circle" size={20} color={t.colors.warning} />
                  <AppText variant="bodyStrong" style={{ flex: 1 }}>{tr('event.parentFirst')}</AppText>
                </View>
                <AppText muted variant="caption">
                  {resumen.padreRequerido.titulo} · {money(resumen.padreRequerido.precio)}
                </AppText>
                <Button
                  title={tr('pay.viewParent')}
                  onPress={() => router.replace({ pathname: '/evento/[id]', params: { id: resumen.padreRequerido!.id } })}
                />
              </View>
            ) : (
              /* Checkout Paymentez (método PRINCIPAL) */
              <View style={{ gap: spacing.sm }}>
                <Button
                  title={`${tr('pay.pay')} ${money(resumen.total)}`}
                  onPress={pagarConCheckout}
                  loading={paying}
                  disabled={!idUsuario}
                />
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.xs, justifyContent: 'center' }}>
                  <Ionicons name="card-outline" size={13} color={t.colors.textFaint} />
                  <AppText muted variant="caption">{tr('pay.checkoutHint')}</AppText>
                </View>
              </View>
            )}

            <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.xs, justifyContent: 'center' }}>
              <Ionicons name="lock-closed" size={13} color={t.colors.textFaint} />
              <AppText muted variant="caption">{tr('pay.secure')}</AppText>
            </View>
          </>
        )}
      </ScrollView>

      {checkout ? (
        <CheckoutWidget
          reference={checkout.reference}
          envMode={checkout.envMode}
          locale={['es', 'en', 'pt'].includes(lang) ? lang : 'es'}
          onResult={onCheckoutResult}
        />
      ) : null}

      {/* Datos de facturación antes de pagar: nombre (certificado) + cédula +
          correo de facturación (comprobante). Prellenado; editable. */}
      <Modal visible={pedirCedula} transparent animationType="fade" onRequestClose={() => setPedirCedula(false)}>
        <Pressable
          onPress={() => setPedirCedula(false)}
          style={{ flex: 1, backgroundColor: t.colors.overlay, alignItems: 'center', justifyContent: 'center', padding: spacing.xl }}
        >
          <Pressable
            onPress={(e) => e.stopPropagation()}
            style={{ width: '100%', maxWidth: 360, backgroundColor: t.colors.bgElevated, borderRadius: radius['2xl'], padding: spacing.xl, gap: spacing.md }}
          >
            <View style={{ alignItems: 'center', gap: spacing.xs }}>
              <View style={{ width: 56, height: 56, borderRadius: radius.full, backgroundColor: t.colors.brandSoft, alignItems: 'center', justifyContent: 'center' }}>
                <Ionicons name="card-outline" size={28} color={t.colors.brand} />
              </View>
              <AppText variant="subtitle" style={{ textAlign: 'center' }}>{tr('pay.billingTitle')}</AppText>
              <AppText muted variant="caption" style={{ textAlign: 'center' }}>{tr('pay.billingBody')}</AppText>
            </View>

            {/* Nombre + apellido (van al certificado). Bloqueados si ya hay certificado. */}
            <View style={{ flexDirection: 'row', gap: spacing.sm }}>
              <TextInput
                value={datNombre}
                onChangeText={setDatNombre}
                placeholder={tr('profile.firstName')}
                placeholderTextColor={t.colors.textFaint}
                autoCapitalize="words"
                editable={!perfil?.nombreBloqueado && !guardandoCed}
                style={{ flex: 1, height: 52, borderRadius: radius.md, backgroundColor: t.colors.surfaceAlt, paddingHorizontal: spacing.md, color: t.colors.text, opacity: perfil?.nombreBloqueado ? 0.6 : 1 }}
              />
              <TextInput
                value={datApellido}
                onChangeText={setDatApellido}
                placeholder={tr('profile.lastName')}
                placeholderTextColor={t.colors.textFaint}
                autoCapitalize="words"
                editable={!perfil?.nombreBloqueado && !guardandoCed}
                style={{ flex: 1, height: 52, borderRadius: radius.md, backgroundColor: t.colors.surfaceAlt, paddingHorizontal: spacing.md, color: t.colors.text, opacity: perfil?.nombreBloqueado ? 0.6 : 1 }}
              />
            </View>

            {/* Identificación */}
            <View style={{ flexDirection: 'row', gap: spacing.sm }}>
              <View style={{ flexDirection: 'row', gap: 4, padding: 4, borderRadius: radius.md, backgroundColor: t.colors.surfaceAlt }}>
                {(['C', 'P', 'R'] as const).map((tp) => {
                  const on = cedTipo === tp;
                  return (
                    <Pressable
                      key={tp}
                      onPress={() => setCedTipo(tp)}
                      style={{ paddingHorizontal: spacing.sm, height: 44, borderRadius: radius.sm, alignItems: 'center', justifyContent: 'center', backgroundColor: on ? t.colors.brand : 'transparent' }}
                    >
                      <AppText variant="caption" color={on ? t.colors.onBrand : t.colors.textMuted} style={{ fontWeight: fontWeight.semibold }}>
                        {tr(tp === 'C' ? 'profile.idCedula' : tp === 'P' ? 'profile.idPassport' : 'profile.idRuc')}
                      </AppText>
                    </Pressable>
                  );
                })}
              </View>
              <TextInput
                value={cedNum}
                onChangeText={setCedNum}
                placeholder={tr('profile.idNumberPh')}
                placeholderTextColor={t.colors.textFaint}
                keyboardType="number-pad"
                maxLength={20}
                style={{ flex: 1, height: 52, borderRadius: radius.md, backgroundColor: t.colors.surfaceAlt, paddingHorizontal: spacing.md, color: t.colors.text }}
              />
            </View>

            {/* Correo de facturación (comprobante del pago; editable) */}
            <View style={{ gap: 4 }}>
              <TextInput
                value={datEmailFactura}
                onChangeText={setDatEmailFactura}
                placeholder={tr('profile.billingEmail')}
                placeholderTextColor={t.colors.textFaint}
                autoCapitalize="none"
                autoCorrect={false}
                keyboardType="email-address"
                inputMode="email"
                style={{ height: 52, borderRadius: radius.md, backgroundColor: t.colors.surfaceAlt, paddingHorizontal: spacing.md, color: t.colors.text }}
              />
              <AppText muted variant="caption" style={{ fontSize: 11 }}>{tr('pay.billingEmailHint')}</AppText>
            </View>

            <Button
              title={tr('pay.idSaveContinue')}
              onPress={guardarCedula}
              loading={guardandoCed}
              disabled={!cedNum.trim() || !datNombre.trim() || !datApellido.trim() || !datEmailFactura.trim()}
            />
          </Pressable>
        </Pressable>
      </Modal>

      {/* Bloqueo TOTAL mientras la pasarela procesa. Vista ABSOLUTA (no Modal):
          encadenar un Modal nativo con el cierre del checkout congelaba la
          pantalla en iOS. Captura los toques (sin pointerEvents) → bloquea igual. */}
      {paying && !checkout ? (
        <View style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: t.colors.overlay, alignItems: 'center', justifyContent: 'center', padding: spacing.xl }}>
          <View style={{ width: '100%', maxWidth: 320, backgroundColor: t.colors.bgElevated, borderRadius: radius['2xl'], padding: spacing.xl, alignItems: 'center', gap: spacing.md }}>
            <ActivityIndicator size="large" color={t.colors.brand} />
            <AppText variant="subtitle" style={{ textAlign: 'center' }}>{tr('pay.processing')}</AppText>
            <AppText muted variant="caption" style={{ textAlign: 'center' }}>{tr('pay.processingDesc')}</AppText>
          </View>
        </View>
      ) : null}
    </SafeAreaView>
  );
}
