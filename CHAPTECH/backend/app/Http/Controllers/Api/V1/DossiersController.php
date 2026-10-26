<?php

namespace App\Http\Controllers\Api\V1;

use App\Http\Controllers\Controller;
use App\Models\AuditLog;
use App\Models\Intervention;
use App\Models\Ville;
use App\Support\Tenant\Tenant;
use Illuminate\Http\Request;
use Illuminate\Support\Str;
use Illuminate\Validation\Rule;

class DossiersController extends Controller
{
    /**
     * GET /api/v1/dossiers/du-jour — liste des dossiers d'une journée donnée.
     * Accessible par coordonnateur, superviseur, admin, conformité.
     */
    public function duJour(Request $request)
    {
        $compte = Tenant::compte();
        $date = $request->query('date', now()->toDateString());
        $villeId = $request->query('ville_id');

        // Isolation de ville (§2, §3 PLAN.md) :
        // Un coordonnateur ou superviseur de ville ne peut voir que sa propre ville.
        if ($compte->isDeVille()) {
            $villeId = $compte->ville_id;
        }

        $query = Intervention::with([
            'ville:id,nom,code',
            'equipe:id,nom',
            'dispatchePar:id,nom',
        ])
        ->whereDate('date_dossier', $date)
        ->orderBy('created_at', 'asc');

        if ($villeId) {
            $query->where('ville_id', $villeId);
        }

        $dossiers = $query->get();

        $stats = [
            'total' => $dossiers->count(),
            'a_dispatcher' => $dossiers->where('statut_distribution', 'a_dispatcher')->count(),
            'dispatche' => $dossiers->where('statut_distribution', 'dispatche')->count(),
            'en_cours' => $dossiers->where('statut_distribution', 'en_cours')->count(),
            'termine' => $dossiers->where('statut_distribution', 'termine')->count(),
            'non_traite' => $dossiers->where('statut_distribution', 'non_traite')->count(),
        ];

        return response()->json([
            'date' => $date,
            'ville_id' => $villeId ? (int) $villeId : null,
            'stats' => $stats,
            'dossiers' => $dossiers,
        ]);
    }

    /**
     * POST /api/v1/dossiers — saisie / injection d'un ou plusieurs dossiers du jour.
     * Accessible par coordonnateur et admin.
     */
    public function store(Request $request)
    {
        $compte = Tenant::compte();

        // Supporte l'envoi d'un dossier unique OU d'un tableau 'dossiers' (batch 4-5 clients)
        $estBatch = $request->has('dossiers') && is_array($request->dossiers);
        $elements = $estBatch ? $request->dossiers : [$request->all()];

        $crees = [];

        foreach ($elements as $index => $item) {
            $data = validator($item, [
                'client_nom' => 'required|string|max:255',
                'client_tel' => 'nullable|string|max:50',
                'mobile' => 'nullable|string|max:50',
                'adresse' => 'nullable|string|max:255',
                'ville_id' => [
                    'required', 'integer',
                    Rule::exists('villes', 'id')->where('entreprise_id', Tenant::entrepriseId()),
                ],
                'date_dossier' => 'nullable|date',
                'notes' => 'nullable|string',
            ])->validate();

            // Vérification de la ville pour un coordonnateur de ville
            if ($compte->isDeVille() && (int) $data['ville_id'] !== (int) $compte->ville_id) {
                return response()->json([
                    'error' => "Action non autorisée sur la ville sélectionnée pour la ligne " . ($index + 1),
                ], 403);
            }

            $dateDossier = !empty($data['date_dossier']) ? $data['date_dossier'] : now()->toDateString();

            $intervention = Intervention::create([
                'id' => (string) Str::uuid(),
                'entreprise_id' => Tenant::entrepriseId(),
                'ville_id' => $data['ville_id'],
                'cree_par' => $compte->id,
                'client_nom' => trim($data['client_nom']),
                'client_tel' => !empty($data['client_tel']) ? trim($data['client_tel']) : null,
                'mobile' => !empty($data['mobile']) ? trim($data['mobile']) : null,
                'adresse' => !empty($data['adresse']) ? trim($data['adresse']) : null,
                'notes' => !empty($data['notes']) ? trim($data['notes']) : null,
                'statut' => 'en_cours',
                'statut_distribution' => 'a_dispatcher',
                'date' => $dateDossier . ' ' . now()->toTimeString(),
                'date_dossier' => $dateDossier,
            ]);

            $crees[] = $intervention->load('ville:id,nom,code');
        }

        AuditLog::ecrire('injection_dossiers', 'interventions', null, [
            'count' => count($crees),
            'auteur' => $compte->nom,
        ]);

        return response()->json($estBatch ? $crees : $crees[0], 201);
    }

    /**
     * PUT /api/v1/dossiers/{id} — mise à jour d'un dossier avant traitement.
     */
    public function update(Request $request, string $id)
    {
        $compte = Tenant::compte();
        $dossier = Intervention::findOrFail($id);

        if ($compte->isDeVille() && (int) $dossier->ville_id !== (int) $compte->ville_id) {
            return response()->json(['error' => 'Dossier hors de votre ville'], 403);
        }

        $data = $request->validate([
            'client_nom' => 'sometimes|string|max:255',
            'client_tel' => 'nullable|string|max:50',
            'mobile' => 'nullable|string|max:50',
            'adresse' => 'nullable|string|max:255',
            'notes' => 'nullable|string',
            'ville_id' => [
                'sometimes', 'integer',
                Rule::exists('villes', 'id')->where('entreprise_id', Tenant::entrepriseId()),
            ],
            'date_dossier' => 'sometimes|date',
        ]);

        if (isset($data['ville_id']) && $compte->isDeVille() && (int) $data['ville_id'] !== (int) $compte->ville_id) {
            return response()->json(['error' => 'Impossible d\'assigner à une autre ville'], 403);
        }

        $dossier->update($data);

        return response()->json($dossier->load('ville:id,nom,code', 'equipe:id,nom'));
    }

    /**
     * DELETE /api/v1/dossiers/{id} — suppression d'un dossier non encore dispatché.
     */
    public function destroy(string $id)
    {
        $compte = Tenant::compte();
        $dossier = Intervention::findOrFail($id);

        if ($compte->isDeVille() && (int) $dossier->ville_id !== (int) $compte->ville_id) {
            return response()->json(['error' => 'Dossier hors de votre ville'], 403);
        }

        if (!in_array($dossier->statut_distribution, ['a_dispatcher', 'non_traite'], true)) {
            return response()->json(['error' => 'Impossible de supprimer un dossier déjà pris en charge'], 422);
        }

        $dossier->delete();

        return response()->json(['ok' => true]);
    }
}
