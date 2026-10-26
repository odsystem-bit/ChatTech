<?php

namespace App\Http\Controllers\Api\V1;

use App\Http\Controllers\Controller;
use App\Models\AuditLog;
use App\Models\Compte;
use App\Support\Tenant\Tenant;
use Illuminate\Http\Request;
use Illuminate\Validation\Rule;

/**
 * Console admin : gestion des comptes du tenant (§17.3).
 * TenantScope borne tout au tenant courant — un admin ne peut
 * créer/voir que les comptes de SON entreprise. Jamais de
 * super_admin créé ici : réservé à la console plateforme.
 */
class ComptesController extends Controller
{
    private const ROLES_ASSIGNABLES = [
        'admin', 'coordonnateur', 'superviseur', 'gestionnaire',
        'conformite', 'chef', 'technicien',
    ];

    public function index()
    {
        return Compte::with(['equipe:id,nom', 'ville:id,nom,code'])
            ->orderBy('nom')
            ->paginate(50);
    }

    public function store(Request $request)
    {
        $data = $request->validate([
            // Identifiant unique GLOBALEMENT : le tenant est résolu
            // depuis l'identifiant seul au login (plus de champ entreprise).
            'identifiant' => [
                'required', 'string', 'max:60',
                Rule::unique('comptes', 'identifiant')->withoutTrashed(),
            ],
            'nom' => 'required|string|max:255',
            'password' => 'required|string|min:8',
            'role' => ['required', Rule::in(self::ROLES_ASSIGNABLES)],
            'ville_id' => [
                'nullable', 'integer',
                Rule::exists('villes', 'id')->where('entreprise_id', Tenant::entrepriseId()),
            ],
            'equipe_id' => [
                'nullable', 'integer',
                Rule::exists('equipes', 'id')->where('entreprise_id', Tenant::entrepriseId()),
            ],
        ]);

        $compte = Compte::create([
            'identifiant' => $data['identifiant'],
            'nom' => $data['nom'],
            'password_hash' => password_hash($data['password'], PASSWORD_BCRYPT),
            'role' => $data['role'],
            'ville_id' => $data['ville_id'] ?? null,
            'equipe_id' => $data['equipe_id'] ?? null,
        ]);

        AuditLog::ecrire('creation_compte', 'compte', $compte->id,
            ['identifiant' => $compte->identifiant, 'role' => $compte->role]);

        return response()->json($compte->load('ville:id,nom', 'equipe:id,nom'), 201);
    }

    public function update(Request $request, string $id)
    {
        $compte = Compte::findOrFail($id);

        $data = $request->validate([
            'identifiant' => [
                'sometimes', 'string', 'max:60',
                Rule::unique('comptes', 'identifiant')->withoutTrashed()
                    ->ignore($compte->id),
            ],
            'nom' => 'sometimes|string|max:255',
            'password' => 'sometimes|string|min:8',
            'role' => ['sometimes', Rule::in(self::ROLES_ASSIGNABLES)],
            'ville_id' => [
                'nullable', 'integer',
                Rule::exists('villes', 'id')->where('entreprise_id', Tenant::entrepriseId()),
            ],
            'equipe_id' => [
                'nullable', 'integer',
                Rule::exists('equipes', 'id')->where('entreprise_id', Tenant::entrepriseId()),
            ],
            'actif' => 'sometimes|boolean',
        ]);

        if (isset($data['password'])) {
            $data['password_hash'] = password_hash($data['password'], PASSWORD_BCRYPT);
            unset($data['password']);
        }

        $compte->update($data);

        return $compte;
    }

    public function destroy(string $id)
    {
        $compte = Compte::findOrFail($id);

        if ($compte->id === Tenant::compte()->id) {
            return response()->json(
                ['error' => 'Impossible de supprimer son propre compte'], 422
            );
        }

        $compte->delete(); // soft delete — les tokens restent mais estValide() bloque

        AuditLog::ecrire('suppression_compte', 'compte', $compte->id,
            ['identifiant' => $compte->identifiant]);

        return response()->json(['statut' => 'supprime']);
    }
}
