<?php

namespace App\Models;

use App\Support\Tenant\TenantModel;

class AlerteStock extends TenantModel
{
    protected $table = 'alertes_stock';

    protected $fillable = [
        'entreprise_id', 'article_id', 'proprietaire_type',
        'proprietaire_id', 'quantite', 'resolue_le',
    ];

    protected $casts = ['resolue_le' => 'datetime'];

    public function article()
    {
        return $this->belongsTo(Article::class)->withTrashed();
    }
}
