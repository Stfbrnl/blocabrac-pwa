/// <reference types="vite/client" />
/// <reference types="vite-plugin-pwa/react" />

// ✅ Injecté au build par vite.config.ts (define), depuis package.json et git —
// voir src/config/appVersion.ts pour l'utilisation.
declare const __APP_VERSION__: string;
declare const __GIT_HASH__: string;
declare const __BUILD_DATE__: string;
