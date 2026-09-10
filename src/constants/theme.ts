/**
 * Tokens de color y sistema de diseño para Perseus.ai
 * Soporte para Modo Oscuro (Dark) y Modo Claro (Light) de alta visibilidad para emergencias.
 */

import type { StartPriority } from '../types/triageTypes';

export type ThemeMode = 'system' | 'dark' | 'light';
export type ActiveTheme = 'dark' | 'light';

export interface ThemeColors {
  // Estado del tema
  isDark: boolean;

  // Fondos
  background: string;
  card: string;
  cardInner: string;
  cardHighlight: string;

  // Bordes
  border: string;
  borderLight: string;
  borderFocus: string;

  // Tipografía
  text: string;
  textSecondary: string;
  textMuted: string;
  textPlaceholder: string;
  placeholder: string;

  // Primario / Marca
  primary: string;
  primaryLight: string;
  primaryDark: string;
  primaryMuted: string;

  // Estados
  danger: string;
  dangerMuted: string;
  warning: string;
  warningMuted: string;
  success: string;
  successMuted: string;
  info: string;
  sky: string;
  purple: string;

  // Inputs
  inputBackground: string;
  inputBorder: string;

  // TabBar
  tabBarBg: string;
  tabBarBorder: string;
  tabBarActive: string;
  tabBarInactive: string;

  // Modales
  modalBg: string;
  modalOverlay: string;

  // Barra de estado
  statusBarStyle: 'light' | 'dark';
}

export const DARK_THEME: ThemeColors = {
  isDark: true,

  background: '#0F172A', // Slate 900
  card: '#1E293B', // Slate 800
  cardInner: '#0F172A', // Slate 900
  cardHighlight: '#334155', // Slate 700

  border: '#334155', // Slate 700
  borderLight: '#1E293B',
  borderFocus: '#3B82F6',

  text: '#F8FAFC', // Slate 50
  textSecondary: '#CBD5E1', // Slate 300
  textMuted: '#94A3B8', // Slate 400
  textPlaceholder: '#64748B', // Slate 500
  placeholder: '#64748B',

  primary: '#3B82F6', // Blue 500
  primaryLight: '#60A5FA',
  primaryDark: '#2563EB',
  primaryMuted: 'rgba(59, 130, 246, 0.15)',

  danger: '#EF4444',
  dangerMuted: 'rgba(239, 68, 68, 0.15)',
  warning: '#F59E0B',
  warningMuted: 'rgba(245, 158, 11, 0.15)',
  success: '#22C55E',
  successMuted: 'rgba(34, 197, 94, 0.15)',
  info: '#38BDF8',
  sky: '#38BDF8',
  purple: '#A855F7',

  inputBackground: '#0F172A',
  inputBorder: '#334155',

  tabBarBg: '#0F172A',
  tabBarBorder: '#334155',
  tabBarActive: '#3B82F6',
  tabBarInactive: '#94A3B8',

  modalBg: '#1E293B',
  modalOverlay: 'rgba(0, 0, 0, 0.75)',

  statusBarStyle: 'light',
};

export const LIGHT_THEME: ThemeColors = {
  isDark: false,

  background: '#F8FAFC', // Slate 50
  card: '#FFFFFF', // Pure White
  cardInner: '#F1F5F9', // Slate 100
  cardHighlight: '#E2E8F0', // Slate 200

  border: '#E2E8F0', // Slate 200
  borderLight: '#F1F5F9',
  borderFocus: '#2563EB',

  text: '#0F172A', // Slate 900
  textSecondary: '#334155', // Slate 700
  textMuted: '#64748B', // Slate 500
  textPlaceholder: '#94A3B8', // Slate 400
  placeholder: '#94A3B8',

  primary: '#2563EB', // Blue 600
  primaryLight: '#3B82F6',
  primaryDark: '#1D4ED8',
  primaryMuted: 'rgba(37, 99, 235, 0.1)',

  danger: '#DC2626',
  dangerMuted: 'rgba(220, 38, 38, 0.1)',
  warning: '#D97706',
  warningMuted: 'rgba(217, 119, 6, 0.1)',
  success: '#16A34A',
  successMuted: 'rgba(22, 163, 74, 0.1)',
  info: '#0284C7',
  sky: '#0284C7',
  purple: '#7C3AED',

  inputBackground: '#F1F5F9',
  inputBorder: '#CBD5E1',

  tabBarBg: '#FFFFFF',
  tabBarBorder: '#E2E8F0',
  tabBarActive: '#2563EB',
  tabBarInactive: '#64748B',

  modalBg: '#FFFFFF',
  modalOverlay: 'rgba(0, 0, 0, 0.55)',

  statusBarStyle: 'dark',
};

/**
 * Colores estándar internacionales de Triaje START
 */
export const PRIORITY_COLORS: Record<StartPriority, string> = {
  ROJO: '#EF4444',
  AMARILLO: '#F59E0B',
  VERDE: '#22C55E',
  NEGRO: '#1F2937',
};

/**
 * Devuelve el objeto de tema según la clave activa
 */
export function getTheme(active: ActiveTheme): ThemeColors {
  return active === 'light' ? LIGHT_THEME : DARK_THEME;
}
