<?php

namespace App\Http\Controllers\Api\V1;

use App\Http\Controllers\Controller;
use App\Models\AlerteStock;
use App\Models\Equipe;
use App\Support\Tenant\Tenant;

/**
 * GET /api/v1/stock/alertes — stocks négatifs à régulariser §5.
 * chef/technicien : uniquement leur équipe. admin/gestionnaire : tout.
 */
class AlertesStockController extends Controller
{
    public function index()
    {
        $compte = Tenant::compte();
        $query = AlerteStock::with('article:id,code,libelle,unite')
            ->whereNull('resolue_le')
            ->orderBy('updated_at', 'desc');

        if (in_array($compte->role, ['chef', 'technicien'], true)) {
            $query->where('proprietaire_type', 'equipe')
                ->where('proprietaire_id', $compte->equipe_id ?? 0);
        }

        $alertes = $query->get();

        $noms = Equipe::whereIn('id', $alertes->where('proprietaire_type', 'equipe')->pluck('proprietaire_id'))
            ->pluck('nom', 'id');

        return response()->json($alertes->map(fn ($a) => [
            'id' => $a->id,
            'article' => $a->article,
            'proprietaire_type' => $a->proprietaire_type,
            'proprietaire_id' => $a->proprietaire_id,
            'proprietaire' => $a->proprietaire_type === 'central'
                ? 'Stock central'
                : ($noms[$a->proprietaire_id] ?? "Équipe {$a->proprietaire_id}"),
            'quantite' => $a->quantite,
            'depuis' => $a->created_at,
        ])->values());
    }
}
