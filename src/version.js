export const APP_VERSION = '3.1.0';

// Build ID is injected at compile time by Vite (see vite.config.js).
// The display version above is what the user sees; this string changes
// with every build and is what the auto-update flow compares against
// the live service worker so the user never has to think about it.
// Falls back to 'dev' when the define isn't applied (defensive).
// eslint-disable-next-line no-undef
export const BUILD_ID = typeof __BM_BUILD_ID__ !== 'undefined' ? __BM_BUILD_ID__ : 'dev';
