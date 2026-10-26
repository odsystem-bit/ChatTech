<?php

namespace App\Http\Controllers\Api\V1;

use App\Http\Controllers\Controller;
use App\Models\AuditLog;
use App\Models\Ville;
use App\Support\Tenant\Tenant;
use Illuminate\Http\Request;
use Illuminate\Validation\Rule;

class VillesController extends Controller
{
    /**
     * GET /api/v1/villes — liste des villes actives du tenant.
     */
    public function index()
    {
        return response()->json(
            Ville::orderBy('nom')
                ->withCount(['equipes', 'interventions'])
                ->get()
        );
    }

    /**
     * POST /api/v1/villes — création d'une ville (admin).
     */
    public function store(Request $request)
    {
        $data = $request->validate([
            'nom' => [
                'required', 'string', 'max:100',
                Rule::unique('villes', 'nom')->where('entreprise_id', Tenant::entrepriseId())->withoutTrashed(),
            ],
            'code' => 'nullable|string|max:10',
        ]);

        $ville = Ville::create([
            'nom' => trim($data['nom']),
            'code' => !empty($data['code']) ? strtoupper(trim($data['code'])) : null,
            'actif' => true,
        ]);

        AuditLog::ecrire('creation_ville', 'ville', $ville->id, ['nom' => $ville->nom]);

        return response()->json($ville, 201);
    }

    /**
     * PUT /api/v1/villes/{id} — modification d'une ville (admin).
     */
    public function update(Request $request, string $id)
    {
        $ville = Ville::findOrFail($id);

        $data = $request->validate([
            'nom' => [
                'sometimes', 'string', 'max:100',
                Rule::unique('villes', 'nom')->where('entreprise_id', Tenant::entrepriseId())->withoutTrashed()->ignore($ville->id),
            ],
            'code' => 'nullable|string|max:10',
            'actif' => 'sometimes|boolean',
        ]);

        if (isset($data['nom'])) $data['nom'] = trim($data['nom']);
        if (isset($data['code'])) $data['code'] = !empty($data['code']) ? strtoupper(trim($data['code'])) : null;

        $ville->update($data);

        return response()->json($ville);
    }

    /**
     * DELETE /api/v1/villes/{id} — suppression douce (admin).
     */
    public function destroy(string $id)
    {
        $ville = Ville::findOrFail($id);
        $ville->delete();

        AuditLog::ecrire('suppression_ville', 'ville', $ville->id, ['nom' => $ville->nom]);

        return response()->json(['ok' => true]);
    }
}
