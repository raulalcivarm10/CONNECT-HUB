import { useState } from 'react';
import { View } from 'react-native';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { Screen, AppText, Button } from '@/design-system/components';
import { useConfirm } from '@/design-system/confirm';
import { useTheme } from '@/design-system/theme';
import { spacing, radius } from '@/design-system/tokens';
import { useI18n } from '@/i18n';
import { useAuth } from '@/store/auth';
import { meReq, resendVerificationReq } from '@/api/auth';

/**
 * Muro de verificación de correo. Solo lo ven los que se registraron con
 * correo/clave y aún no confirmaron (Apple/Google entran verificados). Bloquea
 * el acceso a la app hasta que el usuario confirme su correo por el enlace.
 */
export default function VerificarCorreo() {
  const t = useTheme();
  const { t: tr } = useI18n();
  const router = useRouter();
  const confirm = useConfirm();
  const email = useAuth((s) => s.user?.email ?? '');
  const setUser = useAuth((s) => s.setUser);
  const logout = useAuth((s) => s.logout);
  const [checking, setChecking] = useState(false);
  const [resending, setResending] = useState(false);

  async function yaVerifique() {
    setChecking(true);
    try {
      const u = await meReq();
      setUser(u);
      if (u.isVerified) router.replace('/');
      else await confirm({ title: tr('verify.stillPending'), message: tr('verify.stillPendingBody'), confirmText: tr('common.close'), icon: 'time-outline' });
    } catch {
      await confirm({ title: tr('common.error'), confirmText: tr('common.close') });
    } finally {
      setChecking(false);
    }
  }

  async function reenviar() {
    setResending(true);
    try {
      await resendVerificationReq();
      await confirm({ title: tr('verify.resent'), message: email, confirmText: tr('common.close'), icon: 'mail-outline' });
    } catch {
      await confirm({ title: tr('common.error'), confirmText: tr('common.close') });
    } finally {
      setResending(false);
    }
  }

  return (
    <Screen padded>
      <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', gap: spacing.md }}>
        <View style={{ width: 84, height: 84, borderRadius: radius.full, backgroundColor: t.colors.brandSoft, alignItems: 'center', justifyContent: 'center' }}>
          <Ionicons name="mail-unread-outline" size={40} color={t.colors.brand} />
        </View>
        <AppText variant="title" style={{ textAlign: 'center' }}>{tr('verify.title')}</AppText>
        <AppText muted style={{ textAlign: 'center' }}>{tr('verify.body')}</AppText>
        <AppText variant="bodyStrong" color={t.colors.brandText} style={{ textAlign: 'center' }}>{email}</AppText>
        <View style={{ alignSelf: 'stretch', gap: spacing.sm, marginTop: spacing.lg }}>
          <Button title={tr('verify.done')} onPress={yaVerifique} loading={checking} />
          <Button title={tr('verify.resend')} variant="secondary" onPress={reenviar} loading={resending} />
          <Button title={tr('profile.signOut')} variant="ghost" onPress={async () => { await logout(); router.replace('/auth'); }} />
        </View>
      </View>
    </Screen>
  );
}
