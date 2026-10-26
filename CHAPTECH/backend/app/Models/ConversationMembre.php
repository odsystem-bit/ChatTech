<?php

namespace App\Models;

use App\Support\Tenant\TenantModel;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

class ConversationMembre extends TenantModel
{
    protected $fillable = [
        'entreprise_id',
        'conversation_id',
        'compte_id',
        'est_cache',
        'dernier_lu_message_id',
        'dernier_lu_at',
    ];

    protected $casts = [
        'est_cache' => 'boolean',
        'dernier_lu_at' => 'datetime',
    ];

    public function conversation(): BelongsTo
    {
        return $this->belongsTo(Conversation::class);
    }

    public function compte(): BelongsTo
    {
        return $this->belongsTo(Compte::class);
    }
}
