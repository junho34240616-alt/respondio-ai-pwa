import React from 'react';
import { RespondioSessionShell } from '../app-shell/examples/react-native/RespondioSessionShell.js';

const APP_BASE_URL = process.env.EXPO_PUBLIC_RESPONDIO_BASE_URL || 'https://respondio-ai-pwa.pages.dev';

export default function App() {
  return React.createElement(RespondioSessionShell, {
    appBaseUrl: APP_BASE_URL
  });
}
