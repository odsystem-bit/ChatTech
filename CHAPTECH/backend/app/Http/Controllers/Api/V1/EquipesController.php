<?php

namespace App\Http\Controllers\Api\V1;

use App\Http\Controllers\Controller;
use App\Models\AuditLog;
use App\Models\Equipe;
use App\Support\Tenant\Tenant;
use Illuminate\Http\Request;
use Illuminate\Validation\Rule;

/**
 * Console admin : gestion des équipes du tenant (§17.3).
 * La limite d'abonnement (limite_equipes) est appliquée à la création.
 */
class EquipesController extends Controller
{
    public function index()
    {
        return Equipe::with(['chef:id,nom', 'ville:id,nom,code'])
            ->withCount('comptes')
            ->orderBy('nom')
            ->get();
    }

    public function store(Request $request)
    {
        $entreprise = Tenant::compte()->entreprise;

        if (Equipe::count() >= $entreprise->limite_equipes) {
            return response()->json([
                'error' => "Limite d'abonnement atteinte ({$entreprise->limite_equipes} équipes)",
            ], 422);
        }

        $data = $request->validate([
            'nom' => 'required|string|max:255',
            'ville_id' => [
                'nullable', 'integer',
                Rule::exists('villes', 'id')->where('entreprise_id', Tenant::entrepriseId()),
            ],
            'chef_compte_id' => [
                'nullable', 'integer',
                Rule::exists('comptes', 'id')->where('entreprise_id', Tenant::entrepriseId()),
            ],
        ]);

        $equipe = Equipe::create($data);

        AuditLog::ecrire('creation_equipe', 'equipe', $equipe->id,
            ['nom' => $equipe->nom]);

        return response()->json($equipe->load('ville:id,nom', 'chef:id,nom'), 201);
    }

    public function update(Request $request, string $id)
    {
        $equipe = Equipe::findOrFail($id);

        $data = $request->validate([
            'nom' => 'sometimes|string|max:255',
            'ville_id' => [
                'nullable', 'integer',
                Rule::exists('villes', 'id')->where('entreprise_id', Tenant::entrepriseId()),
            ],
            'chef_compte_id' => [
                'nullable', 'integer',
                Rule::exists('comptes', 'id')->where('entreprise_id', Tenant::entrepriseId()),
            ],
            'actif' => 'sometimes|boolean',
        ]);

        $equipe->update($data);

        return $equipe->load('ville:id,nom', 'chef:id,nom');
    }

    public function destroy(string $id)
    {
        $equipe = Equipe::findOrFail($id);
        $equipe->delete(); // soft delete

        AuditLog::ecrire('suppression_equipe', 'equipe', $equipe->id,
            ['nom' => $equipe->nom]);

        return response()->json(['statut' => 'supprime']);
    }
}
