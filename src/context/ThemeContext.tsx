import React, { createContext, useContext, useEffect, useState, useMemo } from 'react';
import { useColorScheme } from 'react-native';
import { useSQLiteContext } from 'expo-sqlite';
import {
  ThemeColors,
  ThemeMode,
  ActiveTheme,
  DARK_THEME,
  LIGHT_THEME,
  getTheme,
} from '../constants/theme';
import { getAppSetting, setAppSetting } from '../services/database';

export interface ThemeContextValue {
  mode: ThemeMode;
  activeTheme: ActiveTheme;
  theme: ThemeColors;
  isDark: boolean;
  setThemeMode: (mode: ThemeMode) => void;
}

const ThemeContext = createContext<ThemeContextValue>({
  mode: 'system',
  activeTheme: 'dark',
  theme: DARK_THEME,
  isDark: true,
  setThemeMode: () => {},
});

export const SETTING_KEY_THEME = 'theme_mode';

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const db = useSQLiteContext();
  const systemColorScheme = useColorScheme();
  const [mode, setMode] = useState<ThemeMode>('system');

  // Cargar preferencia guardada en SQLite al iniciar
  useEffect(() => {
    try {
      const saved = getAppSetting(db, SETTING_KEY_THEME);
      if (saved === 'dark' || saved === 'light' || saved === 'system') {
        setMode(saved as ThemeMode);
      }
    } catch (err) {
      console.warn('[ThemeContext] Error al cargar preferencia de tema:', err);
    }
  }, [db]);

  const setThemeMode = (newMode: ThemeMode) => {
    setMode(newMode);
    try {
      setAppSetting(db, SETTING_KEY_THEME, newMode);
    } catch (err) {
      console.warn('[ThemeContext] Error al guardar preferencia de tema:', err);
    }
  };

  const activeTheme: ActiveTheme = useMemo(() => {
    if (mode === 'system') {
      return systemColorScheme === 'light' ? 'light' : 'dark';
    }
    return mode;
  }, [mode, systemColorScheme]);

  const isDark = activeTheme === 'dark';
  const theme = useMemo(() => getTheme(activeTheme), [activeTheme]);

  const value = useMemo(
    () => ({
      mode,
      activeTheme,
      theme,
      isDark,
      setThemeMode,
    }),
    [mode, activeTheme, theme, isDark]
  );

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

/**
 * Hook para acceder al tema dinámico (Oscuro / Claro) en cualquier pantalla o componente
 */
export function useTheme(): ThemeContextValue {
  const context = useContext(ThemeContext);
  if (!context) {
    return {
      mode: 'dark',
      activeTheme: 'dark',
      theme: DARK_THEME,
      isDark: true,
      setThemeMode: () => {},
    };
  }
  return context;
}
