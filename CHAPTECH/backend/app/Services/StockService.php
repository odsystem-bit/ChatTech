<?php

namespace App\Services;

use App\Models\AlerteStock;
use App\Models\Article;
use App\Models\Intervention;
use App\Models\MouvementStock;
use App\Models\Operation;
use App\Models\Stock;
use App\Support\Tenant\Tenant;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Str;

/**
 * Stock §5 : tout mouvement passe ici, dans une transaction avec
 * verrous de ligne. Les soldes (table stocks) ne sont qu'un cache
 * du journal mouvements_stock — la vérité est le journal.
 */
class StockService
{
    /**
     * Enregistre un mouvement de -> vers, en une transaction.
     * Les deux lignes stocks sont verrouillées FOR UPDATE avant calcul.
     */
    public function mouvement(
        int $articleId, string $deType, int $deId,
        string $versType, int $versId, int $quantite,
        int $parCompteId, string $motif, int $operationId,
        ?string $interventionId = null
    ): MouvementStock {
        return DB::transaction(function () use (
            $articleId, $deType, $deId, $versType, $versId,
            $quantite, $parCompteId, $motif, $operationId, $interventionId
        ) {
            // Sans tenant résolu (job, console), on dérive de l'article
            // — jamais de ligne orpheline entreprise_id NULL.
            $entrepriseId = Tenant::entrepriseId()
                ?? Article::withoutGlobalScopes()->where('id', $articleId)
                    ->value('entreprise_id');

            $mouvement = MouvementStock::create([
                'entreprise_id' => $entrepriseId,
                'article_id' => $articleId,
                'de_type' => $deType, 'de_id' => $deId,
                'vers_type' => $versType, 'vers_id' => $versId,
                'quantite' => $quantite, 'motif' => $motif,
                'par' => $parCompteId,
                'intervention_id' => $interventionId,
                'operation_id' => $operationId,
            ]);

            $this->ajusterSolde($articleId, $deType, $deId, -$quantite, $entrepriseId);
            $this->ajusterSolde($articleId, $versType, $versId, $quantite, $entrepriseId);

            return $mouvement;
        });
    }

    /**
     * Verrou de ligne + ajustement du cache solde (§5).
     */
    private function ajusterSolde(int $articleId, string $type, int $id, int $delta, ?int $entrepriseId = null): void
    {
        // Requête bornée au tenant explicitement — fiable aussi hors
        // contexte HTTP (queue, tinker) où TenantScope est inerte.
        $stock = Stock::withoutGlobalScopes()
            ->where('entreprise_id', $entrepriseId)
            ->where('article_id', $articleId)
            ->where('proprietaire_type', $type)
            ->where('proprietaire_id', $id)
            ->lockForUpdate()
            ->first();

        if ($stock) {
            $stock->quantite += $delta;
            $stock->save();
            $solde = $stock->quantite;
        } else {
            Stock::create([
                'entreprise_id' => $entrepriseId,
                'article_id' => $articleId,
                'proprietaire_type' => $type,
                'proprietaire_id' => $id,
                'quantite' => $delta,
            ]);
            $solde = $delta;
        }

        $this->suivreAlerte($articleId, $type, $id, $solde, $entrepriseId);
    }

