<?php

namespace App\Models;

use App\Support\Tenant\TenantModel;
use Illuminate\Database\Eloquent\SoftDeletes;

class Photo extends TenantModel
{
    use SoftDeletes;

    public $incrementing = false;
    protected $keyType = 'string';

    protected $fillable = [
        'id', 'entreprise_id', 'intervention_id', 'ajoute_par', 'type',
        'fichier', 'nom', 'lat', 'lng', 'precision_m', 'horodatage', 'taille_octets',
    ];

    protected $casts = ['horodatage' => 'datetime'];

    public function intervention()
    {
        return $this->belongsTo(Intervention::class);
    }
}
