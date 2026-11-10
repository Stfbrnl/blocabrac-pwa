// Contrat de SÉPARATION des deux âges, vérifié SUR LES SOURCES.
//
// POURQUOI UN TEST QUI LIT DU CODE PLUTÔT QUE QUI L'EXÉCUTE. Depuis le 10/11/2026 ce dépôt
// dérive DEUX âges de la même date de naissance stockée, et c'est délibéré :
//
//   | fonction           | grandeur                              | rôle                     |
//   |--------------------|---------------------------------------|--------------------------|
//   | `getSeasonAge`     | année de référence − année de naissance | DÉCIDE (catégorie FFME,  |
//   |                    | (convention FFME, 31 décembre)        | classements, seuils)     |
//   | `getCivilAge`      | âge révolu, au jour près              | AFFICHE, décide de rien  |
//
// Les deux cohabitent dans `utils/ageCategory.ts`. La règle à tenir n'est donc pas « un seul
// point de dérivation » — il y en a deux, légitimement — mais : **rien qui dérive une
// catégorie, un classement ou un seuil ne doit consommer l'âge civil.**
//
// ⚠️ ET C'EST UNE CLAUSE D'ABSENCE, qu'aucun test d'exécution n'attrape. Un `getFfmeCategory`
// nourri par l'âge civil rendrait la bonne catégorie pour les onze mois de l'année où les deux
// âges coïncident, et la mauvaise pour le douzième — pour les seuls grimpeurs dont
// l'anniversaire n'est pas passé. Le défaut serait donc **saisonnier, minoritaire et
// silencieux** : un U16 affiché U14 en janvier, de retour à U16 après son anniversaire, sans
// qu'aucun écran ne signale rien. C'est la forme de panne la plus coûteuse à retrouver, et la
// moins probable à être reproduite par un test écrit après coup.
//
// ⚠️ CE QUE CE FILET NE COUVRE PAS. Il lit des motifs textuels dans `src/` : une dérivation
// passant par une variable intermédiaire (`const a = getCivilAge(...); getFfmeCategory(a)`)
// lui échappe, comme lui échapperait un troisième âge dérivé ailleurs. C'est un filet contre
// le retour en arrière, pas une preuve d'exhaustivité — même statut que les contrats de
// `registered_count` et de `points_multiplier`. Chacune de ses quatre clauses a été vue rouge
// séparément, en cassant le code une fois par clause et non une fois pour le fichier.
import { describe, expect, it } from 'vitest';
import { readdirSync, readFileSync } from 'fs';
import { relative, resolve, sep } from 'path';

const SRC = resolve(__dirname, '../../src');

// Tous les fichiers de source, tests exclus : un test a le droit d'appeler les deux fonctions
// côte à côte — c'est même ainsi qu'il épingle leur écart — et les compter ici rendrait le
// contrat insensible à son vrai sujet.
const fichiersSource = (dossier: string): string[] =>
  readdirSync(dossier, { withFileTypes: true }).flatMap((e) => {
    const chemin = resolve(dossier, e.name);
    if (e.isDirectory()) return fichiersSource(chemin);
    if (!/\.(ts|tsx)$/.test(e.name) || /\.test\.tsx?$/.test(e.name)) return [];
    return [chemin];
  });

const lire = (relatif: string) => readFileSync(resolve(SRC, relatif), 'utf8');

describe('contrat de séparation entre âge civil et âge de saison', () => {
  // ── Clause ① ────────────────────────────────────────────────────────────────────────────
  it("aucune catégorie n'est dérivée d'un âge civil", () => {
    const fautifs = fichiersSource(SRC)
      .map((f) => ({ f, n: (readFileSync(f, 'utf8').match(/getFfmeCategory(?:Short)?\(\s*getCivilAge/g) ?? []).length }))
      .filter((x) => x.n > 0);
    expect(fautifs).toHaveLength(0);
  });

  // ── Clause ② ────────────────────────────────────────────────────────────────────────────
  it('les quatre sites qui ÉCRIVENT ffmeCategory le dérivent tous de getSeasonAge', () => {
    const sites = fichiersSource(SRC).flatMap((f) =>
      (readFileSync(f, 'utf8').match(/^.*ffmeCategory:.*$/gm) ?? []).map((ligne) => ({ f, ligne }))
    );
    // ⚠️ Affirmer la TAILLE avant le contenu : un CINQUIÈME site d'écriture doit rougir, pas
    // seulement un site existant qui changerait de dérivation. `classement_profiles` est
    // lisible par tout compte authentifié — c'est le document qui a déjà coûté une fuite de
    // dates de naissance le 17/08/2026 — donc tout nouveau rédacteur se relit ici.
    expect(sites).toHaveLength(4);
    for (const { f, ligne } of sites) {
      expect(ligne, `dérivation suspecte dans ${f}`).toContain('getSeasonAge');
      expect(ligne, `âge civil dans une écriture de catégorie : ${f}`).not.toContain('getCivilAge');
    }
  });

  // ── Clause ③ ────────────────────────────────────────────────────────────────────────────
  it("shortLabel reste un libellé d'affichage : il n'est ni stocké ni relu", () => {
    // `label` est STOCKÉ tel quel (classement_profiles.ffmeCategory, palmarès gelés immuables)
    // et `ClientClassement.tsx` recompare la chaîne stockée à `band.label` pour retrouver le
    // rang de la bande. Un `shortLabel` qui s'échapperait dans une écriture produirait des
    // documents que ce recoupement ne retrouve plus — et comme un palmarès est immuable, le
    // défaut serait définitif. D'où la liste blanche de fichiers.
    const porteurs = fichiersSource(SRC)
      .filter((f) => readFileSync(f, 'utf8').includes('shortLabel'))
      .map((f) => relative(SRC, f).split(sep).join('/'))
      .sort();
    expect(porteurs).toEqual(['config/gymConfig.ts', 'utils/ageCategory.ts']);
  });

  // ── Clause ④ ────────────────────────────────────────────────────────────────────────────
  it("les modules qui classent n'ont aucune notion d'âge civil, et le seuil des missions non plus", () => {
    // Ces trois modules sont purs et n'affichent rien : ils n'ont aucune raison légitime de
    // connaître un âge civil, donc une interdiction par fichier entier y est juste.
    for (const module of [
      'utils/competitionClassement.ts',
      'utils/competitionRankings.ts',
      'utils/classementScore.ts',
    ]) {
      const source = lire(module);
      for (const interdit of ['getCivilAge', 'formatAgeDisplay', 'formatAgeHelper']) {
        expect(source, `${module} consomme ${interdit}`).not.toContain(interdit);
      }
    }
    // ⚠️ Pour `ClientDaily.tsx` l'interdiction par fichier entier serait trop large — c'est un
    // écran, il pourrait légitimement afficher un âge un jour. La clause porte donc sur la
    // seule dérivation qui DÉCIDE : le seuil d'âge figé à l'ouverture de la semaine, qui
    // choisit si les murs enfants comptent dans les missions hebdomadaires.
    const seuil = (lire('pages/Client/Daily/ClientDaily.tsx').match(/^.*const seasonAge =.*$/gm) ?? []);
    expect(seuil).toHaveLength(1);
    expect(seuil[0]).toContain('getSeasonAge');
  });
});
