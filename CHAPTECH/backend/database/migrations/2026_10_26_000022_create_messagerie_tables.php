<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        // 1. Conversations (salons d'équipe, de ville, général, ou privé 1-à-1) §6 ter
        Schema::create('conversations', function (Blueprint $table) {
            $table->id();
            $table->foreignId('entreprise_id')->constrained()->cascadeOnDelete();
            $table->string('type', 20); // direct | equipe | ville | entreprise
            $table->string('titre')->nullable();
            $table->unsignedBigInteger('equipe_id')->nullable();
            $table->unsignedBigInteger('ville_id')->nullable();
            $table->unsignedBigInteger('cree_par')->nullable();
            $table->unsignedBigInteger('dernier_message_id')->nullable();
            $table->dateTime('dernier_message_at')->nullable();
            $table->timestamps();
            $table->softDeletes();

            $table->unique(['entreprise_id', 'id']);
            $table->foreign(['entreprise_id', 'equipe_id'])
                ->references(['entreprise_id', 'id'])->on('equipes')
                ->nullOnDelete();
            $table->foreign(['entreprise_id', 'ville_id'])
                ->references(['entreprise_id', 'id'])->on('villes')
                ->nullOnDelete();
            $table->foreign(['entreprise_id', 'cree_par'])
                ->references(['entreprise_id', 'id'])->on('comptes')
                ->nullOnDelete();
        });

        // 2. Membres d'une conversation (super-admin invisible grâce à est_cache §6 ter)
        Schema::create('conversation_membres', function (Blueprint $table) {
            $table->id();
            $table->foreignId('entreprise_id')->constrained()->cascadeOnDelete();
            $table->unsignedBigInteger('conversation_id');
            $table->unsignedBigInteger('compte_id');
            $table->boolean('est_cache')->default(false); // super-admin invisible
            $table->unsignedBigInteger('dernier_lu_message_id')->nullable();
            $table->dateTime('dernier_lu_at')->nullable();
            $table->timestamps();

            $table->unique(['conversation_id', 'compte_id']);
            $table->foreign(['entreprise_id', 'conversation_id'])
                ->references(['entreprise_id', 'id'])->on('conversations')
                ->cascadeOnDelete();
            $table->foreign(['entreprise_id', 'compte_id'])
                ->references(['entreprise_id', 'id'])->on('comptes')
                ->cascadeOnDelete();
        });

        // 3. Messages avec texte et photos jointes
        Schema::create('messages', function (Blueprint $table) {
            $table->id();
            $table->foreignId('entreprise_id')->constrained()->cascadeOnDelete();
            $table->unsignedBigInteger('conversation_id');
            $table->unsignedBigInteger('auteur_id');
            $table->text('contenu')->nullable();
            $table->string('photo_url')->nullable();
            $table->string('photo_nom')->nullable();
            $table->unsignedBigInteger('supprime_par')->nullable();
            $table->timestamps();
            $table->softDeletes();

            $table->index(['conversation_id', 'created_at']);
            $table->foreign(['entreprise_id', 'conversation_id'])
                ->references(['entreprise_id', 'id'])->on('conversations')
                ->cascadeOnDelete();
            $table->foreign(['entreprise_id', 'auteur_id'])
                ->references(['entreprise_id', 'id'])->on('comptes')
                ->cascadeOnDelete();
            $table->foreign(['entreprise_id', 'supprime_par'])
                ->references(['entreprise_id', 'id'])->on('comptes')
                ->nullOnDelete();
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('messages');
        Schema::dropIfExists('conversation_membres');
        Schema::dropIfExists('conversations');
    }
};
