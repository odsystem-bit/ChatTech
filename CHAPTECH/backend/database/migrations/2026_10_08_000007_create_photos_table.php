<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('photos', function (Blueprint $table) {
            $table->uuid('id')->primary(); // généré par l'app
            $table->foreignId('entreprise_id')->constrained()->cascadeOnDelete();
            $table->uuid('intervention_id');
            $table->unsignedBigInteger('ajoute_par');
            $table->string('type', 10); // gps|terrain|fiche|video|signature
            $table->string('fichier'); // chemin relatif uploads/{e}/{i}/....
            $table->string('nom')->nullable();
            $table->double('lat')->nullable();
            $table->double('lng')->nullable();
            $table->double('precision_m')->nullable();
            $table->dateTime('horodatage')->nullable();
            $table->unsignedInteger('taille_octets')->nullable();
            $table->timestamps();
            $table->softDeletes();

            // FK composites (§2.3) : impossible de rattacher une photo
            // à une intervention ou un compte d'un autre tenant.
            $table->foreign(['entreprise_id', 'intervention_id'])
                ->references(['entreprise_id', 'id'])->on('interventions')
                ->cascadeOnDelete();
            $table->foreign(['entreprise_id', 'ajoute_par'])
                ->references(['entreprise_id', 'id'])->on('comptes');
            // Cible de la FK composite points_gps.photo_id
            $table->unique(['entreprise_id', 'id']);
            $table->index(['entreprise_id', 'intervention_id']);
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('photos');
    }
};
