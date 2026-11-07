import React from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Container,
  Typography,
  Box,
  Paper,
  Button,
  Alert,
  Chip,
  Divider,
  Stack,
} from '@mui/material';
import {
  ArrowBack as ArrowBackIcon,
  PictureAsPdf as PictureAsPdfIcon,
  Language as LanguageIcon,
} from '@mui/icons-material';
import { listerDocumentsSalle } from '../../utils/documentsSalle';

/**
 * « Documents de la salle » — la liste des documents imprimables, pour les rôles admin,
 * ouvreur et moniteur.
 *
 * ⚠️ POURQUOI CET ÉCRAN EXISTE, ET CE QU'IL NE FAIT PAS. Il ne protège rien : `public/docs/`
 * est servi sans authentification, et l'application est une page unique — le code de cet écran,
 * donc les URL qu'il contient, part dans le bundle servi à tout visiteur. C'est un **confort
 * de navigation**. La politique de dossier est dans `frontend/public/docs/README.md`.
 *
 * ⚠️ Et l'argument qui l'a fait construire, à ne pas perdre : *un lien dans l'application est
 * un chemin que quelqu'un emprunte.* Tant que l'accès passait par une URL qu'on se transmet à
 * la main, le chemin n'était jamais parcouru — et le guide de connexion est resté **cassé
 * depuis sa création** (écran blanc, V2.76.2) sans que personne le voie, pendant que les deux
 * topos n'étaient servis nulle part du tout.
 *
 * Le catalogue et la jointure avec les estampilles vivent dans `utils/documentsSalle.ts`
 * (module pur, testé) : la couverture de tests s'arrête au bord de ce fichier.
 */
const DocumentsSalle: React.FC = () => {
  const navigate = useNavigate();
  const documents = listerDocumentsSalle();

  return (
    <Container maxWidth="md" sx={{ py: { xs: 2, sm: 4 } }}>
      <Button startIcon={<ArrowBackIcon />} onClick={() => navigate(-1)} sx={{ mb: 2 }}>
        Retour
      </Button>

      <Typography variant="h4" gutterBottom sx={{ fontSize: { xs: '1.5rem', sm: '2.125rem' } }}>
        📄 Documents de la salle
      </Typography>

      <Typography color="text.secondary" sx={{ mb: 3 }}>
        Les documents à consulter ou à imprimer. Chacun porte la version de l’application qu’il
        décrit et sa date de génération : un document daté se repère périmé.
      </Typography>

      {/* ⚠️ Dit à l'écran ce que le README dit au dépôt. Celui qui déposera un jour un fichier
          dans ce dossier n'aura pas lu le README ; il aura peut-être vu cet écran. */}
      <Alert severity="info" sx={{ mb: 3 }}>
        Ces fichiers sont servis <strong>publiquement</strong> : ce menu les rassemble, il ne les
        protège pas. Un document déposé dans <code>public/docs/</code> est accessible à qui
        connaît son adresse.
      </Alert>

      <Paper sx={{ p: { xs: 2, sm: 3 } }}>
        <Stack divider={<Divider />} spacing={2.5}>
          {documents.map((doc) => (
            <Box key={doc.fichier}>
              <Typography variant="h6" sx={{ fontSize: { xs: '1.05rem', sm: '1.25rem' } }}>
                {doc.titre}
              </Typography>

              <Typography variant="body2" color="text.secondary" sx={{ mt: 0.5, mb: 1.5 }}>
                {doc.aQuoiCaSert}
              </Typography>

              <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 1, alignItems: 'center' }}>
                {/* `target="_blank"` + `rel` : on ouvre un document, on ne quitte pas l'appli.
                    Pas de <Link> de react-router — ce n'est pas une route, c'est un fichier
                    servi à l'adresse (et c'est `navigateFallbackDenylist` qui garantit que le
                    service worker ne répondra pas `index.html` à sa place). */}
                <Button
                  variant="contained"
                  size="small"
                  startIcon={<PictureAsPdfIcon />}
                  href={doc.url}
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  Ouvrir le PDF
                </Button>

                {doc.urlHtml && (
                  <Button
                    variant="outlined"
                    size="small"
                    startIcon={<LanguageIcon />}
                    href={doc.urlHtml}
                    target="_blank"
                    rel="noopener noreferrer"
                  >
                    Version web
                  </Button>
                )}

                {/* ⚠️ `estampille === null` n'affiche JAMAIS un numéro de repli : une version
                    inventée serait plausible et fausse, donc pire que rien. */}
                {doc.estampille ? (
                  <Chip
                    size="small"
                    variant="outlined"
                    label={`${doc.estampille.version} · généré le ${doc.estampille.genereLe}`}
                  />
                ) : (
                  <Chip size="small" variant="outlined" label="Estampille inconnue" />
                )}
              </Box>

              {doc.sansEstampille && (
                <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mt: 1 }}>
                  {doc.sansEstampille}
                </Typography>
              )}
            </Box>
          ))}
        </Stack>
      </Paper>

      <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mt: 2 }}>
        Les topos et l’affiche sont régénérés depuis le dépôt (<code>npm run topo</code>,{' '}
        <code>npm run topo:roulettes</code>, <code>npm run affiche:bareme</code>) : leur
        estampille est dérivée à la génération, jamais saisie à la main.
      </Typography>
    </Container>
  );
};

export default DocumentsSalle;
