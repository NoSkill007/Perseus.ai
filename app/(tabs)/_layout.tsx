import { Tabs } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useSQLiteContext } from 'expo-sqlite';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { getUserRole } from '../../src/services/profileService';
import { useTheme } from '../../src/context/ThemeContext';

/**
 * Tab Navigator — Perseus.ai
 * 5 tabs: Inicio, Reportar, Historial, Sincronizar, Perfil
 * Ajusta automáticamente el padding inferior según los gestos o botones del sistema.
 */
export default function TabLayout() {
  const db = useSQLiteContext();
  const insets = useSafeAreaInsets();
  const role = getUserRole(db);
  const isRescatista = role === 'rescatista';
  const { theme } = useTheme();

  const bottomInset = insets.bottom > 0 ? insets.bottom : 8;

  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarStyle: {
          backgroundColor: theme.tabBarBg,
          borderTopColor: theme.tabBarBorder,
          borderTopWidth: 1,
          height: 56 + bottomInset,
          paddingBottom: bottomInset,
          paddingTop: 6,
        },
        tabBarActiveTintColor: theme.tabBarActive,
        tabBarInactiveTintColor: theme.tabBarInactive,
        tabBarLabelStyle: {
          fontSize: 11,
          fontWeight: '600',
        },
      }}
    >
      <Tabs.Screen
        name="index"
        options={{
          title: isRescatista ? 'Panel' : 'Inicio',
          tabBarIcon: ({ color, size }) => (
            <Ionicons name={isRescatista ? 'shield-checkmark' : 'home'} size={size} color={color} />
          ),
        }}
      />
      <Tabs.Screen
        name="reportar"
        options={{
          title: 'Reportar',
          tabBarIcon: ({ color, size }) => (
            <Ionicons name="warning" size={size} color={color} />
          ),
        }}
      />
      <Tabs.Screen
        name="historial"
        options={{
          title: 'Historial',
          tabBarIcon: ({ color, size }) => (
            <Ionicons name="list" size={size} color={color} />
          ),
        }}
      />
      <Tabs.Screen
        name="sincronizar"
        options={{
          title: 'P2P',
          tabBarIcon: ({ color, size }) => (
            <Ionicons name="sync" size={size} color={color} />
          ),
        }}
      />
      <Tabs.Screen
        name="perfil"
        options={{
          title: 'Perfil',
          tabBarIcon: ({ color, size }) => (
            <Ionicons name="person" size={size} color={color} />
          ),
        }}
      />
    </Tabs>
  );
}
