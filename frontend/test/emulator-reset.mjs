import { pathToFileURL } from 'node:url';
// Remise à zéro COMPLÈTE des émulateurs locaux (Firestore + Auth) avant un seed —
// docs/handoffs/RETOUR-v2681-v269-v270.md §5. Sans elle, un e2e enchaîné après un autre sur le
// même émulateur hérite de ses comptes et de ses profils : `e2e-season-restart-flow.mjs` échouait
// à l'étape 8 sur un écart de réconciliation laissé par le client de `e2e-season-classement-flow`,
// un rouge qui ressemble à une régression sans en être une (et, pire, habitue à ignorer un rouge).
//
// Les URL sont écrites en dur sur localhost et passent par l'API REST propre à l'émulateur
// (`/emulator/v1/...`), qui n'existe pas en production : cette fonction ne peut rien effacer
// ailleurs que sur les émulateurs de ce poste.
const PROJECT_ID = 'blocabrac';

export async function resetEmulators() {
  // RETOUR-v2701-v2702.md §5 : une fonction « vide tout » refuse de tourner hors d'un contexte
  // explicitement émulateur — une garde déclarée, pas seulement une propriété du protocole.
  const host = process.env.FIRESTORE_EMULATOR_HOST || '';
  const authHost = process.env.FIREBASE_AUTH_EMULATOR_HOST || '';
  if (!/^(localhost|127\.0\.0\.1):/.test(host) || !/^(localhost|127\.0\.0\.1):/.test(authHost)) {
    throw new Error(
      `resetEmulators() refusé : FIRESTORE_EMULATOR_HOST="${host}" / FIREBASE_AUTH_EMULATOR_HOST="${authHost}" ` +
      'doivent tous deux pointer vers localhost.'
    );
  }
  const targets = [
    `http://localhost:8080/emulator/v1/projects/${PROJECT_ID}/databases/(default)/documents`,
    `http://localhost:9099/emulator/v1/projects/${PROJECT_ID}/accounts`,
  ];
  // ⚠️ Un script dont la raison d'être est un effet de bord ANNONCE son effet : un succès
  // silencieux est indiscernable d'un no-op. Le 18/10/2026, trois exécutions se sont empilées
  // sans un mot parce que `node test/emulator-reset.mjs` ne fait RIEN — ce module ne fait
  // qu'exporter, et l'invoquer en script sort en 0 sans rien vider.
  for (const url of targets) {
    const res = await fetch(url, { method: 'DELETE' });
    if (!res.ok) throw new Error(`Remise à zéro de l'émulateur impossible (${res.status}) : ${url}`);
  }
  console.log(`✔ Émulateurs remis à zéro : Firestore et Auth vidés (projet ${PROJECT_ID}).`);
}

// ⚠️ ET LE PIÈGE QUE LE COMMENTAIRE CI-DESSUS DÉCRIVAIT RESTAIT OUVERT : documenter une
// trappe ne la referme pas. `node test/emulator-reset.mjs` sortait toujours en 0 sans rien
// vider — repris le 19/10/2026 après y être tombé une deuxième fois, dans la séance même qui
// venait d'en écrire la règle. D'où ce garde de module principal : invoqué directement, le
// script AGIT et annonce ; importé par un seed, il n'exporte que la fonction, comme avant.
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  process.env.FIRESTORE_EMULATOR_HOST ||= 'localhost:8080';
  process.env.FIREBASE_AUTH_EMULATOR_HOST ||= 'localhost:9099';
  resetEmulators().catch((err) => {
    console.error(`✖ ${err.message}`);
    process.exit(1);
  });
}
