/**
 * Piezas UI reutilizables tematizadas. Todas leen useTheme() para claro/oscuro.
 */
import { ReactNode, useEffect } from 'react';
import {
  ActivityIndicator,
  Pressable,
  PressableProps,
  ScrollView,
  StyleProp,
  Text,
  TextProps,
  TextStyle,
  View,
  ViewProps,
  ViewStyle,
} from 'react-native';
import { SafeAreaView, Edge } from 'react-native-safe-area-context';
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withRepeat,
  withSequence,
  withTiming,
} from 'react-native-reanimated';
import { useTheme } from './theme';
import { fontSize, fontWeight, radius, spacing, shadow } from './tokens';

/* ---------- Screen ---------- */
export function Screen({
  children,
  edges = ['top'],
  style,
  padded,
  scroll,
}: {
  children: ReactNode;
  edges?: Edge[];
  style?: StyleProp<ViewStyle>;
  padded?: boolean;
  /** Envuelve el contenido en un ScrollView (para pantallas con contenido más alto que la vista). */
  scroll?: boolean;
}) {
  const t = useTheme();
  const pad = padded ? { paddingHorizontal: spacing.lg } : null;
  return (
    <SafeAreaView
      edges={edges}
      style={[{ flex: 1, backgroundColor: t.colors.bg }, style]}
    >
      {scroll ? (
        <ScrollView
          style={{ flex: 1 }}
          contentContainerStyle={[{ flexGrow: 1, paddingBottom: spacing['3xl'] }, pad]}
          showsVerticalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
        >
          {children}
        </ScrollView>
      ) : (
        <View style={[{ flex: 1 }, pad]}>{children}</View>
      )}
    </SafeAreaView>
  );
}

/* ---------- Text ---------- */
type TxtVariant =
  | 'display'
  | 'title'
  | 'subtitle'
  | 'body'
  | 'bodyStrong'
  | 'caption'
  | 'label';

const variantStyle: Record<TxtVariant, TextStyle> = {
  display: { fontSize: fontSize['3xl'], fontWeight: fontWeight.heavy, letterSpacing: -0.5 },
  title: { fontSize: fontSize.xl, fontWeight: fontWeight.bold, letterSpacing: -0.3 },
  subtitle: { fontSize: fontSize.lg, fontWeight: fontWeight.semibold },
  body: { fontSize: fontSize.md, fontWeight: fontWeight.regular },
  bodyStrong: { fontSize: fontSize.md, fontWeight: fontWeight.semibold },
  caption: { fontSize: fontSize.sm, fontWeight: fontWeight.regular },
  label: { fontSize: fontSize.xs, fontWeight: fontWeight.semibold, letterSpacing: 0.4 },
};

export function AppText({
  variant = 'body',
  color,
  muted,
  style,
  children,
  ...rest
}: TextProps & {
  variant?: TxtVariant;
  color?: string;
  muted?: boolean;
}) {
  const t = useTheme();
  const c = color ?? (muted ? t.colors.textMuted : t.colors.text);
  return (
    <Text {...rest} style={[variantStyle[variant], { color: c }, style]}>
      {children}
    </Text>
  );
}

/* ---------- Card ---------- */
export function Card({
  children,
  style,
  elevated = true,
  ...rest
}: ViewProps & { elevated?: boolean }) {
  const t = useTheme();
  return (
    <View
      {...rest}
      style={[
        {
          backgroundColor: t.colors.card,
          borderRadius: radius.lg,
          borderWidth: 1,
          borderColor: t.colors.border,
        },
        elevated && shadow.card,
        style,
      ]}
    >
      {children}
    </View>
  );
}

/* ---------- Chip / Pill ---------- */
export function Chip({
  label,
  tone = 'neutral',
  style,
}: {
  label: string;
  tone?: 'neutral' | 'brand' | 'success' | 'warning';
  style?: StyleProp<ViewStyle>;
}) {
  const t = useTheme();
  const bg =
    tone === 'brand'
      ? t.colors.brandSoft
      : tone === 'success'
        ? 'rgba(34,197,94,0.14)'
        : tone === 'warning'
          ? 'rgba(245,158,11,0.16)'
          : t.colors.surfaceAlt;
  const fg =
    tone === 'brand'
      ? t.colors.brandText
      : tone === 'success'
        ? t.colors.success
        : tone === 'warning'
          ? t.colors.warning
          : t.colors.textMuted;
  return (
    <View
      style={[
        {
          alignSelf: 'flex-start',
          backgroundColor: bg,
          paddingHorizontal: spacing.md,
          paddingVertical: spacing.xs + 1,
          borderRadius: radius.full,
        },
        style,
      ]}
    >
      <Text style={{ color: fg, fontSize: fontSize.xs, fontWeight: fontWeight.semibold }}>
        {label}
      </Text>
    </View>
  );
}

/* ---------- Button ---------- */
export function Button({
  title,
  onPress,
  variant = 'primary',
  loading,
  disabled,
  style,
  ...rest
}: PressableProps & {
  title: string;
  variant?: 'primary' | 'secondary' | 'ghost';
  loading?: boolean;
}) {
  const t = useTheme();
  const isPrimary = variant === 'primary';
  const isGhost = variant === 'ghost';
  const bg = isPrimary ? t.colors.brand : isGhost ? 'transparent' : t.colors.surfaceAlt;
  const fg = isPrimary ? t.colors.onBrand : t.colors.text;
  return (
    <Pressable
      {...rest}
      onPress={onPress}
      disabled={disabled || loading}
      style={({ pressed }) => [
        {
          height: 52,
          borderRadius: radius.lg,
          alignItems: 'center',
          justifyContent: 'center',
          backgroundColor: bg,
          borderWidth: isGhost ? 0 : isPrimary ? 0 : 1,
          borderColor: t.colors.border,
          opacity: disabled ? 0.5 : pressed ? 0.85 : 1,
          transform: [{ scale: pressed ? 0.985 : 1 }],
        },
        isPrimary && shadow.card,
        style as StyleProp<ViewStyle>,
      ]}
    >
      {loading ? (
        <ActivityIndicator color={fg} />
      ) : (
        <Text style={{ color: fg, fontSize: fontSize.md, fontWeight: fontWeight.bold }}>
          {title}
        </Text>
      )}
    </Pressable>
  );
}

/* ---------- Skeleton (shimmer por opacidad) ---------- */
export function Skeleton({
  width,
  height,
  radius: r = radius.md,
  style,
}: {
  width?: number | `${number}%`;
  height: number;
  radius?: number;
  style?: StyleProp<ViewStyle>;
}) {
  const t = useTheme();
  const opacity = useSharedValue(0.5);
  useEffect(() => {
    opacity.value = withRepeat(
      withSequence(withTiming(1, { duration: 700 }), withTiming(0.5, { duration: 700 })),
      -1,
      true,
    );
  }, [opacity]);
  const anim = useAnimatedStyle(() => ({ opacity: opacity.value }));
  return (
    <Animated.View
      style={[
        { width: width ?? '100%', height, borderRadius: r, backgroundColor: t.colors.surfaceAlt },
        anim,
        style,
      ]}
    />
  );
}
