<?php

namespace App\Http\Controllers\Api\V1;

use App\Http\Controllers\Controller;
use App\Models\Article;
use App\Models\Equipe;
use App\Models\Operation;
use App\Models\Stock;
use App\Services\StockService;
use App\Support\Tenant\Tenant;
use Illuminate\Database\QueryException;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;

/**
 * Stock §5 : les contrôleurs ne touchent jamais la table stocks —
 * tout passe par StockService (journal + transaction + verrous).
 * Idempotence via operations.uuid (§16.2).
 */
class StockController extends Controller
{
    /**
     * GET /api/v1/stock?equipe=N | ?central=1
     * Terrain (chef/technicien) : uniquement le stock de sa propre équipe.
     * Console (admin/gestionnaire) : n'importe quelle équipe ou le central.
     */
    public function index(Request $request)
    {
        $request->validate([
            'equipe' => 'nullable|integer',
            'central' => 'nullable|boolean',
        ]);

        $compte = Tenant::compte();
        $query = Stock::with('article')->orderBy('proprietaire_type');

        if (in_array($compte->role, ['chef', 'technicien'], true)) {
            $query->where('proprietaire_type', 'equipe')
                ->where('proprietaire_id', $compte->equipe_id ?? 0);
        } elseif ($request->filled('equipe')) {
            Equipe::findOrFail($request->equipe); // TenantScope → 404 si étranger
            $query->where('proprietaire_type', 'equipe')
                ->where('proprietaire_id', $request->equipe);
        } elseif ($request->boolean('central')) {
            $query->where('proprietaire_type', 'central')
                ->where('proprietaire_id', Stock::CENTRAL);
        }

        return $query->get();
    }

    /**
     * POST /api/v1/stock/mouvements — un mouvement idempotent.
     * uuid = identifiant d'opération client → renvoi réseau = même résultat.
     */
    public function mouvement(Request $request)
    {
        $data = $request->validate([
            'uuid' => 'required|uuid',
            'article_id' => 'required|integer',
            'de_type' => 'required|in:central,equipe,exterieur',
            'de_id' => 'required|integer|min:0',
            'vers_type' => 'required|in:central,equipe,exterieur',
            'vers_id' => 'required|integer|min:0',
            'quantite' => 'required|integer|min:1',
            'motif' => 'required|string|max:50',
            'intervention_id' => 'nullable|uuid',
        ]);

        $article = Article::findOrFail($data['article_id']);
        // §17.4.1 : les IDs de la requête sont vérifiés contre le tenant
        foreach ([$data['de_type'], $data['vers_type']] as $i => $type) {
            if ($type === 'equipe') {
                Equipe::findOrFail($i === 0 ? $data['de_id'] : $data['vers_id']);
            }
        }

        // Opération + mouvement dans UNE transaction : si le mouvement
        // échoue, la ligne operations est rollbackée → le retry ré-applique
        // au lieu de renvoyer deja_applique sur un effet jamais produit.
        $resultat = DB::transaction(function () use ($data, $article) {
            $operation = $this->operationIdempotente($data);
            if (!$operation->wasRecentlyCreated) {
                return ['deja' => true, 'resultat' => $operation->resultat];
            }

            $mouvement = app(StockService::class)->mouvement(
                $article->id, $data['de_type'], $data['de_id'],
                $data['vers_type'], $data['vers_id'], $data['quantite'],
                Tenant::compte()->id, $data['motif'], $operation->id,
                $data['intervention_id'] ?? null
            );

            $operation->update(['resultat' => ['mouvement_id' => $mouvement->id]]);
            return ['deja' => false, 'mouvement' => $mouvement];
        });

        if ($resultat['deja']) {
            return response()->json([
                'statut' => 'deja_applique',
                'resultat' => $resultat['resultat'],
            ]);
        }

        return response()->json(['mouvement' => $resultat['mouvement']], 201);
    }

    /**
     * POST /api/v1/stock/import — import en lot extérieur -> central.
     * Réservé console (role:admin,gestionnaire sur la route).
     */
    public function import(Request $request)
    {
        $data = $request->validate([
            'uuid' => 'required|uuid',
            'lignes' => 'required|array|min:1',
            'lignes.*.article_id' => 'required|integer',
            'lignes.*.quantite' => 'required|integer|min:1',
        ]);

        // Idem : import en lot atomique — tout ou rien, jamais un
        // demi-import marqué deja_applique.
        $resultat = DB::transaction(function () use ($data) {
            $operation = $this->operationIdempotente($data, 'import_stock');
            if (!$operation->wasRecentlyCreated) {
                return ['deja' => true, 'resultat' => $operation->resultat];
            }

            $service = app(StockService::class);
            $mouvements = [];
            foreach ($data['lignes'] as $ligne) {
                $article = Article::findOrFail($ligne['article_id']);
                $mouvements[] = $service->mouvement(
                    $article->id, 'exterieur', 0, 'central', Stock::CENTRAL,
                    $ligne['quantite'], Tenant::compte()->id, 'import',
                    $operation->id
                )->id;
            }

            $operation->update(['resultat' => ['mouvements' => $mouvements]]);
            return ['deja' => false, 'mouvements' => $mouvements];
        });

        if ($resultat['deja']) {
            return response()->json([
                'statut' => 'deja_applique',
                'resultat' => $resultat['resultat'],
            ]);
        }

        return response()->json(['mouvements' => $resultat['mouvements']], 201);
    }

    /**
     * Idempotence §16.2 : un uuid n'est appliqué qu'une fois,
     * le résultat est conservé pour les renvois réseau.
     */
    private function operationIdempotente(array $data, string $type = 'mouvement_stock'): Operation
    {
        $payload = $data;
        unset($payload['uuid']);

        try {
            return Operation::firstOrCreate(
                ['uuid' => $data['uuid']],
                [
                    'entreprise_id' => Tenant::entrepriseId(),
                    'compte_id' => Tenant::compte()->id,
                    'intervention_id' => $data['intervention_id'] ?? null,
                    'type' => $type,
                    'payload' => $payload,
                    'applique_le' => now(),
                ]
            );
        } catch (QueryException $e) {
            // Race : deux requêtes simultanées, même uuid → la perdante
            // relit la ligne gagnante au lieu de 500.
            return Operation::where('uuid', $data['uuid'])->firstOrFail();
        }
    }
}
