<?php

namespace App\Models;

use App\Support\Tenant\TenantModel;
use Illuminate\Database\Eloquent\SoftDeletes;

class Equipe extends TenantModel
{
    use SoftDeletes;

    protected $fillable = ['entreprise_id', 'ville_id', 'nom', 'chef_compte_id', 'actif'];

    protected $casts = ['actif' => 'boolean'];

    public function ville()
    {
        return $this->belongsTo(Ville::class);
    }

    public function chef()
    {
        return $this->belongsTo(Compte::class, 'chef_compte_id');
    }

    public function comptes()
    {
        return $this->hasMany(Compte::class);
    }
}
