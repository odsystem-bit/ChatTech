<?php

namespace App\Models;

use App\Support\Tenant\TenantModel;

/**
 * Cache matérialisé du journal mouvements_stock (§5).
 * Jamais modifié directement : uniquement via StockService sous
 * transaction + SELECT ... FOR UPDATE.
 */
class Stock extends TenantModel
{
    public const CENTRAL = 0; // proprietaire_id = 0 quand type = 'central'

    protected $fillable = [
        'entreprise_id', 'article_id', 'proprietaire_type',
        'proprietaire_id', 'quantite',
    ];

    public function article()
    {
        return $this->belongsTo(Article::class);
    }
}
