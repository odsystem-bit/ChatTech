<?php

namespace App\Models;

use App\Support\Tenant\TenantModel;
use Illuminate\Database\Eloquent\SoftDeletes;

class Compte extends TenantModel
{
    use SoftDeletes;

    public const ROLES = ['super_admin', 'admin', 'gestionnaire', 'conformite', 'chef', 'technicien'];

    protected $fillable = [
        'entreprise_id', 'equipe_id', 'identifiant', 'nom',
        'password_hash', 'role', 'actif',
    ];

    protected $hidden = ['password_hash'];

    protected $casts = ['actif' => 'boolean'];

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
