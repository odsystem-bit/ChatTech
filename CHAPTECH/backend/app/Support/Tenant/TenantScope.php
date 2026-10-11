<?php

namespace App\Support\Tenant;

use Illuminate\Database\Eloquent\Builder;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Scope;

/**
 * Global scope tenant (§2) : toute requête sur un modèle scopé ajoute
 * automatiquement `entreprise_id = <entreprise du jeton>`.
 * Il est impossible d'oublier le filtre — un SELECT sans tenant n'existe pas.
 *
 * Pour les routes super-admin cross-entreprise, utiliser
 * `->withoutGlobalScope(TenantScope::class)` explicitement et uniquement
 * dans du code super-admin.
 */
class TenantScope implements Scope
{
    public function apply(Builder $builder, Model $model): void
    {
        $entrepriseId = Tenant::entrepriseId();
        if ($entrepriseId !== null) {
            $builder->where($model->qualifyColumn('entreprise_id'), $entrepriseId);
        }
        // Si pas de tenant résolu (ex: commande artisan), on ne filtre pas —
        // mais un accès HTTP sans tenant est bloqué par TenantMiddleware avant.
    }
}
