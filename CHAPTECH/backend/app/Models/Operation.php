<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;

/**
 * Journal d'idempotence §16.2 : un uuid client = une seule application.
 * `resultat` stocke la réponse de la première application pour les renvois.
 */
class Operation extends Model
{
    protected $fillable = [
        'uuid', 'entreprise_id', 'compte_id', 'intervention_id',
        'type', 'payload', 'resultat', 'applique_le',
    ];

    protected $casts = [
        'payload' => 'array',
        'resultat' => 'array',
        'applique_le' => 'datetime',
    ];

    public function intervention()
    {
        return $this->belongsTo(Intervention::class);
    }
}
