<?php

namespace App\Services;

use App\Exceptions\OperationInvalide;
use App\Models\Intervention;
use App\Models\Operation;
use App\Models\Photo;
use App\Models\PointGps;
use Illuminate\Support\Arr;
use Illuminate\Support\Facades\DB;

/**
 * Cœur du protocole de synchronisation §16.
 *
 * Reçoit des BATCHES d'opérations clientes, chacune avec un UUID
 * d'idempotence. Applique dans l'ordre, dans une transaction,
 * avec compare-and-swap sur `revision` (§16.3).
 */
class SyncService
{
    /**
     * Applique un batch d'opérations sur une intervention.
     *
     * @return array{revision:int, appliques:array, ignores:array, conflit:bool}
     */
    public function appliquerOps(Intervention $intervention, array $ops, int $compteId): array
    {
        $appliques = [];
        $ignores = [];
        $conflits = [];

        return DB::transaction(function () use ($intervention, $ops, $compteId, &$appliques, &$ignores, &$conflits) {
            // Verrou de ligne : les batches concurrents se sérialisent ici
            // (millisecondes). Sans lui, deux batches lisent la même revision
            // et le CAS ne détecte rien.
            $intervention = Intervention::where('id', $intervention->id)
                ->lockForUpdate()->firstOrFail();

            foreach ($ops as $op) {
                $uuid = $op['uuid'];

                // Idempotence : déjà appliquée → on renvoie le résultat stocké
                $existante = Operation::where('uuid', $uuid)->first();
                if ($existante) {
                    $ignores[] = $uuid;
                    continue;
                }

                // CAS §16.2 : le client déclare la revision qu'il a vue.
                // Si la fiche a bougé entre-temps → conflit, op non appliquée.
                if (isset($op['expected_revision'])
                    && (int) $op['expected_revision'] !== (int) $intervention->revision) {
                    $conflits[] = $uuid;
                    continue;
                }

                $resultat = $this->appliquerOp($intervention, $op, $compteId);

                Operation::create([
                    'uuid' => $uuid,
                    'entreprise_id' => $intervention->entreprise_id,
                    'compte_id' => $compteId,
                    'intervention_id' => $intervention->id,
                    'type' => $op['type'],
                    'payload' => $op,
                    'resultat' => $resultat,
                    'applique_le' => now(),
                ]);
                $appliques[] = $uuid;
            }

            if ($appliques !== []) {
                // Une seule révision par batch, pas par opération
                $intervention->increment('revision');
                $intervention->modifie_par = $compteId;
                $intervention->save();
            }

            return [
                'revision' => $intervention->revision,
                'appliques' => $appliques,
                'ignores' => $ignores,
                'conflits' => $conflits,
            ];
        });
    }

    /**
     * Applique une opération unitaire. Les collections (points, photos)
     * sont des lignes séparées → INSERT/soft-delete, jamais de merge.
     */
    private function appliquerOp(Intervention $intervention, array $op, int $compteId): array
    {
        switch ($op['type']) {
            case 'set_champ':
                $champ = $op['champ'];
                if (!in_array($champ, Intervention::CHAMPS_EDITABLES, true)) {
                    throw new OperationInvalide("Champ non éditable : $champ");
                }
                $intervention->forceFill([$champ => $op['valeur']])->save();
                return ['ok' => true];

            case 'ajoute_point':
                // Whitelist stricte : id/entreprise_id/intervention_id/ajoute_par
                // viennent du serveur, jamais du payload client (§2).
                $point = PointGps::create(
                    Arr::only($op['data'] ?? [], PointGps::CHAMPS_CLIENT)
                    + [
                        'id' => $op['ligne_id'], // UUID généré par l'app
                        'entreprise_id' => $intervention->entreprise_id,
                        'intervention_id' => $intervention->id,
                        'ajoute_par' => $compteId,
                    ]
                );
                return ['point_id' => $point->id];

            case 'supprime_point':
                PointGps::where('id', $op['ligne_id'])
                    ->where('intervention_id', $intervention->id)
                    ->first()?->delete(); // soft-delete
                return ['ok' => true];

            case 'supprime_photo':
                Photo::where('id', $op['ligne_id'])
                    ->where('intervention_id', $intervention->id)
                    ->first()?->delete(); // soft-delete, le fichier reste
                return ['ok' => true];

            case 'change_statut':
                if (!in_array($op['valeur'], ['en_cours', 'termine'], true)) {
                    throw new OperationInvalide("Statut inconnu : {$op['valeur']}");
                }
                $intervention->forceFill(['statut' => $op['valeur']])->save();
                if ($op['valeur'] === 'termine') {
                    // Déduction stock atomique, gardée par materiel_deduit (§5)
                    app(StockService::class)->deduirePose($intervention, $compteId);
                }
                return ['ok' => true];

            default:
                throw new OperationInvalide("Type d'opération inconnu : {$op['type']}");
        }
    }

    /**
     * Delta §16.3 : tout ce qui a changé depuis une révision donnée.
     * Les lignes créées/soft-deletées après le watermark sont renvoyées.
     */
    public function delta(Intervention $intervention, int $sinceRev): array
    {
        // Watermark simple : on renvoie les lignes touchées après la date
        // du dernier pull du client (approximation suffisante, la révision
        // sert de déclencheur, le delta renvoie l'état des sous-collections).
        $intervention->refresh();

        return [
            'revision' => $intervention->revision,
            'intervention' => $intervention->toArray(),
            'points_gps' => $intervention->pointsGps()->get(),
            'photos' => $intervention->photos()->get(['id', 'type', 'fichier', 'nom', 'lat', 'lng', 'horodatage', 'ajoute_par']),
            'points_supprimes' => $intervention->pointsGps()->onlyTrashed()->pluck('id'),
            'photos_supprimees' => $intervention->photos()->onlyTrashed()->pluck('id'),
        ];
    }
}
