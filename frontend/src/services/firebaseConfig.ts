import { initializeApp } from "firebase/app";
import { getAuth, connectAuthEmulator } from "firebase/auth";
import {
  initializeFirestore, connectFirestoreEmulator,
  persistentLocalCache, persistentMultipleTabManager
} from "firebase/firestore";
import { getStorage } from "firebase/storage"; // ✅ CORRECTION : Import de getStorage depuis firebase/storage

export const firebaseConfig = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY,
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN,
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID,
  storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID,
  appId: import.meta.env.VITE_FIREBASE_APP_ID
};

const app = initializeApp(firebaseConfig);
export const auth = getAuth(app);
// ✅ Chantier 3 (PLAN-spark-images-competition.md) : cache local persistant IndexedDB,
// décisif le jour d'une compétition pour ne pas retransférer les images inchangées à
// chaque retour dans l'appli, et pour mettre en file les écritures hors ligne.
// persistentMultipleTabManager() est obligatoire : sans lui, l'activation échoue dès
// qu'un second onglet est ouvert — précisément le cas prévu côté admin (affichage TV).
// Désactivée en mode test ET contre les émulateurs (Playwright tourne sur le vrai
// serveur de dev, MODE='development', mais toujours avec VITE_USE_EMULATOR=true) :
// les règles de sécurité ne s'appliquent pas aux lectures servies depuis le cache, ce
// qui masquerait silencieusement une erreur de permission dans ces deux scénarios.
const isTestLikeEnvironment =
  import.meta.env.MODE === 'test' || import.meta.env.VITE_USE_EMULATOR === 'true';
export const db = isTestLikeEnvironment
  ? initializeFirestore(app, {})
  : initializeFirestore(app, {
      localCache: persistentLocalCache({ tabManager: persistentMultipleTabManager() })
    });
export const storage = getStorage(app); // ✅ Utilisation de getStorage

// ✅ Opt-in explicite (VITE_USE_EMULATOR=true), jamais actif en prod : permet de
// faire tourner l'app contre les émulateurs Auth/Firestore locaux pour des tests
// de bout en bout sans jamais toucher aux données réelles de la salle.
if (import.meta.env.DEV && import.meta.env.VITE_USE_EMULATOR === 'true') {
  connectAuthEmulator(auth, 'http://localhost:9099', { disableWarnings: true });
  connectFirestoreEmulator(db, 'localhost', 8080);
}