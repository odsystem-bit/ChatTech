<?php

namespace App\Models;

use App\Support\Tenant\TenantModel;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\SoftDeletes;

class Message extends TenantModel
{
    use SoftDeletes;

    protected $fillable = [
        'entreprise_id',
        'conversation_id',
        'auteur_id',
        'contenu',
        'photo_url',
        'photo_nom',
        'supprime_par',
    ];

    public function conversation(): BelongsTo
    {
        return $this->belongsTo(Conversation::class);
    }

    public function auteur(): BelongsTo
    {
        return $this->belongsTo(Compte::class, 'auteur_id');
    }

    public function supprimePar(): BelongsTo
    {
        return $this->belongsTo(Compte::class, 'supprime_par');
    }
}
