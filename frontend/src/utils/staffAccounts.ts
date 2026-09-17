// ✅ PLAN-ouvreur-createur-bloc.md §2 : module pur (pas d'import Firestore) qui
// construit la liste des comptes ouvreurs pour le menu déroulant d'attribution
// d'un bloc, à partir des documents `users` déjà lus par l'appelant (deux
// requêtes `role`/`roles[]` fusionnées, cf. MessagesList.tsx). Séparé de la
// requête elle-même pour rester testable sans émulateur (PLAN §8).

export interface StaffAccountDoc {
  id: string;
  first_name?: string;
  last_name?: string;
  email?: string;
}

export interface StaffAccountOption {
  uid: string;
  displayName: string;
}

// Fusionne des documents potentiellement en double (un compte peut apparaître
// dans les deux requêtes `role`/`roles[]`) et résout un nom d'affichage avec
// repli sur l'email puis l'uid, jamais une chaîne vide.
export function buildOuvreurOptions(docs: StaffAccountDoc[]): StaffAccountOption[] {
  const byId = new Map<string, StaffAccountOption>();
  docs.forEach((d) => {
    const displayName = `${d.first_name || ''} ${d.last_name || ''}`.trim() || d.email || d.id;
    byId.set(d.id, { uid: d.id, displayName });
  });
  return Array.from(byId.values()).sort((a, b) => a.displayName.localeCompare(b.displayName));
}
