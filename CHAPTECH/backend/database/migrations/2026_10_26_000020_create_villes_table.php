<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        // Table des villes par entreprise (§2, §3 PLAN.md)
        Schema::create('villes', function (Blueprint $table) {
            $table->id();
            $table->foreignId('entreprise_id')->constrained()->cascadeOnDelete();
            $table->string('nom');
            $table->string('code', 10)->nullable(); // COT, PN, PAR...
            $table->boolean('actif')->default(true);
            $table->timestamps();
            $table->softDeletes();

            $table->unique(['entreprise_id', 'nom']);
            $table->unique(['entreprise_id', 'id']);
        });

        // Rattachement optionnel d'une équipe à une ville
        Schema::table('equipes', function (Blueprint $table) {
            $table->unsignedBigInteger('ville_id')->nullable()->after('entreprise_id');
            $table->foreign(['entreprise_id', 'ville_id'])
                ->references(['entreprise_id', 'id'])->on('villes')
                ->nullOnDelete();
        });

        // Rattachement d'un compte à une ville (si null: compte "de base" agissant sur toutes les villes)
        Schema::table('comptes', function (Blueprint $table) {
            $table->unsignedBigInteger('ville_id')->nullable()->after('entreprise_id');
            $table->foreign(['entreprise_id', 'ville_id'])
                ->references(['entreprise_id', 'id'])->on('villes')
                ->nullOnDelete();
        });
    }

    public function down(): void
    {
        Schema::table('comptes', function (Blueprint $table) {
            $table->dropForeign(['entreprise_id', 'ville_id']);
            $table->dropColumn('ville_id');
        });

        Schema::table('equipes', function (Blueprint $table) {
            $table->dropForeign(['entreprise_id', 'ville_id']);
            $table->dropColumn('ville_id');
        });

        Schema::dropIfExists('villes');
    }
};
