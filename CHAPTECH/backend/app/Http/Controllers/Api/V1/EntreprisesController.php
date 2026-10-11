<?php

namespace App\Http\Controllers\Api\V1;

use App\Http\Controllers\Controller;
use App\Models\AuditLog;
use App\Models\Compte;
use App\Models\Entreprise;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Validation\Rule;

/**
 * Console super-admin plateforme (§17.3) : gestion des entreprises.
 * Route protégée par role:super_admin — seul ce rôle voit tous
 * les tenants (modèle sans scope tenant, requêtes explicites).
 */
class EntreprisesController extends Controller
{
    public function index()
    {
        return Entreprise::orderBy('nom')
            ->withCount([
                'equipes' => fn ($q) => $q->withoutGlobalScopes(),
                'comptes' => fn ($q) => $q->withoutGlobalScopes(),
            ])
            ->paginate(50);
    }

    public function show(string $id)
    {
        return Entreprise::with([
            'equipes' => fn ($q) => $q->withoutGlobalScopes()->withCount([
                'comptes' => fn ($c) => $c->withoutGlobalScopes(),
            ]),
        ])->findOrFail($id);
    }

    /**
     * Crée une entreprise + son premier compte admin dans la même
     * transaction — sans compte admin, personne ne peut se connecter.
     */
    public function store(Request $request)
    {
        $data = $request->validate([
            // Unique parmi les actives : le login résout l'entreprise
            // par son nom — deux homonymes créeraient une ambiguïté.
            'nom' => ['required', 'string', 'max:255',
                      Rule::unique('entreprises', 'nom')->withoutTrashed()],
            'etat_abonnement' => ['sometimes', Rule::in(['essai', 'actif', 'lecture_seule', 'suspendu'])],
            'fin_abonnement' => 'nullable|date',
            'limite_equipes' => 'sometimes|integer|min:1',
            // Unique globalement : le login ne demande pas l'entreprise
            'admin_identifiant' => ['required', 'string', 'max:60',
                                    Rule::unique('comptes', 'identifiant')->withoutTrashed()],
            'admin_nom' => 'required|string|max:255',
            'admin_password' => 'required|string|min:8',
        ]);

        return DB::transaction(function () use ($data) {
            $entreprise = Entreprise::create([
                'nom' => $data['nom'],
                'etat_abonnement' => $data['etat_abonnement'] ?? 'essai',
                'fin_abonnement' => $data['fin_abonnement'] ?? null,
                'limite_equipes' => $data['limite_equipes'] ?? 5,
            ]);

            $admin = Compte::withoutGlobalScopes()->create([
                'entreprise_id' => $entreprise->id,
                'identifiant' => $data['admin_identifiant'],
                'nom' => $data['admin_nom'],
                'password_hash' => password_hash($data['admin_password'], PASSWORD_BCRYPT),
                'role' => 'admin',
            ]);

            AuditLog::ecrire('creation_entreprise', 'entreprise', $entreprise->id,
                ['nom' => $entreprise->nom, 'admin' => $admin->identifiant],
                $entreprise->id);

            return response()->json([
                'entreprise' => $entreprise,
                'admin' => $admin->only(['id', 'identifiant', 'nom', 'role']),
            ], 201);
        });
    }

    public function update(Request $request, string $id)
    {
        $entreprise = Entreprise::findOrFail($id);

        $data = $request->validate([
            'nom' => ['sometimes', 'string', 'max:255',
                      Rule::unique('entreprises', 'nom')->withoutTrashed()
                          ->ignore($entreprise->id)],
            'etat_abonnement' => ['sometimes', Rule::in(['essai', 'actif', 'lecture_seule', 'suspendu'])],
            'fin_abonnement' => 'nullable|date',
            'limite_equipes' => 'sometimes|integer|min:1',
        ]);

        $entreprise->update($data);

        AuditLog::ecrire('modification_entreprise', 'entreprise', $entreprise->id,
            $data, $entreprise->id);

        return $entreprise;
    }

    public function destroy(string $id)
    {
        $entreprise = Entreprise::findOrFail($id);
        $entreprise->delete(); // soft delete — données conservées

        AuditLog::ecrire('suppression_entreprise', 'entreprise', $entreprise->id,
            ['nom' => $entreprise->nom], $entreprise->id);

        return response()->json(['statut' => 'supprime']);
    }
}
