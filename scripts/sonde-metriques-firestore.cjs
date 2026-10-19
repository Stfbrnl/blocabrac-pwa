// SONDE DU 19/10/2026 — jetable, lecture seule, lancée à la main une fois.
//
// LA QUESTION, et rien d'autre : un script authentifié par la clé de service peut-il obtenir de
// Cloud Monitoring les nombres exacts de lectures et d'écritures Firestore par jour, sur un
// projet en plan SPARK ? (ClaudeNav, docs/handoffs/2026-10-19-CN-sonde-metriques.md)
//
// CE QU'ELLE NE FAIT PAS, par construction : aucune écriture Firestore, aucune lecture
// Firestore, aucun import de firebase-admin, aucun écran, rien de planifié. Elle interroge une
// API de métriques À CÔTÉ de la base.
//
// ⚠️ LE PIÈGE (§4 du document) : la réponse la plus probable en cas d'erreur n'est pas un refus,
// c'est **200 avec un tableau vide** — qui ressemble à « Spark n'expose pas ces données » sans
// en être. D'où deux précautions ici :
//   ① les noms de métriques ne sont PAS repris du document : ils sont demandés à
//      `metricDescriptors`, c'est-à-dire à la source, et la sonde dit lesquels elle a trouvés ;
//   ② l'intervalle couvre plusieurs jours, pour qu'une journée creuse (zéro légitime) ne soit
//      pas confondue avec un zéro de panne.
//
// ⚠️ La clé de service n'est jamais lue ni affichée par ce script : son CHEMIN est passé à
// GoogleAuth, qui s'en charge.
// ════ CE QUE CETTE SONDE A RÉPONDU — TROIS ÉTATS, DANS L'ORDRE ════
//
// ⚠️ Écrit comme une chronologie, et pas réécrit une troisième fois, parce que les deux
// premières réponses ont été DÉMENTIES par la suivante : garder seulement la dernière
// effacerait ce qui rend ce fichier utile.
//
// ── ① 19/10, Spark, sans rôle IAM → AMBIGU (issue 2 du §3) ──
// `metricDescriptors` : 403 `reason: forbidden`, nommant `monitoring.metricDescriptors.list`,
// sans un mot de facturation. J'ai refusé de conclure sur la forme d'un message et je l'ai
// exercée : les mêmes identifiants contre deux API non activées (Cloud Translation, Cloud
// Scheduler) rendaient `SERVICE_DISABLED` et « API has not been used in project… ». Le
// discriminant était réel. J'en ai conclu, À TORT, que la facturation était écartée.
//
// ── ② 19/10, Spark, rôle `roles/monitoring.viewer` accordé → NON, BLOQUÉ ──
// `metricDescriptors` : **200**, et les trois noms de métriques du document de ClaudeNav
// CONFIRMÉS à la source (`document/read_count`, `write_count`, `delete_count`, plus des
// variantes `*_ops_count` et `billable_*`).
// `timeSeries` : **403, « This API method requires billing to be enabled »** — sous TROIS
// formes (nue sans agrégation, avec l'agrégation de ce script, et `view=HEADERS` qui ne
// demande aucun point), pendant que `monitoredResourceDescriptors` et `alertPolicies`
// répondaient 200. C'était donc bien la MÉTHODE, pas la requête. Et c'est exactement le
// point que ClaudeNav signalait comme non établi (§1) : le million de séries offert est
// compté par compte de facturation, et un projet Spark n'en a pas.
//
// 🔴 POURQUOI ① ÉTAIT FAUX, et la leçon vaut plus que le résultat : mon contrôle portait sur
// `metricDescriptors`, une méthode ATTEIGNABLE, et je transférais son verdict à `timeSeries`,
// la méthode qui comptait et qui était hors d'atteinte. **Quand la chose qui compte est
// inatteignable, une mesure sur sa voisine renseigne sur la voisine.** Le discriminant que
// j'avais validé répondait « cette API est-elle activée ? » et non « cette méthode est-elle
// permise ? » — deux questions que le même 403 et le même `status` recouvrent.
//
// ── ③ 19/10, Blaze (essai gratuit de 90 jours activé par Stéphane) → OUI ──
// `timeSeries` : **200**, un total par jour et par métrique. Donc la réponse à la question
// posée dépend du PLAN, et pas d'autre chose : impossible sur Spark, immédiat sur Blaze,
// sans aucun changement à ce script.
//
// ⚠️ ET UN DÉFAUT DE CE SCRIPT, TROUVÉ À CE MOMENT-LÀ : il libellait chaque point par
// `interval.endTime`, donc une tranche alignée se terminant le 20 à 00:00 UTC portait les
// données du 19 sous l'étiquette « 2026-10-20 » — toutes les lignes décalées d'un jour, et la
// dernière portant une date future. Invisible tant qu'on ne connaît pas d'avance la grandeur
// attendue. Corrigé : le jour est celui de `startTime`.
//
// ── ④ QUALIFICATION, et c'est le contrôle du §4 sous une forme plus forte ──
// La comparaison à la console demandait un écran ; une charge dont on connaît la TAILLE
// EXACTE se suffit, à condition d'écrire la prédiction d'avance.
// `mesure-taux-de-flash.js` lit deux collections entières — 936 documents plus une requête
// vide facturée 1 lecture minimum. Prédiction posée avant : +936 ou +937.
// Mesuré : **+936**. La sonde compte bien les lectures de documents.
//
// 🔴 ET LA TRACE A LIVRÉ UN PIÈGE QUE JE N'ATTENDAIS PAS, le plus dangereux de la série :
//   +0,8 min : écart +0      ← un relevé ici conclurait « la sonde ne voit rien »
//   +3,0 min : écart +741    ← un relevé ICI conclurait « +741 », valeur PLAUSIBLE et FAUSSE
//   +4,5 min : écart +936    ← la valeur réelle
// L'ingestion de Cloud Monitoring prend 3 à 5 minutes, ET ELLE ARRIVE PAR TRANCHES. Le zéro
// du début se repère (il est manifestement incomplet) ; le +741 intermédiaire ne se repère
// pas — il est correct pour ce qu'il contient, simplement pas fini.
//
// ⚠️ **RÈGLE D'USAGE, non négociable : ne lire que des journées CLOSES.** La journée courante
// se remplit encore, et sa valeur monte pendant plusieurs minutes après chaque action. Un
// relevé nocturne sur « hier » est sûr ; un tableau de bord affichant « aujourd'hui »
// montrerait un nombre qui dérive, sans jamais dire qu'il n'est pas fini.
const path = require('path');
const { GoogleAuth } = require('google-auth-library');

