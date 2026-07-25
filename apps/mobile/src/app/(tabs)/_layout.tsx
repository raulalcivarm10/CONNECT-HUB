import { Tabs } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { Platform } from 'react-native';
import { useTheme } from '@/design-system/theme';
import { useI18n } from '@/i18n';

export default function TabsLayout() {
  const t = useTheme();
  const { t: tr } = useI18n();
  // Android va SIEMPRE edge-to-edge (Expo SDK 57): la app se dibuja detrás de la
  // barra de navegación del sistema. Antes forzábamos la altura sumando el inset
  // a mano, pero si `insets.bottom` llega en 0 el margen se quedaba corto y los
  // botones del sistema tapaban las pestañas. Ahora NO fijamos altura en Android:
  // React Navigation v7 añade solo el inset inferior correcto a la tab bar
  // (`tabBarSafeAreaInset` interno). iOS conserva EXACTAMENTE sus valores fijos.
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
          ...(Platform.OS === 'ios' ? { height: 88, paddingBottom: 28 } : {}),
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
