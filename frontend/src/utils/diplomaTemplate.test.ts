import { describe, expect, it } from 'vitest';
import {
  CHAMPS_DIPLOME_VIERGE,
  DIPLOME_HAUTEUR_PX,
  DIPLOME_LARGEUR_PX,
  LIGNE_A_REMPLIR,
  composerContenuDiplome,
  composerDiplomeHtml,
  echapperHtml,
  stylesFondDiplome,
} from './diplomaTemplate';

const champs = {
  titulaire: 'Léa Martin',
  type: 'Autonomie en bloc',
  date: '10 novembre 2026',
  decernePar: 'Stéphane B.',
};

describe('composerContenuDiplome', () => {
  it('écrit les quatre champs avec leur libellé', () => {
    const html = composerContenuDiplome(champs);
    expect(html).toContain('Ce diplôme est décerné à : Léa Martin');
    expect(html).toContain('Type : Autonomie en bloc');
    expect(html).toContain('Le 10 novembre 2026');
    expect(html).toContain('Décerné par : Stéphane B.');
    expect(html).toContain('DIPLÔME OFFICIEL');
    expect(html).toContain('Félicitations pour votre progression !');
  });

  it('place la zone de texte sur les quatre pourcentages calibrés pour le fond', () => {
    // ⚠️ Ces quatre nombres décrivent une IMAGE (sous le logo, à l'intérieur des diagonales
    // dorées) : ils ne se devinent pas et ne se retrouvent pas en relisant le code. Les
    // épingler, c'est garantir qu'une retouche de style ne déplacera pas le texte par-dessus
    // les diagonales — un défaut purement visuel, donc invisible à tout autre test.
    const html = composerContenuDiplome(champs);
    expect(html).toContain('top:38%');
    expect(html).toContain('bottom:8%');
    expect(html).toContain('left:16%');
    expect(html).toContain('right:16%');
  });

  it('échappe les champs : un nom venu de Firestore n’est pas du HTML', () => {
    // ⚠️ Sur l'écran du moniteur, `titulaire` est le nom de QUELQU'UN D'AUTRE, lu dans un
    // document Firestore. L'ancienne composition impérative passait par `textContent`, qui
    // échappe tout seul ; une chaîne HTML, non. C'est la régression que ce test interdit.
    const html = composerContenuDiplome({
      ...champs,
      titulaire: '<img src=x onerror="alert(1)">',
      decernePar: 'Jean "Le Dur" O\'Brien & fils',
    });
    // ⚠️ L'assertion porte sur ce qui rend l'injection POSSIBLE, pas sur la présence du mot :
    // « onerror= » subsiste en texte inerte, et c'est correct. Ce qui compte est qu'aucun
    // chevron ni guillemet du champ ne survive — sans eux, rien ne peut devenir une balise
    // ni un attribut. Une assertion sur le mot seul rougirait sur un échappement juste.
    expect(html).not.toContain('<img');
    expect(html).not.toContain('onerror="');
    expect(html).toContain('&lt;img src=x onerror=&quot;alert(1)&quot;&gt;');
    expect(html).toContain('Jean &quot;Le Dur&quot; O&#39;Brien &amp; fils');
  });
});

describe('echapperHtml', () => {
  it('traite les cinq caractères, apostrophe comprise', () => {
    expect(echapperHtml('& < > " \'')).toBe('&amp; &lt; &gt; &quot; &#39;');
  });

  it('échappe l’esperluette en premier, sans double échappement', () => {
    // Si `&` était traité après `<`, « &lt; » produirait « &amp;lt; » et le diplôme
    // afficherait littéralement « &lt; » au lieu du caractère.
    expect(echapperHtml('<')).toBe('&lt;');
    expect(echapperHtml('&lt;')).toBe('&amp;lt;');
  });
});

describe('stylesFondDiplome', () => {
  it('transmet l’image de fond reçue, sans en choisir une', () => {
    // ⚠️ Le fond est un PARAMÈTRE : les deux écrans en passent un différent, et ce module
    // n'a pas à trancher ce désaccord. Un défaut par défaut ici le trancherait en silence.
    expect(stylesFondDiplome('/assets/fond-a.png').backgroundImage).toBe('url(/assets/fond-a.png)');
    expect(stylesFondDiplome('data:image/png;base64,AAAA').backgroundImage)
      .toBe('url(data:image/png;base64,AAAA)');
  });

  it('garde le rapport 4:3 de l’image de fond', () => {
    expect(DIPLOME_LARGEUR_PX / DIPLOME_HAUTEUR_PX).toBeCloseTo(4 / 3, 10);
    expect(stylesFondDiplome('x').width).toBe('800px');
    expect(stylesFondDiplome('x').height).toBe('600px');
  });
});

describe('composerDiplomeHtml', () => {
  it('convertit les clés de style JavaScript en propriétés CSS', () => {
    const html = composerDiplomeHtml(champs, '/fond.png');
    expect(html).toContain('background-image:url(/fond.png)');
    expect(html).toContain('background-size:cover');
    expect(html).toContain('box-sizing:border-box');
    // Et aucune clé n'est restée en casse JavaScript, ce qui serait ignoré en silence par
    // le navigateur — un style perdu ne lève pas, il ne s'applique pas.
    expect(html).not.toContain('backgroundImage');
    expect(html).not.toContain('boxSizing');
  });
});

describe('diplôme vierge', () => {
  it('remplace les quatre valeurs par des traits à remplir', () => {
    const html = composerContenuDiplome(CHAMPS_DIPLOME_VIERGE);
    // Les libellés restent — c'est ce qui dit quoi écrire sur chaque trait.
    expect(html).toContain('Ce diplôme est décerné à :');
    expect(html).toContain('Type :');
    expect(html).toContain('Décerné par :');
    // Les quatre traits sont bien là, et aucun champ n'a gardé de valeur.
    expect(html.split(LIGNE_A_REMPLIR).length - 1).toBe(4);
  });

  it('écrit le trait avec des espaces insécables, qui survivent au rendu HTML', () => {
    // ⚠️ Une suite d'espaces ordinaires se réduit à un seul en HTML : le trait deviendrait
    // une rangée de points serrés, sur laquelle on n'écrit pas. Ce test est la seule chose
    // qui le dise, le défaut étant purement visuel.
    expect(LIGNE_A_REMPLIR).toContain(' ');
    expect(LIGNE_A_REMPLIR).not.toMatch(/ {2,}/);
    expect(LIGNE_A_REMPLIR.length).toBeGreaterThanOrEqual(30);
  });

  it('ne contient aucune donnée personnelle : c’est un document public imprimable', () => {
    // Le vierge part dans `public/docs/`, servi SANS authentification. Un nom ou une date
    // qui s'y glisserait serait publié.
    const html = composerDiplomeHtml(CHAMPS_DIPLOME_VIERGE, '/fond.png');
    expect(html).not.toMatch(/\d{4}/); // ni année, ni date
    expect(html).not.toMatch(/[A-ZÉÈ][a-zéèêàç]+ [A-Z]\./); // ni « Prénom N. »
  });
});
