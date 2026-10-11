<?php

namespace App\Support\Tenant;

use Illuminate\Database\Eloquent\Model;

/**
 * Classe de base pour tous les modèles métier : applique le TenantScope
 * et remplit automatiquement entreprise_id à la création.
 */
abstract class TenantModel extends Model
{
    protected static function booted(): void
    {
        static::addGlobalScope(new TenantScope());

        static::creating(function (TenantModel $model) {
            if (empty($model->entreprise_id) && Tenant::entrepriseId() !== null) {
                $model->entreprise_id = Tenant::entrepriseId();
            }
        });
    }
}
