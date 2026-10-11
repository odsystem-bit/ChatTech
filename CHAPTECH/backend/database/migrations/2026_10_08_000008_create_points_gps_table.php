<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('points_gps', function (Blueprint $table) {
            $table->uuid('id')->primary(); // généré par l'app — anti-doublon
            $table->foreignId('entreprise_id')->constrained()->cascadeOnDelete();
            $table->uuid('intervention_id');
            $table->unsignedBigInteger('ajoute_par');
            $table->string('type', 30)->nullable();       // Poteau|FAT|Abonné|Autre
            $table->string('sous_type', 30)->nullable();  // Traversé|Armé|Implanté
            $table->string('proprietaire', 30)->nullable(); // SBEE|Petit Jean
            $table->string('numero')->nullable();
            $table->double('lat');
            $table->double('lng');
            $table->double('precision_m')->nullable();
            $table->dateTime('horodatage');
            // Lien vers la photo embarquée (une ligne photos, pas du base64)
            $table->uuid('photo_id')->nullable();
            $table->timestamps();
            $table->softDeletes();

            $table->foreign(['entreprise_id', 'intervention_id'])
                ->references(['entreprise_id', 'id'])->on('interventions')
                ->cascadeOnDelete();
            // SET NULL impossible ici : il mettrait entreprise_id à NULL.
            // RESTRICT suffit — les photos sont soft-deleted, la FK ne
            // se déclenche jamais en pratique.
            $table->foreign(['entreprise_id', 'photo_id'])
                ->references(['entreprise_id', 'id'])->on('photos')
                ->restrictOnDelete();
            $table->foreign(['entreprise_id', 'ajoute_par'])
                ->references(['entreprise_id', 'id'])->on('comptes');
            $table->index(['entreprise_id', 'intervention_id']);
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('points_gps');
    }
};
