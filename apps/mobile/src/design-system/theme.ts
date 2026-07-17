/**
 * Temas semánticos claro/oscuro + hook useTheme(). El color de acento (brand)
 * puede tematizarse por institución más adelante (Whova-style).
 */
import { useColorScheme } from 'react-native';
import { palette } from './tokens';
import { useSettings } from '@/store/settings';

export interface Theme {
  mode: 'light' | 'dark';
  colors: {
    bg: string;
    bgElevated: string;
    surface: string;
    surfaceAlt: string;
    card: string;
    border: string;
    borderStrong: string;
    text: string;
    textMuted: string;
    textFaint: string;
    onBrand: string;
    brand: string;
    brandSoft: string;
    brandText: string;
    success: string;
    warning: string;
    danger: string;
    overlay: string;
  };
}

export const lightTheme: Theme = {
  mode: 'light',
  colors: {
    bg: palette.slate50,
    bgElevated: palette.white,
    surface: palette.white,
    surfaceAlt: palette.slate100,
    card: palette.white,
    border: palette.slate200,
    borderStrong: palette.slate300,
    text: palette.slate900,
    textMuted: palette.slate500,
    textFaint: palette.slate400,
    onBrand: palette.white,
    brand: palette.brand600,
    brandSoft: palette.brand50,
    brandText: palette.brand700,
    success: palette.green600,
    warning: palette.amber500,
    danger: palette.red500,
    overlay: 'rgba(8,13,26,0.55)',
  },
};

export const darkTheme: Theme = {
  mode: 'dark',
  colors: {
    bg: palette.slate950,
    bgElevated: palette.slate900,
    surface: palette.slate900,
    surfaceAlt: palette.slate800,
    card: '#111A2E',
    border: '#22304B',
    borderStrong: '#2E3E5C',
    text: palette.slate50,
    textMuted: palette.slate400,
    textFaint: palette.slate500,
    onBrand: palette.white,
    brand: palette.brand400,
    brandSoft: 'rgba(91,91,240,0.16)',
    brandText: palette.brand300,
    success: palette.green500,
    warning: palette.amber500,
    danger: palette.red500,
    overlay: 'rgba(2,6,16,0.7)',
  },
};

/** Resuelve el modo efectivo (preferencia del usuario o el del sistema). */
export function useThemeMode(): 'light' | 'dark' {
  const scheme = useColorScheme();
  const pref = useSettings((s) => s.tema);
  const mode = pref === 'system' ? scheme : pref;
  return mode === 'dark' ? 'dark' : 'light';
}

export function useTheme(): Theme {
  return useThemeMode() === 'dark' ? darkTheme : lightTheme;
}

export { palette, spacing, radius, fontSize, fontWeight, shadow } from './tokens';
