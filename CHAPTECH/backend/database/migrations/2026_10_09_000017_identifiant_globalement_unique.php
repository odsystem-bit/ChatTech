<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * L'identifiant devient unique GLOBALEMENT (toutes entreprises) : le login
 * ne demande plus le nom d'entreprise — le tenant est résolu depuis le
 * compte trouvé. Si des doublons existent déjà, renommez-les AVANT
 * d'appliquer cette migration (elle échouera sinon — volontairement).
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::table('comptes', function (Blueprint $table) {
            $table->dropUnique(['entreprise_id', 'identifiant_actif']);
            $table->unique('identifiant_actif');
        });
    }

    public function down(): void
    {
        Schema::table('comptes', function (Blueprint $table) {
            $table->dropUnique(['identifiant_actif']);
            $table->unique(['entreprise_id', 'identifiant_actif']);
        });
    }
};
