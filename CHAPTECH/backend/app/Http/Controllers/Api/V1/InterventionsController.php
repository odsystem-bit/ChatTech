<?php

namespace App\Http\Controllers\Api\V1;

use App\Http\Controllers\Api\V1\Concerns\VerifieAccesEquipe;
use App\Http\Controllers\Controller;
use App\Models\Intervention;
use App\Support\Tenant\Tenant;
use Illuminate\Http\Request;
use Illuminate\Validation\Rule;

class InterventionsController extends Controller
{
    use VerifieAccesEquipe;

    /**
     * GET /api/v1/interventions — liste filtrée par rôle (§3).
     * technicien/chef : leur équipe seulement. admin/gestionnaire : tout.
     */
    public function index(Request $request)
    {
        $compte = Tenant::compte();
        $query = Intervention::with(['equipe:id,nom', 'ville:id,nom,code'])
            ->orderByDesc('updated_at')
            ->select('id', 'entreprise_id', 'ville_id', 'equipe_id', 'chef_nom', 'client_nom',
                     'client_tel', 'mobile', 'adresse', 'statut', 'statut_distribution',
                     'date', 'date_dossier', 'revision',
                     'cree_par', 'modifie_par', 'dispatche_par', 'dispatche_le',
                     'created_at', 'updated_at');

        if (in_array($compte->role, ['chef', 'technicien'], true)) {
            $query->where('equipe_id', $compte->equipe_id);
        } elseif ($compte->isDeVille()) {
            $query->where('ville_id', $compte->ville_id);
        }

        if ($request->filled('ville_id')) {
            $query->where('ville_id', $request->ville_id);
        }
        if ($request->filled('statut')) {
            $query->where('statut', $request->statut);
        }
        if ($request->filled('statut_distribution')) {
            $query->where('statut_distribution', $request->statut_distribution);
        }
        if ($request->filled('date')) {
            $query->whereDate('date_dossier', $request->date);
        }

        return response()->json($query->paginate(50));
    }

    /**
     * GET /api/v1/interventions/{id} — fiche complète (légère :
     * photos = métadonnées, pas de base64 — §16.1).
     */
    public function show(string $id)
    {
        $intervention = Intervention::with(['pointsGps', 'photos' => function ($q) {
            $q->select('id', 'intervention_id', 'type', 'fichier', 'nom',
                     'lat', 'lng', 'horodatage', 'ajoute_par');
        }])->findOrFail($id);

        $this->assertAccesIntervention($intervention);

        return response()->json($intervention);
    }

    /**
     * POST /api/v1/interventions — création depuis le terrain.
     * L'id UUID vient de l'app (§7) : un renvoi réseau ne crée pas de doublon.
     */
    public function store(Request $request)
    {
        $compte = Tenant::compte();
        $request->validate([
            'id' => 'required|uuid',
            // L'équipe doit exister DANS ce tenant — sans quoi un admin
            // pourrait rattacher la fiche à une équipe étrangère (FK 500).
            'equipe_id' => [
                'required', 'integer',
                Rule::exists('equipes', 'id')
                    ->where('entreprise_id', Tenant::entrepriseId()),
            ],
        ]);

        // Un technicien ne crée que pour SA propre équipe (§17.4.1)
        if (in_array($compte->role, ['chef', 'technicien'], true)
            && (int) $request->equipe_id !== $compte->equipe_id) {
            return response()->json(['error' => 'Équipe non autorisée'], 403);
        }

        // UUID déjà connu → on renvoie l'existant (idempotence création).
        // withoutGlobalScopes : un UUID d'un autre tenant donnerait sinon
        // un « not found » suivi d'une violation de PK → 500. On répond 409.
        $existante = Intervention::withoutGlobalScopes()->find($request->id);
        if ($existante) {
            if ($existante->entreprise_id !== Tenant::entrepriseId()) {
                return response()->json(['error' => 'UUID déjà pris'], 409);
            }
            return response()->json($existante, 200);
        }

        $chef = $compte->role === 'chef' ? $compte : $compte->equipe?->chef;

        $intervention = Intervention::create([
            'id' => $request->id,
            'entreprise_id' => Tenant::entrepriseId(),
            'equipe_id' => $request->equipe_id,
            'cree_par' => $compte->id,
            'chef_nom' => $chef?->nom,
            'statut' => 'en_cours',
            'date' => now(),
        ]);

        return response()->json($intervention, 201);
    }
}
