<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        // Journal interne type Sentry (§14) : une ligne par erreur distincte
        // (empreinte), les occurrences identiques incrémentent le compteur.
        Schema::create('erreurs', function (Blueprint $table) {
            $table->id();
            $table->string('empreinte', 64); // hash fichier+ligne+message — unique en bas
            $table->string('source', 10);             // api|web|mobile
            $table->string('fichier')->nullable();
            $table->unsignedInteger('ligne')->nullable();
            $table->text('message');
            $table->longText('stack')->nullable();
            $table->foreignId('entreprise_id')->nullable()->constrained()->nullOnDelete();
            $table->foreignId('compte_id')->nullable()->constrained()->nullOnDelete();
            $table->string('appareil')->nullable();
            $table->string('version_app')->nullable();
            $table->string('route')->nullable();
            $table->unsignedInteger('occurrences')->default(1);
            $table->timestamp('premiere_fois')->useCurrent();
            $table->timestamp('derniere_fois')->useCurrent();
            $table->timestamp('resolu_le')->nullable();

            $table->unique('empreinte');
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('erreurs');
    }
};
