<?php

namespace App\Http\Controllers\Api\V1;

use App\Http\Controllers\Controller;
use App\Models\Erreur;
use App\Support\Tenant\Tenant;
use Illuminate\Http\Request;

/**
 * Remontée des plantages clients §14 : les apps envoient leurs erreurs
 * ici — pas de service externe. L'empreinte déduplique les occurrences.
 */
class ErreursController extends Controller
{
    /**
     * POST /api/v1/errors
     */
    public function store(Request $request)
    {
        $request->validate([
            'source' => 'required|in:api,web,mobile',
            'message' => 'required|string|max:2000',
            'stack' => 'nullable|string|max:50000',
            'fichier' => 'nullable|string|max:255',
            'ligne' => 'nullable|integer',
            'appareil' => 'nullable|string|max:255',
            'version_app' => 'nullable|string|max:50',
            'route' => 'nullable|string|max:255',
        ]);

        $empreinte = hash('sha256',
            $request->source . '|' . $request->fichier . '|'
            . $request->ligne . '|' . substr($request->message, 0, 200)
        );

        $erreur = Erreur::firstOrNew(['empreinte' => $empreinte]);
        if ($erreur->exists) {
            // Erreur déjà connue : on incrémente SANS toucher
            // entreprise_id/compte_id — sinon un autre tenant qui
            // remonte la même empreinte se l'approprierait.
            $erreur->occurrences++;
            $erreur->derniere_fois = now();
            $erreur->resolu_le = null; // réapparue
        } else {
            $erreur->fill($request->only([
                'source', 'message', 'stack', 'fichier', 'ligne',
                'appareil', 'version_app', 'route',
            ]));
            $erreur->entreprise_id = Tenant::entrepriseId();
            $erreur->compte_id = Tenant::compte()?->id;
            $erreur->premiere_fois = now();
            $erreur->derniere_fois = now();
            $erreur->occurrences = 1;
        }
        $erreur->save();

        return response()->json(['ok' => true], 201);
    }
}
