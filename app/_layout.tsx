import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { SQLiteProvider } from 'expo-sqlite';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { initializeDatabase, DATABASE_NAME } from '../src/services/database';
import { ThemeProvider, useTheme } from '../src/context/ThemeContext';

/**
 * Navegación principal adaptativa al tema
 */
function RootNavigation() {
  const { theme, isDark } = useTheme();

  return (
    <SafeAreaProvider style={{ flex: 1, backgroundColor: theme.background }}>
      <StatusBar style={isDark ? 'light' : 'dark'} backgroundColor={theme.background} />
      <Stack
        screenOptions={{
          headerShown: false,
          contentStyle: { backgroundColor: theme.background },
          animation: 'slide_from_right',
        }}
      >
        <Stack.Screen name="index" />
        <Stack.Screen name="onboarding" options={{ gestureEnabled: false }} />
        <Stack.Screen name="(tabs)" options={{ gestureEnabled: false }} />
        <Stack.Screen
          name="report/[id]"
          options={{
            headerShown: true,
            headerTitle: 'Detalle del Reporte',
            headerStyle: { backgroundColor: theme.background },
            headerTintColor: theme.text,
            presentation: 'card',
          }}
        />
        <Stack.Screen
          name="review/[id]"
          options={{
            headerShown: false,
            presentation: 'card',
          }}
        />
      </Stack>
    </SafeAreaProvider>
  );
}

/**
 * Root Layout — Perseus.ai
 * Envuelve toda la app con SQLiteProvider y ThemeProvider.
 */
export default function RootLayout() {
  return (
    <SQLiteProvider databaseName={DATABASE_NAME} onInit={initializeDatabase}>
      <ThemeProvider>
        <RootNavigation />
      </ThemeProvider>
    </SQLiteProvider>
  );
}
