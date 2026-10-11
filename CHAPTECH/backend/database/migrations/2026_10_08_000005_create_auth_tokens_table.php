<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('auth_tokens', function (Blueprint $table) {
            $table->id();
            $table->foreignId('compte_id')->constrained()->cascadeOnDelete();
            // On stocke un hash du jeton, jamais le jeton en clair (§4)
            $table->string('token_hash', 64)->unique();
            $table->string('appareil')->nullable(); // "Pixel 7 / app v3.4.1" etc.
            $table->timestamp('expires_at');
            $table->timestamp('revoked_at')->nullable();
            $table->timestamps();
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('auth_tokens');
    }
};
