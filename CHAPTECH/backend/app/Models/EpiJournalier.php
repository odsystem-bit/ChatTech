<?php

namespace App\Models;

use App\Support\Tenant\TenantModel;

class EpiJournalier extends TenantModel
{
    protected $table = 'epi_journaliers';

    protected $fillable = [
        'entreprise_id', 'equipe_id', 'date', 'envoye_par', 'fichier',
        'prise_le', 'envoye_le', 'statut', 'motif', 'decide_par', 'decide_le',
    ];

    protected $casts = [
        'date' => 'date:Y-m-d',
        'prise_le' => 'datetime',
        'envoye_le' => 'datetime',
        'decide_le' => 'datetime',
    ];
}
