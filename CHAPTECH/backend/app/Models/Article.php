<?php

namespace App\Models;

use App\Support\Tenant\TenantModel;
use Illuminate\Database\Eloquent\SoftDeletes;

class Article extends TenantModel
{
    use SoftDeletes;

    protected $fillable = ['entreprise_id', 'code', 'libelle', 'unite'];
}
