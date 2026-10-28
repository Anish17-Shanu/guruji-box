const SW_PATH = '/sw.js';

export function registerServiceWorker() {
  if (!import.meta.env.PROD || !('serviceWorker' in navigator)) return;
  if (navigator.userAgent.includes('Electron')) return;
  window.addEventListener('load', () => {
    navigator.serviceWorker.register(SW_PATH).catch(() => {
      // Offline support is an enhancement; the app still works online without it.
    });
  });
}