const CLE = process.env.BLOCABRAC_KEY
  || path.join(__dirname, '..', 'firestore-migration', 'serviceAccountKey.json');
const PROJET = 'blocabrac';
const JOURS = Number(process.env.SONDE_JOURS || 5);

const SCOPE = 'https://www.googleapis.com/auth/monitoring.read';

const jourUTC = (decalage) => {
  const d = new Date();
  d.setUTCHours(0, 0, 0, 0);
  d.setUTCDate(d.getUTCDate() + decalage);
  return d;
};

async function appelle(client, url) {
  try {
    const res = await client.request({ url });
    return { ok: true, statut: res.status, corps: res.data };
  } catch (e) {
    return {
      ok: false,
      statut: e.response?.status ?? '(pas de réponse HTTP)',
      corps: e.response?.data ?? { message: e.message },
    };
  }
}

const diagnostic = (r) => {
  const texte = JSON.stringify(r.corps || {});
  if (/billing|billingAccount|has not been used|not been enabled|SERVICE_DISABLED/i.test(texte)) {
    return '❌ BLOQUÉ : la réponse parle de facturation ou d\'API non activée — issue 3 du §3.';
  }
  if (r.statut === 403) {
    return 'ℹ️  403 : il manque probablement un rôle au compte de service (roles/monitoring.viewer). '
      + 'Issue 2 du §3 — CE N\'EST PAS une réponse négative.';
  }
  return null;
};

