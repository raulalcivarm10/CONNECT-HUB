import { Tabs } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { Platform } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTheme } from '@/design-system/theme';
import { useI18n } from '@/i18n';

export default function TabsLayout() {
  const t = useTheme();
  const { t: tr } = useI18n();
  const insets = useSafeAreaInsets();
  // Android va SIEMPRE edge-to-edge (Expo SDK 57). Historia de esta barra:
  //  1) Altura fija → los botones del sistema tapaban las pestañas.
  //  2) Sin altura (inset de React Navigation v7) → dejó de taparse, pero las
  //     etiquetas quedaban PEGADAS a la barra del sistema, sin aire (reporte
  //     del usuario con captura).
  //  3) Ahora: altura y padding propios sobre el inset REAL, con un piso de
  //     8dp para el caso que rompió la variante 1 (insets.bottom llegando en
  //     0). Contenido de 58dp -> ~9dp más de aire que el default de v7.
  // iOS conserva EXACTAMENTE sus valores fijos de siempre.
  const abajoAndroid = Math.max(insets.bottom, 8);
  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: t.colors.brand,
        tabBarInactiveTintColor: t.colors.textFaint,
        tabBarStyle: {
          backgroundColor: t.colors.bgElevated,
          borderTopColor: t.colors.border,
          paddingTop: 6,
          ...(Platform.OS === 'ios'
            ? { height: 88, paddingBottom: 28 }
            : { height: 58 + abajoAndroid, paddingBottom: abajoAndroid }),
        },
        tabBarLabelStyle: { fontSize: 11, fontWeight: '600' },
      }}
    >
      <Tabs.Screen
        name="index"
        options={{
          title: tr('tabs.home'),
          tabBarIcon: ({ color, size }) => <Ionicons name="compass" size={size} color={color} />,
        }}
      />
      <Tabs.Screen
        name="agenda"
        options={{
          title: tr('tabs.agenda'),
          tabBarIcon: ({ color, size }) => <Ionicons name="bookmark" size={size} color={color} />,
        }}
      />
      <Tabs.Screen
        name="entradas"
        options={{
          title: tr('tabs.tickets'),
          tabBarIcon: ({ color, size }) => <Ionicons name="ticket" size={size} color={color} />,
        }}
      />
      <Tabs.Screen
        name="comunidad"
        options={{
          title: tr('tabs.community'),
          tabBarIcon: ({ color, size }) => <Ionicons name="chatbubbles" size={size} color={color} />,
        }}
      />
      <Tabs.Screen
        name="perfil"
        options={{
          title: tr('tabs.profile'),
          tabBarIcon: ({ color, size }) => <Ionicons name="person-circle" size={size} color={color} />,
        }}
      />
    </Tabs>
  );
}
