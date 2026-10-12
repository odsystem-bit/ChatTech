<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\SoftDeletes;

class Entreprise extends Model
{
    use SoftDeletes;

    protected $fillable = [
        'nom', 'etat_abonnement', 'fin_abonnement', 'limite_equipes',
        'epi_obligatoire',
    ];

    protected $casts = [
        'fin_abonnement' => 'date',
        'epi_obligatoire' => 'boolean',
    ];

    public function equipes()
    {
        return $this->hasMany(Equipe::class);
    }

    public function comptes()
    {
        return $this->hasMany(Compte::class);
    }

    public function estEnEcriture(): bool
    {
        return !in_array($this->etat_abonnement, ['lecture_seule', 'suspendu'], true);
    }
}
