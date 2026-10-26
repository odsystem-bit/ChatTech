<?php

namespace App\Models;

use App\Support\Tenant\TenantModel;
use Illuminate\Database\Eloquent\Relations\HasMany;
use Illuminate\Database\Eloquent\SoftDeletes;

class Ville extends TenantModel
{
    use SoftDeletes;

    protected $fillable = [
        'entreprise_id',
        'nom',
        'code',
        'actif',
    ];

    protected $casts = [
        'actif' => 'boolean',
    ];

    public function equipes(): HasMany
    {
        return $this->hasMany(Equipe::class);
    }

    public function comptes(): HasMany
    {
        return $this->hasMany(Compte::class);
    }

    public function interventions(): HasMany
    {
        return $this->hasMany(Intervention::class);
    }
}
