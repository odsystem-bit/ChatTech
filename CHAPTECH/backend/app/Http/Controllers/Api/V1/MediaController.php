<?php

namespace App\Http\Controllers\Api\V1;

use App\Http\Controllers\Api\V1\Concerns\VerifieAccesEquipe;
use App\Http\Controllers\Controller;
use App\Jobs\CompresserPhoto;
use App\Models\Intervention;
use App\Models\Photo;
use App\Support\Tenant\Tenant;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Storage;

/**
 * Uploads de fichiers §6 : les fichiers vont sur disque privé
 * uploads/{entreprise}/{intervention}/..., la base ne garde que
 * les métadonnées — jamais de base64 en colonne (§16.1).
 */
class MediaController extends Controller
{
    use VerifieAccesEquipe;

    /**
     * POST /api/v1/media — multipart : intervention_id, type, fichier.
     * Renvoie immédiatement ; compression/EXIF = job queued (§16.5).
     */
    public function store(Request $request)
    {
        $request->validate([
            'id' => 'required|uuid',
            'intervention_id' => 'required|uuid',
            'type' => 'required|in:gps,terrain,fiche,video,signature',
            // Whitelist MIME : un .html uploadé serait servi en inline
            // par GET /media/{id} → XSS dans la console. Jamais de file nu.
            'fichier' => 'required|file|mimetypes:image/jpeg,image/png,image/webp,video/mp4,video/quicktime|max:51200', // 50 Mo
            'lat' => 'nullable|numeric',
            'lng' => 'nullable|numeric',
            'precision_m' => 'nullable|numeric',
            'horodatage' => 'nullable|date',
        ]);

        // TenantScope garantit que l'intervention appartient au tenant (§2)
        $intervention = Intervention::findOrFail($request->intervention_id);
        $this->assertAccesIntervention($intervention); // §3 : sa propre équipe

        // Idempotence : même UUID → même photo, pas de doublon.
        // Sans scope pour distinguer « UUID d'un autre tenant » (collision
        // quasi impossible mais une fuite vaut 0) d'un simple renvoi.
        $existante = Photo::withoutGlobalScopes()->find($request->id);
        if ($existante) {
            if ($existante->entreprise_id !== Tenant::entrepriseId()) {
                return response()->json(['error' => 'UUID déjà pris'], 409);
            }
            return response()->json($existante, 200);
        }

        // Disque 'local' = storage/app/private (non public par défaut §6.3)
        $path = $request->file('fichier')->store(
            "uploads/" . Tenant::entrepriseId() . "/{$intervention->id}",
            'local'
        );

        $photo = Photo::create([
            'id' => $request->id,
            'entreprise_id' => Tenant::entrepriseId(),
            'intervention_id' => $intervention->id,
            'ajoute_par' => Tenant::compte()->id,
            'type' => $request->type,
            'fichier' => $path,
            'lat' => $request->lat,
            'lng' => $request->lng,
            'precision_m' => $request->precision_m,
            'horodatage' => $request->horodatage ?? now(),
            'taille_octets' => $request->file('fichier')->getSize(),
        ]);

        // §16.5 : compression + EXIF en file — jamais dans la requête HTTP
        CompresserPhoto::dispatch($photo->id);

        return response()->json($photo, 201);
    }

    /**
     * GET /api/v1/media/{id} — téléchargement contrôlé (§6.3) :
     * passe par l'API, vérifie le tenant, jamais d'URL publique directe.
     */
    public function show(string $id)
    {
        $photo = Photo::findOrFail($id); // TenantScope filtre le tenant

        if (!Storage::disk('local')->exists($photo->fichier)) {
            return response()->json(['error' => 'Fichier manquant'], 404);
        }

        return Storage::disk('local')->response(
            $photo->fichier,
            $photo->nom ?? basename($photo->fichier)
        );
    }
}
