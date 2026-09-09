import { defineConfig } from 'vitest/config';
import path from 'path';

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
  },
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
      'expo-file-system': path.resolve(__dirname, './src/__mocks__/expo-file-system.ts'),
      'expo-device': path.resolve(__dirname, './src/__mocks__/expo-device.ts'),
      '@qvac/sdk': path.resolve(__dirname, './src/__mocks__/qvac-sdk.ts'),
    },
  },
});
