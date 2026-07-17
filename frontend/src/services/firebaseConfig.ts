import { initializeApp } from "firebase/app";
import { getAuth } from "firebase/auth";
import { getFirestore } from "firebase/firestore";
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