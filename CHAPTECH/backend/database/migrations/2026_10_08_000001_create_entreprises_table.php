<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('entreprises', function (Blueprint $table) {
            $table->id();
            $table->string('nom');
            $table->string('etat_abonnement', 20)->default('essai'); // essai|actif|grace|lecture_seule|suspendu
            $table->date('fin_abonnement')->nullable();
            $table->unsignedSmallInteger('limite_equipes')->default(5);
            $table->timestamps();
            $table->softDeletes(); // suppression douce (§11)

            // Le login résout l'entreprise par son NOM : il doit être unique
            // sinon deux homonymes + même identifiant = mauvais tenant.
            // Colonne générée : NULL quand soft-deletée → la recréation
            // du même nom reste possible (unique ignore les NULL).
            $table->string('nom_actif')
                ->storedAs('IF(deleted_at IS NULL, nom, NULL)');
            $table->unique('nom_actif');
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('entreprises');
    }
};
