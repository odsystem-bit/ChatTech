<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;

class Erreur extends Model
{
    public $timestamps = false;

    protected $fillable = [
        'empreinte', 'source', 'fichier', 'ligne', 'message', 'stack',
        'entreprise_id', 'compte_id', 'appareil', 'version_app', 'route',
        'occurrences', 'premiere_fois', 'derniere_fois', 'resolu_le',
    ];

    protected $casts = [
        'premiere_fois' => 'datetime',
        'derniere_fois' => 'datetime',
        'resolu_le' => 'datetime',
    ];
}
