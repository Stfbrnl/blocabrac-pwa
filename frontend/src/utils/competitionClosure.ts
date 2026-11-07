import { colorGrades } from '../config/gymConfig';

// LE PÉRIMÈTRE ET L'EFFET DE « TERMINER LA COMPÉTITION », décidés par une fonction PURE.
//
// POURQUOI CE MODULE EXISTE (chantier du 07/11/2026). Ce geste vivait entièrement dans
// `pages/Ouvreur/CompetitionBoulders/CompetitionBouldersList.tsx`, et l'écran d'administration
// doit désormais pouvoir le déclencher au passage de la compétition hors du vol. Le recopier
// là-bas aurait fabriqué un SECOND RÉDACTEUR du même geste — la quatrième occurrence de « un
// document, plusieurs rédacteurs, des contrats divergents » dans ce dépôt, après `role`/`roles[]`,
// l'état ludique et `competition_participants`. Un seul endroit décide donc QUI est touché et
// COMMENT, et `competitionClosureWrites.ts` est le seul à écrire.
//
// ⚠️ CE MODULE N'IMPORTE RIEN DE FIRESTORE, exprès — même doctrine que `roulette.ts`,
// `challenges.ts` et `weeklyGoal.ts`. C'est ce qui le rend testable sans émulateur, et c'est
// aussi ce qui garantit qu'un périmètre d'opération de donnée ne puisse pas dériver d'un
// affichage : la décision se prend sur des faits (`type`, `difficulty`), jamais sur un état
// d'écran. V2.79 puis V2.80 ont appris cette leçon deux fois dans le même fichier.

// Les huit couleurs canoniques, DÉRIVÉES de `colorGrades` et jamais recopiées.
//
// ⚠️ `mystere` n'est PAS dans cette liste, et ce n'est pas un oubli : `gymConfig.ts` le tient
// délibérément hors de `colorGrades`. Ce n'est pas une cotation mais l'ABSENCE ANNONCÉE de
// cotation publique — l'état d'un bloc dont la difficulté réelle est cachée pendant l'épreuve.
export const couleursCanoniques: string[] = colorGrades.map((c) => c.value);

// Les statuts pendant lesquels une compétition est « en vol », énumérés EN POSITIF.
//
// ⚠️ Une liste d'exclusions laisserait passer tout statut futur qu'on n'aurait pas pensé à y
// ajouter. Même forme et mêmes valeurs que `EN_VOL` dans `scripts/audit-prod-catalog.js` :
// la duplication est inévitable (un script CommonJS ne peut pas importer ce module), mais les
// deux doivent rester d'accord — sinon le filet crie sur un état que l'application croit
// normal, ou se taît sur un état qu'elle croit fautif.
export const STATUTS_EN_VOL: string[] = ['à venir', 'en cours'];

export const estHorsDuVol = (statut: string | undefined): boolean =>
  !STATUTS_EN_VOL.includes(statut ?? '');

/** Les seuls champs d'un bloc dont la clôture a besoin pour décider. */
export interface BlocClotureInput {
  id: string;
  type: string;
  difficulty?: string;
  is_active?: boolean;
}

export interface PlanCloture {
  /**
   * Les blocs quotidiens RÉUTILISÉS : ils quittent la compétition sans aucun changement de
   * cotation (leur couleur est publique depuis toujours, et c'est celle écrite sur la prise).
   */
  aDetacher: string[];
  /**
   * Les blocs CRÉÉS pour l'épreuve : leur cotation interne, jusque-là cachée, devient la
   * couleur publique. ⚠️ Irréversible : aucun geste de l'application ne la recache.
   */
  aMigrer: Array<{ id: string; color: string }>;
  /**
   * 🔴 Les blocs créés pour l'épreuve dont la `difficulty` n'est PAS l'une des huit couleurs —
   * y compris `mystere`, et y compris une graphie fautive comme `"noire"` ou `"Rouge"` (deux
   * cas trouvés en production le 06/11/2026). La clôture écrit `color: difficulty` TEL QUEL :
   * un bloc ainsi basculé recevrait une couleur hors de `levelOrder`, donc sortirait de
   * `colorById` — et `basePoints[couleur] || 0` ferait valoir CHACUNE de ses réussites
   * **0 point, en silence**, sans qu'aucun écran ne l'annonce.
   *
   * ⚠️ On REFUSE donc de les basculer plutôt que de normaliser à leur place : la bonne couleur
   * d'un bloc est une décision d'ouvreur, pas une déduction de machine — « explicite ou refus »,
   * comme `scripts/lib/couleur-canonique.cjs`. Et ce refus compte double depuis que le geste
   * est atteignable depuis un écran d'administration qui ne charge AUCUN bloc : l'admin ne
   * verrait rien passer.
   */
  refuses: Array<{ id: string; difficulty: string | undefined }>;
  compte: {
    /** Tous les blocs rattachés, y compris ceux qui seront refusés. */
    total: number;
    reutilises: number;
    crees: number;
    /** Combien, parmi tous ceux-là, sont retirés du mur — le dialogue doit le dire. */
    desactives: number;
    refuses: number;
  };
}

/**
 * Range les blocs rattachés à une compétition dans les trois cas de la clôture.
 *
 * ⚠️ Prend la liste COMPLÈTE, blocs désactivés compris. Un bloc désactivé pendant qu'il était
 * rattaché reste rattaché : le sauter lui laisserait `competition_active: true` pour toujours
 * (défaut V2.79), ou, pour un bloc créé pour l'épreuve, laisserait sa cotation cachée à jamais.
 */
export const planifierCloture = (blocs: BlocClotureInput[]): PlanCloture => {
  const aDetacher: string[] = [];
  const aMigrer: Array<{ id: string; color: string }> = [];
  const refuses: Array<{ id: string; difficulty: string | undefined }> = [];

  for (const bloc of blocs) {
    if (estBlocQuotidienReutilise(bloc)) {
      aDetacher.push(bloc.id);
    } else if (bloc.difficulty !== undefined && couleursCanoniques.includes(bloc.difficulty)) {
      aMigrer.push({ id: bloc.id, color: bloc.difficulty });
    } else {
      refuses.push({ id: bloc.id, difficulty: bloc.difficulty });
    }
  }

  return {
    aDetacher,
    aMigrer,
    refuses,
    compte: {
      total: blocs.length,
      reutilises: aDetacher.length,
      crees: aMigrer.length,
      desactives: blocs.filter((b) => b.is_active !== true).length,
      refuses: refuses.length,
    },
  };
};

/**
 * Un bloc réutilisé depuis « Blocs quotidiens » garde son `type: 'daily'` (il reste visible et
 * éditable normalement en dehors de la compétition) ; seul un `competition_id` le rattache
 * temporairement. Un bloc créé pour l'épreuve, lui, est en `type: 'competition'`, caché du
 * public tant que l'épreuve dure. Toute la clôture tient sur cette distinction.
 */
export const estBlocQuotidienReutilise = (bloc: { type: string }): boolean => bloc.type === 'daily';
