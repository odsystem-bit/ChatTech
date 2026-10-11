<?php

namespace App\Models;

use App\Support\Tenant\TenantModel;
use Illuminate\Database\Eloquent\SoftDeletes;

class PointGps extends TenantModel
{
    use SoftDeletes;

    protected $table = 'points_gps';
    public $incrementing = false;
    protected $keyType = 'string';

    /**
     * Champs qu'un client peut fournir dans op['data'] (ajoute_point).
     * id/entreprise_id/intervention_id/ajoute_par sont posés par le
     * serveur — jamais depuis le payload (anti-injection tenant, §2).
     */
    public const CHAMPS_CLIENT = [
        'type', 'sous_type', 'proprietaire', 'numero',
        'lat', 'lng', 'precision_m', 'horodatage', 'photo_id',
    ];

    protected $fillable = [
        'id', 'entreprise_id', 'intervention_id', 'ajoute_par',
        'type', 'sous_type', 'proprietaire', 'numero',
        'lat', 'lng', 'precision_m', 'horodatage', 'photo_id',
    ];

    protected $casts = ['horodatage' => 'datetime'];

    public function intervention()
    {
        return $this->belongsTo(Intervention::class);
    }

    public function photo()
    {
        return $this->belongsTo(Photo::class);
    }
}
