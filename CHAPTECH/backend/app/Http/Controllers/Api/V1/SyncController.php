<?php

namespace App\Http\Controllers\Api\V1;

use App\Exceptions\OperationInvalide;
use App\Http\Controllers\Api\V1\Concerns\VerifieAccesEquipe;
use App\Http\Controllers\Controller;
use App\Models\Intervention;
use App\Services\SyncService;
use App\Support\Tenant\Tenant;
use Illuminate\Http\Request;

/**
 * §16.2/16.3 — push des opérations + pull des deltas.
 * Tout passe par SyncService, jamais d'écriture directe ici (§17.4.2).
 */
class SyncController extends Controller
{
    use VerifieAccesEquipe;

    public function __construct(private SyncService $sync) {}

    /**
     * POST /api/v1/interventions/{id}/ops
     * Body: { ops: [{uuid, type, champ?|ligne_id?|valeur?|data?}] }
     */
    public function ops(Request $request, string $id)
    {
        $request->validate([
            'ops' => 'required|array|max:100',
            'ops.*.uuid' => 'required|uuid',
            'ops.*.type' => 'required|string',
        ]);

        $intervention = Intervention::findOrFail($id); // TenantScope filtre
        $this->assertAccesIntervention($intervention); // §3 : sa propre équipe

        try {
            $result = $this->sync->appliquerOps(
                $intervention,
                $request->input('ops'),
                Tenant::compte()->id
            );
        } catch (OperationInvalide $e) {
            // Erreur métier (champ non éditable, type inconnu) → 422,
            // pas 500 : ce n'est pas un plantage serveur.
            return response()->json(['error' => $e->getMessage()], 422);
        }

        return response()->json($result);
    }

    /**
     * GET /api/v1/interventions/{id}/changes?since_rev=N
     */
    public function changes(Request $request, string $id)
    {
        $intervention = Intervention::findOrFail($id);
        $this->assertAccesIntervention($intervention);
        $since = (int) $request->query('since_rev', 0);

        if ($intervention->revision === $since) {
            return response()->json(['revision' => $since, 'changed' => false]);
        }

        return response()->json($this->sync->delta($intervention, $since) + ['changed' => true]);
    }
}
