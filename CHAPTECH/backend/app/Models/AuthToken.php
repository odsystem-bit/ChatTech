<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;

class AuthToken extends Model
{
    protected $fillable = [
        'compte_id', 'token_hash', 'appareil', 'expires_at', 'revoked_at',
    ];

    protected $casts = [
        'expires_at' => 'datetime',
        'revoked_at' => 'datetime',
    ];

    public function compte()
    {
        return $this->belongsTo(Compte::class);
    }

    public function estValide(): bool
    {
        return $this->revoked_at === null && $this->expires_at->isFuture();
    }
}
