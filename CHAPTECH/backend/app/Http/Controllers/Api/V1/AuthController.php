<?php

namespace App\Http\Controllers\Api\V1;

use App\Http\Controllers\Controller;
use App\Models\AuditLog;
use App\Models\AuthToken;
use App\Models\Compte;
use Illuminate\Http\Request;
use Illuminate\Support\Str;

class AuthController extends Controller
{
    /**
     * POST /api/v1/auth/login — identifiant + mot de passe (§4).
     * L'identifiant est unique globalement : le tenant est résolu depuis
     * le compte, sans demander le nom d'entreprise à l'utilisateur.
     * Renvoie un jeton longue durée (90 j glissants), stocké haché.
     */
    public function login(Request $request)
    {
        $request->validate([
            'identifiant' => 'required|string',
            'password' => 'required|string',
        ]);

        $compte = Compte::withoutGlobalScopes()
            ->where('identifiant', $request->identifiant)
            ->where('role', '!=', 'super_admin') // la plateforme a son propre portail
            ->where('actif', true)
            ->first();

        if (!$compte || !password_verify($request->password, $compte->password_hash)) {
            AuditLog::ecrire('login_refuse', 'compte', $compte?->id, [
                'identifiant' => $request->identifiant,
            ], $compte?->entreprise_id);
            // TODO: limitation anti-force-brute (§4) — throttle middleware
            return response()->json(['error' => 'Identifiants invalides'], 401);
        }

        return $this->emettreJeton($request, $compte);
    }

    /**
     * POST /api/v1/auth/plateforme/login — portail super-admin (§17.3).
     * Pas de champ entreprise : les super_admin n'appartiennent à
     * aucun tenant (entreprise_id NULL, cf. migration 000016).
     */
    public function loginPlateforme(Request $request)
    {
        $request->validate([
            'identifiant' => 'required|string',
            'password' => 'required|string',
        ]);

        $compte = Compte::withoutGlobalScopes()
            ->where('role', 'super_admin')
            ->where('identifiant', $request->identifiant)
            ->where('actif', true)
            ->first();

        if (!$compte || !password_verify($request->password, $compte->password_hash)) {
            AuditLog::ecrire('login_plateforme_refuse', 'compte', $compte?->id, [
                'identifiant' => $request->identifiant,
            ], $compte?->entreprise_id);
            return response()->json(['error' => 'Identifiants invalides'], 401);
        }

        return $this->emettreJeton($request, $compte);
    }

    /**
     * Jeton longue durée (90 j glissants, haché en base) + audit + réponse.
     */
    private function emettreJeton(Request $request, Compte $compte)
    {
        $plain = Str::random(64);
        AuthToken::create([
            'compte_id' => $compte->id,
            'token_hash' => hash('sha256', $plain),
            'appareil' => $request->header('User-Agent'),
            'expires_at' => now()->addDays(90),
        ]);

        AuditLog::ecrire('login', 'compte', $compte->id,
            ['appareil' => $request->header('User-Agent')], $compte->entreprise_id);

        return response()->json([
            'token' => $plain,
            'compte' => [
                'id' => $compte->id,
                'nom' => $compte->nom,
                'role' => $compte->role,
                'equipe_id' => $compte->equipe_id,
                'entreprise_id' => $compte->entreprise_id,
            ],
        ]);
    }

    public function logout(Request $request)
    {
        $token = $request->bearerToken();
        AuthToken::where('token_hash', hash('sha256', $token))
            ->update(['revoked_at' => now()]);
        return response()->json(['ok' => true]);
    }
}
