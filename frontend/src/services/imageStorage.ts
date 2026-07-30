// ✅ Chantier 2 (PLAN-spark-images-competition.md) : seul fichier du code qui connaît
// Cloudinary. Aucun autre fichier ne doit importer Cloudinary directement — en cas de
// changement de fournisseur, seul ce module est à réécrire.
const CLOUD_NAME = import.meta.env.VITE_CLOUDINARY_CLOUD_NAME as string;
const UPLOAD_PRESET = import.meta.env.VITE_CLOUDINARY_UPLOAD_PRESET as string;

// ✅ Le preset Cloudinary de ce projet ne permet pas de régler une limite de taille
// côté fournisseur (option non disponible sur ce compte) : la limite est donc imposée
// ici, avant l'envoi, pour échouer immédiatement sans aller-retour réseau.
const MAX_FILE_SIZE_BYTES = 2 * 1024 * 1024; // 2 Mo

export interface UploadedBoulderImage {
  url: string;
  publicId: string;
  // ✅ Présent seulement si le preset a "return_delete_token" activé ; sinon undefined
  // et deleteUnconfirmedUpload() ne fait rien (best-effort, pas bloquant).
  deleteToken?: string;
}

export async function uploadBoulderImage(file: File): Promise<UploadedBoulderImage> {
  if (!file.type.startsWith('image/')) {
    throw new Error("Le fichier sélectionné n'est pas une image.");
  }
  if (file.size > MAX_FILE_SIZE_BYTES) {
    throw new Error('Image trop volumineuse (2 Mo maximum).');
  }

  const formData = new FormData();
  formData.append('file', file);
  formData.append('upload_preset', UPLOAD_PRESET);
  formData.append('folder', 'blocabrac/boulders');

  let response: Response;
  try {
    response = await fetch(`https://api.cloudinary.com/v1_1/${CLOUD_NAME}/image/upload`, {
      method: 'POST',
      body: formData
    });
  } catch {
    throw new Error("Échec de l'envoi de l'image (connexion). Réessayez.");
  }

  if (!response.ok) {
    throw new Error("Échec de l'envoi de l'image. Réessayez.");
  }

  const data = await response.json();
  return {
    url: data.secure_url as string,
    publicId: data.public_id as string,
    deleteToken: data.delete_token as string | undefined
  };
}

// ✅ Abandon immédiat (annulation du formulaire, remplacement de la photo) : supprime
// l'upload à la source sans attendre le nettoyage périodique du Chantier 4. Best-effort,
// n'importe pas d'échec — l'image orpheline sera de toute façon traitée plus tard.
export async function deleteUnconfirmedUpload(deleteToken: string | undefined): Promise<void> {
  if (!deleteToken) return;
  try {
    await fetch(`https://api.cloudinary.com/v1_1/${CLOUD_NAME}/delete_by_token`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ token: deleteToken })
    });
  } catch {
    // Best-effort : une image orpheline ici sera de toute façon vue par le Chantier 4.
  }
}

export type BoulderImageVariant = 'thumb' | 'full';

const VARIANT_TRANSFORMS: Record<BoulderImageVariant, string> = {
  thumb: 'f_auto,q_auto,w_400',
  full: 'f_auto,q_auto,w_1000'
};

export function getBoulderImageUrl(publicId: string, variant: BoulderImageVariant): string {
  return `https://res.cloudinary.com/${CLOUD_NAME}/image/upload/${VARIANT_TRANSFORMS[variant]}/${publicId}`;
}