    /**
     * Stock insuffisant §5 : jamais de blocage terrain, mais l'écart est
     * signalé tant qu'il existe. Une seule alerte ouverte par ligne de stock ;
     * elle se referme dès que le solde revient à zéro ou plus.
     * Seuls les stocks réels (équipe, central) sont surveillés : 'exterieur'
     * et 'intervention' sont des contreparties comptables, négatives par nature.
     */
    private function suivreAlerte(int $articleId, string $type, int $id, int $solde, ?int $entrepriseId): void
    {
        if (!in_array($type, ['equipe', 'central'], true)) {
            return;
        }

        $ouverte = AlerteStock::withoutGlobalScopes()
            ->where('entreprise_id', $entrepriseId)
            ->where('article_id', $articleId)
            ->where('proprietaire_type', $type)
            ->where('proprietaire_id', $id)
            ->whereNull('resolue_le');

        if ($solde < 0) {
            $alerte = $ouverte->first();
            if ($alerte) {
                $alerte->update(['quantite' => $solde]);
            } else {
                AlerteStock::create([
                    'entreprise_id' => $entrepriseId,
                    'article_id' => $articleId,
                    'proprietaire_type' => $type,
                    'proprietaire_id' => $id,
                    'quantite' => $solde,
                ]);
            }
        } else {
            $ouverte->update(['resolue_le' => now()]);
        }
    }

    /**
     * Déduction automatique à la clôture d'une intervention (§5).
     * Garde anti-double-déduction via materiel_deduit.
     */
    public function deduirePose(Intervention $intervention, ?int $parCompteId = null): void
    {
        DB::transaction(function () use ($intervention, $parCompteId) {
            $locked = Intervention::withoutGlobalScopes()
                ->where('id', $intervention->id)->lockForUpdate()->first();
            if (!$locked || $locked->materiel_deduit) {
                return; // déjà déduit — renvoi réseau ou double appel
            }

            $par = $parCompteId ?? $locked->modifie_par ?? $locked->cree_par;
            $pose = $locked->materiel_pose ?? [];

            if ($pose !== []) {
                // Une seule opération trace tout le batch de déduction
                // (journal §5 + idempotence §16.2).
                $operation = Operation::create([
                    'uuid' => (string) Str::uuid(),
                    'entreprise_id' => $locked->entreprise_id,
                    'compte_id' => $par,
                    'intervention_id' => $locked->id,
                    'type' => 'deduction_pose',
                    'payload' => $pose,
                    'applique_le' => now(),
                ]);

                foreach ($pose as $articleId => $quantite) {
                    $quantite = (int) $quantite;
                    if ($quantite <= 0) {
                        continue;
                    }
                    // Le matériel quitte le stock de l'ÉQUIPE vers la fiche.
                    // vers_id = 0 : la granularité par fiche est portée par
                    // mouvements_stock.intervention_id (uuid), pas par le solde.
                    $this->mouvement(
                        (int) $articleId, 'equipe', $locked->equipe_id,
                        'intervention', 0, $quantite,
                        $par, 'pose', $operation->id, $locked->id
                    );
                }
            }

            $locked->materiel_deduit = true;
            $locked->save();
        });
    }

    /**
     * Contrôle d'intégrité (§5) : compare le journal et les soldes cache.
     * Retourne les écarts — lancé par cron quotidien + page Supervision.
     */
    public function verifierCoherence(int $entrepriseId): array
    {
        $ecarts = [];
        $lignes = Stock::withoutGlobalScopes()
            ->where('entreprise_id', $entrepriseId)->get();

        foreach ($lignes as $ligne) {
            $somme = MouvementStock::withoutGlobalScopes()
                ->where('entreprise_id', $entrepriseId)
                ->where('article_id', $ligne->article_id)
                ->where('vers_type', $ligne->proprietaire_type)
                ->where('vers_id', $ligne->proprietaire_id)
                ->sum('quantite')
                - MouvementStock::withoutGlobalScopes()
                ->where('entreprise_id', $entrepriseId)
                ->where('article_id', $ligne->article_id)
                ->where('de_type', $ligne->proprietaire_type)
                ->where('de_id', $ligne->proprietaire_id)
                ->sum('quantite');

            if ($somme != $ligne->quantite) {
                $ecarts[] = [
                    'article_id' => $ligne->article_id,
                    'proprietaire' => "{$ligne->proprietaire_type}:{$ligne->proprietaire_id}",
                    'journal' => $somme,
                    'cache' => $ligne->quantite,
                ];
            }
        }
        return $ecarts;
    }
}
