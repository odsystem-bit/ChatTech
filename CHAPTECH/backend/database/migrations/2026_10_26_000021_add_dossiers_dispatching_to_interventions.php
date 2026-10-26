<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::table('interventions', function (Blueprint $table) {
            // Un dossier créé par le coordonnateur n'a pas encore d'équipe (§6 bis)
            $table->unsignedBigInteger('equipe_id')->nullable()->change();

            // Ville à laquelle appartient le dossier
            $table->unsignedBigInteger('ville_id')->nullable()->after('entreprise_id');

            // Statut du cycle de distribution (§6 bis) :
            // a_dispatcher (coordonnateur) -> dispatche (superviseur) -> en_cours -> termine / non_traite
            $table->string('statut_distribution', 20)->default('a_dispatcher')->after('statut');

            // Date du dossier (permet la clôture journalière et la bascule en date antérieure)
            $table->date('date_dossier')->nullable()->after('date');

            // Traçabilité du dispatching
            $table->unsignedBigInteger('dispatche_par')->nullable()->after('motif_non_traite');
            $table->dateTime('dispatche_le')->nullable()->after('dispatche_par');

            // Motif en cas de non traitement
            $table->text('motif_non_traite')->nullable()->after('notes');

            // Clés étrangères composites anti-fuite (§2.3)
            $table->foreign(['entreprise_id', 'ville_id'])
                ->references(['entreprise_id', 'id'])->on('villes')
                ->nullOnDelete();

            $table->foreign(['entreprise_id', 'dispatche_par'])
                ->references(['entreprise_id', 'id'])->on('comptes')
                ->nullOnDelete();

            // Index de filtrage rapide du dispatching journalier
            $table->index(['entreprise_id', 'date_dossier', 'statut_distribution'], 'idx_interventions_dispatch_date');
            $table->index(['entreprise_id', 'ville_id', 'statut_distribution'], 'idx_interventions_dispatch_ville');
        });
    }

    public function down(): void
    {
        Schema::table('interventions', function (Blueprint $table) {
            $table->dropForeign(['entreprise_id', 'ville_id']);
            $table->dropForeign(['entreprise_id', 'dispatche_par']);
            $table->dropIndex('idx_interventions_dispatch_date');
            $table->dropIndex('idx_interventions_dispatch_ville');

            $table->dropColumn([
                'ville_id',
                'statut_distribution',
                'date_dossier',
                'motif_non_traite',
                'dispatche_par',
                'dispatche_le',
            ]);
        });
    }
};
