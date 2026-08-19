import { View } from 'react-native';
import { AppText } from './components';
import { AppImage } from './image';
import { useTheme } from './theme';
import { radius, fontWeight } from './tokens';
import { absoluteUrl, imagenAncho } from '@/api/client';

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
      <AppImage
        // Ancho generoso (200) para un avatar de 46-72 px: cubre pantallas de 3x
        // sin que se vea pixelado, y aun asi baja ~6 KB en vez de la foto entera.
        source={{ uri: imagenAncho(absoluteUrl(fotoUrl), 200) }}
        contentFit="cover"
        // En listas (comunidad, conexiones) las filas se reciclan: sin
        // recyclingKey se ve un instante la foto de OTRA persona.
        recyclingKey={fotoUrl}
        transition={150}
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
