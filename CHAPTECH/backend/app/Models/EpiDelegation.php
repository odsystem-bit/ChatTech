<?php

namespace App\Models;

use App\Support\Tenant\TenantModel;

class EpiDelegation extends TenantModel
{
    protected $table = 'epi_delegations';

    protected $fillable = ['entreprise_id', 'equipe_id', 'compte_id', 'date', 'accorde_par'];

    protected $casts = ['date' => 'date:Y-m-d'];
}
