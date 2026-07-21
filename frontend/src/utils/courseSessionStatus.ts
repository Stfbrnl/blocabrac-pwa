export type SessionStatus = 'scheduled' | 'active' | 'archived';

export interface SessionLike {
  date: string; // "YYYY-MM-DD"
  activatedAt?: string;
  archivedAt?: string;
}

// Évite new Date("YYYY-MM-DD"), qui parse en UTC et peut décaler d'un jour
// selon le fuseau horaire local — ici on veut un minuit local fiable.
const parseLocalDay = (dateStr: string): Date => {
  const [year, month, day] = dateStr.split('-').map(Number);
  return new Date(year, month - 1, day);
};

// ✅ Statut d'une séance :
// - "archived" si archivage manuel, ou si on a atteint minuit du lendemain de la date
//   (garde-fou automatique, calculé à l'affichage : pas besoin de tâche planifiée).
// - "active" si le moniteur l'a manuellement basculée en "séance du jour".
// - "scheduled" sinon (séance à venir, objectifs visibles mais pas le contenu).
export const getSessionStatus = (session: SessionLike, referenceDate: Date = new Date()): SessionStatus => {
  if (session.archivedAt) return 'archived';

  const sessionDay = parseLocalDay(session.date);
  const autoArchiveThreshold = new Date(sessionDay);
  autoArchiveThreshold.setDate(autoArchiveThreshold.getDate() + 1); // minuit du lendemain

  if (referenceDate >= autoArchiveThreshold) return 'archived';

  if (session.activatedAt) return 'active';

  return 'scheduled';
};

// ✅ Le moniteur ne peut activer une séance qu'à partir du jour même
// (correspond à "séance du jour" : pas d'activation anticipée de plusieurs jours).
export const canActivate = (session: SessionLike, referenceDate: Date = new Date()): boolean => {
  if (getSessionStatus(session, referenceDate) !== 'scheduled') return false;
  const sessionDay = parseLocalDay(session.date);
  return referenceDate >= sessionDay;
};
