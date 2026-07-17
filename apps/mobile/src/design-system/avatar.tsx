import { View } from 'react-native';
import { Image } from 'expo-image';
import { AppText } from './components';
import { useTheme } from './theme';
import { radius, fontWeight } from './tokens';
import { absoluteUrl } from '@/api/client';

/** Avatar con foto (si hay) o iniciales del nombre. */
export function Avatar({
  nombre,
  fotoUrl,
  size = 44,
}: {
  nombre?: string | null;
  fotoUrl?: string | null;
  size?: number;
}) {
  const t = useTheme();
  if (fotoUrl) {
    return (
      <Image
        source={{ uri: absoluteUrl(fotoUrl) }}
        style={{ width: size, height: size, borderRadius: radius.full, backgroundColor: t.colors.surfaceAlt }}
      />
    );
  }
  const inicial = (nombre || '?').trim().charAt(0).toUpperCase();
  return (
    <View
      style={{
        width: size,
        height: size,
        borderRadius: radius.full,
        backgroundColor: t.colors.brandSoft,
        alignItems: 'center',
        justifyContent: 'center',
      }}
    >
      <AppText color={t.colors.brandText} style={{ fontWeight: fontWeight.bold, fontSize: size * 0.4 }}>
        {inicial}
      </AppText>
    </View>
  );
}