async function main() {
  console.log('════ SONDE — métriques Firestore sur plan Spark ════');
  console.log(`projet : ${PROJET}`);
  console.log(`clé    : ${CLE} (chemin seulement, contenu jamais lu par ce script)`);

  const auth = new GoogleAuth({ keyFile: CLE, scopes: [SCOPE] });
  let client;
  try {
    client = await auth.getClient();
    const jeton = await client.getAccessToken();
    console.log(`jeton OAuth : ${jeton?.token ? 'obtenu' : 'ABSENT'} (périmètre ${SCOPE})`);
  } catch (e) {
    console.log(`✖ Impossible d'obtenir un jeton : ${e.message}`);
    console.log('   → la sonde s\'arrête ici ; ce n\'est pas une réponse sur Spark.');
    process.exit(1);
  }

  // ─── ① Les noms de métriques, demandés à la source ────────────────────────────────
  console.log('\n── ① Quelles métriques Firestore ce projet expose-t-il ? ──');
  const urlDesc = `https://monitoring.googleapis.com/v3/projects/${PROJET}/metricDescriptors`
    + `?filter=${encodeURIComponent('metric.type = starts_with("firestore.googleapis.com/document/")')}`
    + '&pageSize=200';
  const desc = await appelle(client, urlDesc);
  console.log(`HTTP ${desc.statut}`);
  const d = diagnostic(desc);
  if (d) console.log(`   ${d}`);
  let typesTrouves = [];
  if (desc.ok) {
    typesTrouves = (desc.corps.metricDescriptors || []).map((m) => m.type);
    if (typesTrouves.length === 0) {
      console.log('   ⚠️  200 AVEC ZÉRO DESCRIPTEUR — indéterminé (§4), ne rien conclure.');
    } else {
      for (const m of desc.corps.metricDescriptors) {
        console.log(`   • ${m.type}   [${m.metricKind}/${m.valueType}]  ${m.displayName || ''}`);
      }
    }
  } else {
    console.log(`   corps : ${JSON.stringify(desc.corps).slice(0, 500)}`);
  }

  // ─── ② Les séries temporelles, un total par jour ──────────────────────────────────
  // Les noms viennent de ① quand ① a répondu ; sinon on retombe sur ceux du document, en le
  // DISANT — un repli muet produirait exactement le faux négatif du §4.
  const parDefaut = [
    'firestore.googleapis.com/document/read_count',
    'firestore.googleapis.com/document/write_count',
    'firestore.googleapis.com/document/delete_count',
  ];
  const aInterroger = typesTrouves.length > 0
    ? parDefaut.filter((t) => typesTrouves.includes(t))
    : parDefaut;
  if (typesTrouves.length === 0) {
    console.log('\n   ⚠️  ① n\'a rien rendu : les noms ci-dessous sont ceux du DOCUMENT, non confirmés.');
  }

  const debut = jourUTC(-JOURS).toISOString();
  const fin = jourUTC(1).toISOString();
  console.log(`\n── ② Totaux par jour, du ${debut.slice(0, 10)} au ${fin.slice(0, 10)} (UTC) ──`);

  for (const type of aInterroger) {
    const url = `https://monitoring.googleapis.com/v3/projects/${PROJET}/timeSeries`
      + `?filter=${encodeURIComponent(`metric.type = "${type}"`)}`
      + `&interval.startTime=${encodeURIComponent(debut)}`
      + `&interval.endTime=${encodeURIComponent(fin)}`
      + '&aggregation.alignmentPeriod=86400s'
      + '&aggregation.perSeriesAligner=ALIGN_SUM'
      + '&aggregation.crossSeriesReducer=REDUCE_SUM';
    const r = await appelle(client, url);
    const court = type.split('/').pop();
    console.log(`\n  ${court} — HTTP ${r.statut}`);
    const dd = diagnostic(r);
    if (dd) console.log(`     ${dd}`);
    if (!r.ok) {
      console.log(`     corps : ${JSON.stringify(r.corps).slice(0, 400)}`);
      continue;
    }
    const series = r.corps.timeSeries || [];
    if (series.length === 0) {
      console.log('     ⚠️  200 AVEC ZÉRO SÉRIE — indéterminé (§4), ne rien conclure.');
      continue;
    }
    for (const s of series) {
      const pts = (s.points || [])
        .map((p) => ({
          // ⚠️ LE JOUR EST CELUI DU DÉBUT DE LA FENÊTRE, JAMAIS DE SA FIN. Une tranche
          // alignée de 86 400 s qui se termine le 20 à 00:00 UTC porte les données du 19.
          // Libellées par `endTime`, comme dans la première version de ce script, toutes les
          // lignes étaient décalées d'un jour et la dernière portait une date future — un
          // décalage qui ne se voit pas quand on ne connaît pas d'avance la grandeur attendue.
          jour: (p.interval.startTime || '').slice(0, 10),
          v: Number(p.value.int64Value ?? p.value.doubleValue ?? 0),
        }))
        .sort((a, b) => a.jour.localeCompare(b.jour));
      console.log(`     ressource ${s.resource?.type || '?'} ${JSON.stringify(s.resource?.labels || {})}`);
      for (const p of pts) console.log(`       ${p.jour} : ${p.v.toLocaleString('fr-FR')}`);
      if (pts.length === 0) console.log('       (série présente mais sans point)');
    }
  }

  console.log('\n════ À VÉRIFIER AVANT DE CROIRE CES CHIFFRES (§4) ════');
  console.log('Comparer un de ces totaux à l\'onglet Statistiques de la console Firebase pour le');
  console.log('MÊME jour. S\'ils concordent, le dispositif est qualifié. S\'ils divergent, c\'est la');
  console.log('requête qu\'il faut corriger, pas la conclusion qu\'il faut tirer.');
}

main().catch((e) => {
  console.error('SONDE_ECHEC', e.message);
  process.exit(1);
});
