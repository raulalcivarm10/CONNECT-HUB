/**
 * Tokens base del design system ConnectHub. Escalas crudas (no semánticas);
 * los temas claro/oscuro en theme.ts mapean estos a roles (fondo, texto…).
 */

export const palette = {
  // Marca ConnectHub — morado #7E00DD (acento por institución puede sobreescribir)
  brand50: '#F7EBFF',
  brand100: '#ECD6FF',
  brand200: '#DBB3FF',
  brand300: '#C489FF',
  brand400: '#A64DF7',
  brand500: '#8F1FE6',
  brand600: '#7E00DD',
  brand700: '#6600B0',
  brand800: '#4E0088',
  brand900: '#240940',

  violet500: '#A64DF7',
  cyan400: '#22D3EE',
  pink500: '#EC4899',

  // Neutros
  white: '#FFFFFF',
  black: '#000000',
  slate50: '#F8FAFC',
  slate100: '#F1F5F9',
  slate150: '#E9EEF5',
  slate200: '#E2E8F0',
  slate300: '#CBD5E1',
  slate400: '#94A3B8',
  slate500: '#64748B',
  slate600: '#475569',
  slate700: '#334155',
  slate800: '#1E293B',
  slate900: '#0F172A',
  slate950: '#080D1A',

  // Semánticos de estado
  green500: '#22C55E',
  green600: '#16A34A',
  amber500: '#F59E0B',
  red500: '#EF4444',
} as const;

export const spacing = {
  xs: 4,
  sm: 8,
  md: 12,
  lg: 16,
  xl: 24,
  '2xl': 32,
  '3xl': 48,
  '4xl': 64,
} as const;

export const radius = {
  sm: 8,
  md: 12,
  lg: 16,
  xl: 22,
  '2xl': 28,
  full: 999,
} as const;

export const fontSize = {
  xs: 12,
  sm: 13,
  base: 15,
  md: 16,
  lg: 18,
  xl: 22,
  '2xl': 28,
  '3xl': 34,
  '4xl': 42,
} as const;

export const fontWeight = {
  regular: '400',
  medium: '500',
  semibold: '600',
  bold: '700',
  heavy: '800',
} as const;

export const shadow = {
  // sombra suave para tarjetas (iOS + Android elevation)
  card: {
    shadowColor: '#0B1220',
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.1,
    shadowRadius: 16,
    elevation: 4,
  },
  floating: {
    shadowColor: '#0B1220',
    shadowOffset: { width: 0, height: 12 },
    shadowOpacity: 0.18,
    shadowRadius: 24,
    elevation: 10,
  },
} as const;

export type Spacing = keyof typeof spacing;
export type Radius = keyof typeof radius;
