<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * Les super_admin n'appartiennent à AUCUN tenant — deux mondes séparés :
 * login tenant (entreprise+identifiant+mdp) vs login plateforme
 * (identifiant+mdp). Sans ça un compte plateforme rattaché à une
 * entreprise réelle apparaîtrait dans sa liste de comptes (fuite §2).
 *
 * FK composite (entreprise_id, equipe_id) : une FK MySQL contenant NULL
 * n'est pas vérifiée → pas de problème. L'index unique
 * (entreprise_id, identifiant_actif) tolère les doublons NULL →
 * l'unicité des identifiants super_admin relève du code.
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::table('comptes', function (Blueprint $table) {
            $table->foreignId('entreprise_id')->nullable()->change();
        });
    }

    public function down(): void
    {
        Schema::table('comptes', function (Blueprint $table) {
            $table->foreignId('entreprise_id')->nullable(false)->change();
        });
    }
};
