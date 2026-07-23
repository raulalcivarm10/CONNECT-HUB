import { Tabs } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { Platform } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTheme } from '@/design-system/theme';
import { useI18n } from '@/i18n';

export default function TabsLayout() {
  const t = useTheme();
  const { t: tr } = useI18n();
  // Android 15+ dibuja edge-to-edge: la app queda DETRÁS de la barra de
  // navegación del sistema (botones/gestos). Hay que sumar el inset inferior
  // a la tab bar o los botones del sistema tapan las pestañas. En iOS se
  // conservan los valores fijos de siempre (no se toca su comportamiento).
  const insets = useSafeAreaInsets();
  const androidBottom = Math.max(insets.bottom, 8);
  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: t.colors.brand,
        tabBarInactiveTintColor: t.colors.textFaint,
        tabBarStyle: {
          backgroundColor: t.colors.bgElevated,
          borderTopColor: t.colors.border,
          height: Platform.OS === 'ios' ? 88 : 56 + androidBottom,
          paddingTop: 6,
          paddingBottom: Platform.OS === 'ios' ? 28 : androidBottom,
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
