import React, { useEffect, useState } from 'react';
import { ActivityIndicator, View, StyleSheet } from 'react-native';
import { useRouter } from 'expo-router';
import { useSQLiteContext } from 'expo-sqlite';
import { hasProfile } from '../src/services/profileService';
import { useTheme } from '../src/context/ThemeContext';

/**
 * Index — Redirector
 * Si no hay perfil → onboarding, si hay perfil → (tabs)
 */
export default function Index() {
  const { theme } = useTheme();
  const db = useSQLiteContext();
  const router = useRouter();
  const [checking, setChecking] = useState(true);

  useEffect(() => {
    try {
      const profileExists = hasProfile(db);
      if (profileExists) {
        router.replace('/(tabs)');
      } else {
        router.replace('/onboarding');
      }
    } catch (err) {
      console.error('[Index] Error verificando perfil:', err);
      router.replace('/onboarding');
    } finally {
      setChecking(false);
    }
  }, []);

  return (
    <View style={[styles.container, { backgroundColor: theme.background }]}>
      <ActivityIndicator size="large" color={theme.primary} />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
});
