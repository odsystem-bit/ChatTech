<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        // Dépendance circulaire résolue : equipes.chef_compte_id -> comptes.id
        // ajoutée seulement une fois `comptes` créée. On reste sur une FK simple
        // (le tenant check passe par les Policies + TenantScope).
        Schema::table('equipes', function (Blueprint $table) {
            $table->foreign('chef_compte_id')
                ->references('id')->on('comptes')->nullOnDelete();
        });
    }

    public function down(): void
    {
        Schema::table('equipes', function (Blueprint $table) {
            $table->dropForeign(['chef_compte_id']);
        });
    }
};
