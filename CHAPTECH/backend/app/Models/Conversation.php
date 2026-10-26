<?php

namespace App\Models;

use App\Support\Tenant\TenantModel;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\BelongsToMany;
use Illuminate\Database\Eloquent\Relations\HasMany;
use Illuminate\Database\Eloquent\SoftDeletes;

class Conversation extends TenantModel
{
    use SoftDeletes;

    protected $fillable = [
        'entreprise_id',
        'type',
        'titre',
        'equipe_id',
        'ville_id',
        'cree_par',
        'dernier_message_id',
        'dernier_message_at',
    ];

    protected $casts = [
        'dernier_message_at' => 'datetime',
    ];

    public function membres(): HasMany
    {
        return $this->hasMany(ConversationMembre::class);
    }

    public function membresVisibles(): HasMany
    {
        return $this->hasMany(ConversationMembre::class)->where('est_cache', false);
    }

    public function comptes(): BelongsToMany
    {
        return $this->belongsToMany(Compte::class, 'conversation_membres')
            ->withPivot('est_cache', 'dernier_lu_message_id', 'dernier_lu_at')
            ->withTimestamps();
    }

    public function messages(): HasMany
    {
        return $this->hasMany(Message::class)->orderBy('created_at', 'asc');
    }

    public function equipe(): BelongsTo
    {
        return $this->belongsTo(Equipe::class);
    }

    public function ville(): BelongsTo
    {
        return $this->belongsTo(Ville::class);
    }

    public function creePar(): BelongsTo
    {
        return $this->belongsTo(Compte::class, 'cree_par');
    }
}
