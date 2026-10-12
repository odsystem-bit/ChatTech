<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        // Par défaut l'EPI n'est pas exigé : on n'impose rien aux entreprises
        // existantes tant que le super-admin ne l'active pas.
        Schema::table('entreprises', function (Blueprint $table) {
            $table->boolean('epi_obligatoire')->default(false);
        });

        // Photo EPI du matin : une ligne par équipe et par jour (heure locale).
        Schema::create('epi_journaliers', function (Blueprint $table) {
            $table->id();
            $table->foreignId('entreprise_id')->constrained()->cascadeOnDelete();
            $table->unsignedBigInteger('equipe_id');
            $table->date('date');
            $table->unsignedBigInteger('envoye_par');
            $table->string('fichier');
            $table->timestamp('prise_le')->nullable(); // heure déclarée par l'APK (file locale hors réseau)
            $table->timestamp('envoye_le');            // heure serveur : sert au délai de 30 min
            $table->string('statut', 12)->default('en_attente'); // en_attente|valide|rejete
            $table->string('motif')->nullable();       // obligatoire si rejete
            $table->unsignedBigInteger('decide_par')->nullable();
            $table->timestamp('decide_le')->nullable();
            $table->timestamps();

            $table->unique(['equipe_id', 'date']);
            $table->index(['entreprise_id', 'date']);
            $table->foreign(['entreprise_id', 'equipe_id'])
                ->references(['entreprise_id', 'id'])->on('equipes');
        });

        // Droit d'envoi de la photo donné à un technicien pour un jour
        // (chef absent : admin, conformité, ou le chef lui-même en prévenant).
        Schema::create('epi_delegations', function (Blueprint $table) {
            $table->id();
            $table->foreignId('entreprise_id')->constrained()->cascadeOnDelete();
            $table->unsignedBigInteger('equipe_id');
            $table->unsignedBigInteger('compte_id'); // le technicien autorisé
            $table->date('date');
            $table->unsignedBigInteger('accorde_par');
            $table->timestamps();

            $table->unique(['equipe_id', 'date', 'compte_id']);
            $table->foreign(['entreprise_id', 'equipe_id'])
                ->references(['entreprise_id', 'id'])->on('equipes');
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('epi_delegations');
        Schema::dropIfExists('epi_journaliers');
        Schema::table('entreprises', function (Blueprint $table) {
            $table->dropColumn('epi_obligatoire');
        });
    }
};
