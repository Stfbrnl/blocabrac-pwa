import { initializeApp } from "firebase/app";
import { getAuth, connectAuthEmulator } from "firebase/auth";
import { getFirestore, connectFirestoreEmulator } from "firebase/firestore";
import { getStorage } from "firebase/storage"; // ✅ CORRECTION : Import de getStorage depuis firebase/storage

export const firebaseConfig = {
  apiKey: "AIzaSyCKVWoaCQI2PhnOAjJBokKoXuzzmnDa9hg",
  authDomain: "blocabrac.firebaseapp.com",
  projectId: "blocabrac",
  storageBucket: "blocabrac.firebasestorage.app",
  messagingSenderId: "126818494034",
  appId: "1:126818494034:web:f2de92ec7d22417a54618b"
};

const app = initializeApp(firebaseConfig);
export const auth = getAuth(app);
export const db = getFirestore(app); // ✅ Ajoutez cette ligne pour Firestore
export const storage = getStorage(app); // ✅ Utilisation de getStorage

// ✅ Opt-in explicite (VITE_USE_EMULATOR=true), jamais actif en prod : permet de
// faire tourner l'app contre les émulateurs Auth/Firestore locaux pour des tests
// de bout en bout sans jamais toucher aux données réelles de la salle.
if (import.meta.env.DEV && import.meta.env.VITE_USE_EMULATOR === 'true') {
  connectAuthEmulator(auth, 'http://localhost:9099', { disableWarnings: true });
  connectFirestoreEmulator(db, 'localhost', 8080);
}