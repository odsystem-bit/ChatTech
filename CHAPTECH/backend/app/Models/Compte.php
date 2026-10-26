<?php

namespace App\Models;

use App\Support\Tenant\TenantModel;
use Illuminate\Database\Eloquent\SoftDeletes;

class Compte extends TenantModel
{
    use SoftDeletes;

    public const ROLES = [
        'super_admin', 'admin', 'coordonnateur', 'superviseur',
        'gestionnaire', 'conformite', 'chef', 'technicien',
    ];

    protected $fillable = [
        'entreprise_id', 'ville_id', 'equipe_id', 'identifiant', 'nom',
        'password_hash', 'role', 'actif',
    ];

    protected $hidden = ['password_hash'];

    protected $casts = ['actif' => 'boolean'];

    public function ville()
    {
        return $this->belongsTo(Ville::class);
    }

    public function isDeBase(): bool
    {
        return empty($this->ville_id);
    }

    public function isDeVille(): bool
    {
        return !empty($this->ville_id);
    }

    public function peutAgirSurVille(?int $villeId): bool
    {
        if ($this->isDeBase() || in_array($this->role, ['super_admin', 'admin'], true)) {
            return true;
        }
        return (int) $this->ville_id === (int) $villeId;
    }

    public function equipe()
    {
        return $this->belongsTo(Equipe::class);
    }

    public function entreprise()
    {
        return $this->belongsTo(Entreprise::class);
    }

    public function tokens()
    {
        return $this->hasMany(AuthToken::class);
    }
}
