<?php

namespace App\Http\Controllers\Api\V1;

use App\Http\Controllers\Controller;
use App\Models\AuditLog;
use App\Models\Entreprise;
use Illuminate\Http\Request;
use Illuminate\Validation\Rule;

/**
 * Console super-admin : vue abonnements de toutes les entreprises
 * et bascule d'état (§8 / §17.3). Route protégée role:super_admin.
 */
class AbonnementsController extends Controller
{
    public function index()
    {
        return Entreprise::select([
                'id', 'nom', 'etat_abonnement', 'fin_abonnement', 'limite_equipes',
            ])
            ->orderBy('fin_abonnement')
            ->get();
    }

    /**
     * PUT /api/v1/abonnements/{entreprise_id} — bascule d'état :
     * lecture_seule / suspendu → AbonnementMiddleware bloque les écritures.
     */
    public function update(Request $request, string $id)
    {
        $entreprise = Entreprise::findOrFail($id);

        $data = $request->validate([
            'etat_abonnement' => ['sometimes', Rule::in(['essai', 'actif', 'lecture_seule', 'suspendu'])],
            'fin_abonnement' => 'nullable|date',
            'limite_equipes' => 'sometimes|integer|min:1',
        ]);

        $entreprise->update($data);

        // §13 : la bascule d'abonnement impacte tout un tenant → tracée
        AuditLog::ecrire('abonnement', 'entreprise', $entreprise->id,
            $data, $entreprise->id);

        return $entreprise->only(['id', 'nom', 'etat_abonnement', 'fin_abonnement', 'limite_equipes']);
    }
}
