import { useState } from 'react';
import { Alert, Pressable, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { Screen, AppText, Card } from '@/design-system/components';
import { Avatar } from '@/design-system/avatar';
import { useTheme } from '@/design-system/theme';
import { radius, spacing } from '@/design-system/tokens';
import { useI18n, LANGS, StringKey } from '@/i18n';
import { useSettings, TemaPref } from '@/store/settings';
import { useAuth } from '@/store/auth';
import { Button } from '@/design-system/components';
import { shadow } from '@/design-system/tokens';

const TEMAS: { key: TemaPref; icon: keyof typeof Ionicons.glyphMap; label: StringKey }[] = [
  { key: 'system', icon: 'phone-portrait-outline', label: 'profile.themeSystem' },
  { key: 'light', icon: 'sunny', label: 'profile.themeLight' },
  { key: 'dark', icon: 'moon', label: 'profile.themeDark' },
];

function Row({
  icon,
  label,
  value,
  onPress,
  danger,
}: {
  icon: keyof typeof Ionicons.glyphMap;
  label: string;
  value?: string;
  onPress?: () => void;
  danger?: boolean;
}) {
  const t = useTheme();
  return (
    <Pressable
      onPress={onPress}
      disabled={!onPress}
      style={({ pressed }) => ({
        flexDirection: 'row',
        alignItems: 'center',
        gap: spacing.md,
        paddingVertical: spacing.md,
        paddingHorizontal: spacing.lg,
        opacity: pressed ? 0.6 : 1,
      })}
    >
      <Ionicons name={icon} size={20} color={danger ? t.colors.danger : t.colors.brand} />
      <AppText style={{ flex: 1 }} color={danger ? t.colors.danger : undefined}>
        {label}
      </AppText>
      {value ? <AppText muted variant="caption">{value}</AppText> : null}
      {onPress && !danger ? <Ionicons name="chevron-forward" size={16} color={t.colors.textFaint} /> : null}
    </Pressable>
  );
}

export default function Perfil() {
  const t = useTheme();
  const { t: tr } = useI18n();
  const router = useRouter();
  const lang = useSettings((s) => s.lang);
  const setLang = useSettings((s) => s.setLang);
  const tema = useSettings((s) => s.tema);
  const setTema = useSettings((s) => s.setTema);
  const user = useAuth((s) => s.user);
  const status = useAuth((s) => s.status);
  const logout = useAuth((s) => s.logout);
  const deleteAccount = useAuth((s) => s.deleteAccount);
  const [deleting, setDeleting] = useState(false);

  const authed = status === 'authed' && !!user;

  function onDeleteAccount() {
    Alert.alert(tr('account.deleteTitle'), tr('account.deleteBody'), [
      { text: tr('common.cancel'), style: 'cancel' },
      {
        text: tr('account.deleteConfirm'),
        style: 'destructive',
        onPress: async () => {
          setDeleting(true);
          try {
            await deleteAccount();
            router.replace({ pathname: '/auth', params: { mode: 'login' } });
          } catch {
            Alert.alert(tr('account.deleteError'));
          } finally {
            setDeleting(false);
          }
        },
      },
    ]);
  }
  const displayName = user
    ? [user.nombre, user.apellido].filter(Boolean).join(' ') || user.email
    : '';

  return (
    <Screen padded>
      <View style={{ paddingTop: spacing.sm, paddingBottom: spacing.lg }}>
        <AppText variant="display">{tr('profile.title')}</AppText>
      </View>

      {/* Cuenta */}
      {authed ? (
        <Card style={{ padding: spacing.lg, marginBottom: spacing.lg, gap: spacing.md }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.md }}>
            <Avatar nombre={displayName || user!.email} fotoUrl={user!.fotoUrl} size={56} />
            <View style={{ flex: 1 }}>
              <AppText variant="subtitle" numberOfLines={1}>{displayName}</AppText>
              <AppText muted variant="caption" numberOfLines={1}>{user!.email}</AppText>
            </View>
          </View>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
            <Ionicons
              name={user!.isVerified ? 'checkmark-circle' : 'alert-circle-outline'}
              size={16}
              color={user!.isVerified ? t.colors.success : t.colors.warning}
            />
            <AppText variant="caption" color={user!.isVerified ? t.colors.success : t.colors.warning}>
              {user!.isVerified ? tr('auth.verified') : tr('auth.verifyPending')}
            </AppText>
          </View>
          <Button title={tr('profile.signOut')} variant="secondary" onPress={async () => { await logout(); router.replace({ pathname: '/auth', params: { mode: 'login' } }); }} />
        </Card>
      ) : (
        <Card style={{ padding: spacing.lg, marginBottom: spacing.lg, gap: spacing.md }}>
          <AppText variant="subtitle">{tr('auth.guest')}</AppText>
          <AppText muted variant="caption">{tr('auth.guestDesc')}</AppText>
          <View style={{ flexDirection: 'row', gap: spacing.md }}>
            <View style={{ flex: 1 }}>
              <Button title={tr('auth.signIn')} onPress={() => router.push('/auth')} />
            </View>
          </View>
        </Card>
      )}

      {/* Tema (claro / oscuro / sistema) */}
      <Card style={{ padding: spacing.lg, marginBottom: spacing.lg, gap: spacing.md }}>
        <AppText muted variant="label" style={{ textTransform: 'uppercase' }}>
          {tr('profile.theme')}
        </AppText>
        <View
          style={{
            flexDirection: 'row',
            gap: spacing.xs,
            padding: 4,
            borderRadius: radius.lg,
            backgroundColor: t.colors.surfaceAlt,
          }}
        >
          {TEMAS.map((opt) => {
            const active = tema === opt.key;
            return (
              <Pressable
                key={opt.key}
                onPress={() => setTema(opt.key)}
                style={({ pressed }) => [
                  {
                    flex: 1,
                    height: 72,
                    borderRadius: radius.md,
                    alignItems: 'center',
                    justifyContent: 'center',
                    gap: 6,
                    backgroundColor: active ? t.colors.brand : 'transparent',
                    transform: [{ scale: pressed ? 0.96 : 1 }],
                  },
                  active && shadow.card,
                ]}
              >
                <Ionicons name={opt.icon} size={24} color={active ? t.colors.onBrand : t.colors.textMuted} />
                <AppText variant="caption" color={active ? t.colors.onBrand : t.colors.textMuted} style={{ fontWeight: '600' }}>
                  {tr(opt.label)}
                </AppText>
              </Pressable>
            );
          })}
        </View>
      </Card>

      {/* Idioma */}
      <Card style={{ marginBottom: spacing.lg, overflow: 'hidden' }}>
        <View style={{ paddingHorizontal: spacing.lg, paddingTop: spacing.md }}>
          <AppText muted variant="label" style={{ textTransform: 'uppercase' }}>
            {tr('profile.language')}
          </AppText>
        </View>
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', padding: spacing.md, gap: spacing.sm }}>
          {LANGS.map((l) => {
            const active = lang === l.code;
            return (
              <Pressable
                key={l.code}
                onPress={() => setLang(l.code)}
                style={{
                  width: '47%',
                  flexGrow: 1,
                  height: 44,
                  borderRadius: radius.md,
                  alignItems: 'center',
                  justifyContent: 'center',
                  backgroundColor: active ? t.colors.brand : t.colors.surfaceAlt,
                }}
              >
                <AppText color={active ? t.colors.onBrand : t.colors.text} variant="bodyStrong">
                  {l.label}
                </AppText>
              </Pressable>
            );
          })}
        </View>
      </Card>

      {/* Networking */}
      {authed ? (
        <Card style={{ overflow: 'hidden', marginBottom: spacing.lg }}>
          <Row icon="person-circle-outline" label={tr('profile.myProfile')} onPress={() => router.push('/mi-perfil')} />
          <Row icon="people-outline" label={tr('connections.title')} onPress={() => router.push('/conexiones')} />
        </Card>
      ) : null}

      {/* Pagos */}
      {authed ? (
        <Card style={{ overflow: 'hidden', marginBottom: spacing.lg }}>
          <Row icon="card-outline" label={tr('cards.title')} onPress={() => router.push('/tarjetas')} />
        </Card>
      ) : null}

      {/* Instituciones (ver / agregar — puedes tener más de una) */}
      {authed ? (
        <Card style={{ overflow: 'hidden' }}>
          <Row icon="business-outline" label={tr('profile.myInstitutions')} onPress={() => router.push('/instituciones')} />
        </Card>
      ) : null}

      {/* Eliminar cuenta (App Store 5.1.1v) — acción destructiva con confirmación */}
      {authed ? (
        <Card style={{ overflow: 'hidden', marginTop: spacing.lg }}>
          <Row
            icon="trash-outline"
            label={deleting ? tr('account.deleting') : tr('profile.deleteAccount')}
            danger
            onPress={deleting ? undefined : onDeleteAccount}
          />
        </Card>
      ) : null}
    </Screen>
  );
}
