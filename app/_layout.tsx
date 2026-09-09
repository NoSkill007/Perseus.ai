import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { SQLiteProvider } from 'expo-sqlite';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { initializeDatabase, DATABASE_NAME } from '../src/services/database';

/**
 * Root Layout — Perseus.ai
 * Envuelve toda la app con SafeAreaProvider y SQLiteProvider.
 */
export default function RootLayout() {
  return (
    <SafeAreaProvider style={{ flex: 1, backgroundColor: '#0F172A' }}>
      <SQLiteProvider databaseName={DATABASE_NAME} onInit={initializeDatabase}>
        <StatusBar style="light" backgroundColor="#0F172A" />
        <Stack
          screenOptions={{
            headerShown: false,
            contentStyle: { backgroundColor: '#0F172A' },
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
              headerStyle: { backgroundColor: '#0F172A' },
              headerTintColor: '#F8FAFC',
              presentation: 'card',
            }}
          />
        </Stack>
      </SQLiteProvider>
    </SafeAreaProvider>
  );
}
