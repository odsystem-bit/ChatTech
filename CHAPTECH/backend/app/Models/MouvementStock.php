<?php

namespace App\Models;

use App\Support\Tenant\TenantModel;

/**
 * Journal immuable §5 : insert-only.
 * Les timestamps : created_at seul, pas d'updated_at (on ne modifie jamais).
 */
class MouvementStock extends TenantModel
{
    public const UPDATED_AT = null;

    protected $table = 'mouvements_stock';

    protected $fillable = [
        'entreprise_id', 'article_id',
        'de_type', 'de_id', 'vers_type', 'vers_id',
        'quantite', 'motif', 'par', 'intervention_id', 'operation_id',
    ];

    public function article()
    {
        return $this->belongsTo(Article::class);
    }
}
