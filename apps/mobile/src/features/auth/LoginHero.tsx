import { useEffect } from 'react';
import { useWindowDimensions, View } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { SafeAreaView } from 'react-native-safe-area-context';
import Animated, {
  Easing,
  interpolate,
  useAnimatedStyle,
  useSharedValue,
  withDelay,
  withRepeat,
  withSequence,
  withSpring,
  withTiming,
} from 'react-native-reanimated';
import { AppText } from '@/design-system/components';
import { palette, spacing, radius, fontSize, shadow } from '@/design-system/tokens';
import { useI18n } from '@/i18n';
import LogoMark from '@/assets/logo-mark.svg';

/** Diamante de marca (motivo del logo) flotando en el fondo del hero. */
interface ShapeCfg {
  top: string;
  left: string;
  size: number;
  color: string;
  opacity: number;
  dur: number;
  delay: number;
  drift: number;
  rot: number;
}

const SHAPES: ShapeCfg[] = [
  { top: '4%', left: '-8%', size: 120, color: palette.violet500, opacity: 0.35, dur: 5200, delay: 0, drift: 24, rot: 12 },
  { top: '10%', left: '74%', size: 150, color: palette.brand800, opacity: 0.4, dur: 6200, delay: 700, drift: 28, rot: 14 },
  { top: '58%', left: '82%', size: 84, color: palette.brand300, opacity: 0.3, dur: 4200, delay: 500, drift: 18, rot: -10 },
  { top: '70%', left: '-4%', size: 96, color: palette.white, opacity: 0.14, dur: 4800, delay: 250, drift: 18, rot: -12 },
  { top: '40%', left: '4%', size: 56, color: palette.white, opacity: 0.12, dur: 3800, delay: 900, drift: 14, rot: 18 },
  { top: '30%', left: '62%', size: 46, color: palette.violet500, opacity: 0.28, dur: 3400, delay: 1200, drift: 12, rot: -16 },
  { top: '80%', left: '46%', size: 64, color: palette.brand400, opacity: 0.24, dur: 5600, delay: 400, drift: 20, rot: 10 },
];

function FloatingShape({ cfg }: { cfg: ShapeCfg }) {
  const p = useSharedValue(0);
  useEffect(() => {
    p.value = withDelay(
      cfg.delay,
      withRepeat(withTiming(1, { duration: cfg.dur, easing: Easing.inOut(Easing.sin) }), -1, true),
    );
  }, [cfg.delay, cfg.dur, p]);

  const style = useAnimatedStyle(() => ({
    transform: [
      { translateY: interpolate(p.value, [0, 1], [-cfg.drift, cfg.drift]) },
      { translateX: interpolate(p.value, [0, 1], [cfg.drift * 0.5, -cfg.drift * 0.5]) },
      { rotate: `${45 + interpolate(p.value, [0, 1], [-cfg.rot, cfg.rot])}deg` },
    ],
    opacity: interpolate(p.value, [0, 0.5, 1], [cfg.opacity * 0.6, cfg.opacity, cfg.opacity * 0.6]),
  }));

  return (
    <Animated.View
      pointerEvents="none"
      style={[
        {
          position: 'absolute',
          top: cfg.top as unknown as number,
          left: cfg.left as unknown as number,
          width: cfg.size,
          height: cfg.size,
          borderRadius: cfg.size * 0.16,
          backgroundColor: cfg.color,
          borderWidth: 2,
          borderColor: 'rgba(255,255,255,0.28)',
        },
        style,
      ]}
    />
  );
}

/** Onda que emana desde el logo (ripple). */
function Ripple({ delay }: { delay: number }) {
  const p = useSharedValue(0);
  useEffect(() => {
    p.value = withDelay(delay, withRepeat(withTiming(1, { duration: 3000, easing: Easing.out(Easing.ease) }), -1, false));
  }, [delay, p]);
  const style = useAnimatedStyle(() => ({
    transform: [{ scale: interpolate(p.value, [0, 1], [0.75, 2.3]) }],
    opacity: interpolate(p.value, [0, 0.12, 1], [0, 0.55, 0]),
  }));
  return (
    <Animated.View
      pointerEvents="none"
      style={[
        {
          position: 'absolute',
          width: 108,
          height: 108,
          borderRadius: radius['2xl'],
          borderWidth: 2.5,
          borderColor: 'rgba(255,255,255,0.65)',
        },
        style,
      ]}
    />
  );
}

export function LoginHero({ isRegister }: { isRegister: boolean }) {
  const { t: tr } = useI18n();
  const { height } = useWindowDimensions();
  const heroHeight = Math.max(320, Math.min(height * 0.46, 440));

  // Entrada (spring) + respiración continua del logo.
  const enter = useSharedValue(0);
  const breathe = useSharedValue(0);
  const glow = useSharedValue(0);

  useEffect(() => {
    enter.value = withSpring(1, { damping: 12, stiffness: 90, mass: 0.9 });
    breathe.value = withRepeat(withTiming(1, { duration: 2800, easing: Easing.inOut(Easing.quad) }), -1, true);
    glow.value = withRepeat(
      withSequence(
        withTiming(1, { duration: 1700, easing: Easing.inOut(Easing.quad) }),
        withTiming(0, { duration: 1700, easing: Easing.inOut(Easing.quad) }),
      ),
      -1,
      false,
    );
  }, [enter, breathe, glow]);

  const logoStyle = useAnimatedStyle(() => ({
    opacity: enter.value,
    transform: [
      { scale: interpolate(enter.value, [0, 1], [0.5, 1]) * (1 + breathe.value * 0.05) },
      { translateY: interpolate(enter.value, [0, 1], [30, 0]) },
    ],
  }));

  const glowStyle = useAnimatedStyle(() => ({
    opacity: interpolate(glow.value, [0, 1], [0.28, 0.85]),
    transform: [{ scale: interpolate(glow.value, [0, 1], [1, 1.3]) }],
  }));

  const textStyle = useAnimatedStyle(() => ({
    opacity: enter.value,
    transform: [{ translateY: interpolate(enter.value, [0, 1], [18, 0]) }],
  }));

  return (
    <LinearGradient
      colors={[palette.brand900, palette.brand700, palette.brand500, palette.violet500]}
      locations={[0, 0.4, 0.75, 1]}
      start={{ x: 0.15, y: 0 }}
      end={{ x: 0.85, y: 1 }}
      style={{ height: heroHeight, overflow: 'hidden' }}
    >
      {/* Fondo animado: diamantes de marca flotando */}
      <View pointerEvents="none" style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0 }}>
        {SHAPES.map((cfg, i) => (
          <FloatingShape key={i} cfg={cfg} />
        ))}
      </View>

      <SafeAreaView edges={['top']} style={{ flex: 1 }}>
        <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: spacing.xl }}>
          {/* Logo con halo pulsante + ondas emanando */}
          <Animated.View style={[{ width: 150, height: 150, marginBottom: spacing.lg, alignItems: 'center', justifyContent: 'center' }, logoStyle]}>
            <Animated.View
              pointerEvents="none"
              style={[
                { position: 'absolute', width: 150, height: 150, borderRadius: radius.full, backgroundColor: palette.violet500 },
                glowStyle,
              ]}
            />
            <Ripple delay={0} />
            <Ripple delay={1000} />
            <Ripple delay={2000} />
            {/* caja blanca con SOLO el símbolo del cubo (sin el texto del lockup) */}
            <View
              style={{
                width: 96,
                height: 96,
                borderRadius: radius['2xl'],
                backgroundColor: palette.white,
                alignItems: 'center',
                justifyContent: 'center',
                ...shadow.floating,
              }}
            >
              <LogoMark width={60} height={60} />
            </View>
          </Animated.View>

          <Animated.View style={[{ alignItems: 'center' }, textStyle]}>
            <View style={{ flexDirection: 'row', alignItems: 'baseline' }}>
              <AppText color={palette.white} style={{ fontSize: 42, fontWeight: '800', letterSpacing: -0.8 }}>Connect</AppText>
              <AppText color={palette.brand200} style={{ fontSize: 42, fontWeight: '800', letterSpacing: -0.8 }}>Hub</AppText>
            </View>
            <AppText color="rgba(255,255,255,0.88)" style={{ marginTop: 8, fontSize: fontSize.md, textAlign: 'center', maxWidth: 300 }}>
              {isRegister ? tr('auth.signUpSubtitle') : tr('auth.signInSubtitle')}
            </AppText>
          </Animated.View>
        </View>
      </SafeAreaView>
    </LinearGradient>
  );
}
