<?php

namespace App\Http\Controllers\Api\V1;

use App\Http\Controllers\Controller;
use App\Models\Compte;
use App\Models\Entreprise;
use App\Models\Equipe;
use App\Models\EpiDelegation;
use App\Models\EpiJournalier;
use App\Services\EpiService;
use App\Support\Tenant\Tenant;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Storage;
use Illuminate\Support\Str;

/**
 * Photo EPI du matin (voir EpiService pour les règles).
 * Chef/technicien : statut + envoi. Conformité/admin : vue du jour,
 * validation, rejet motivé, délégations.
 */
class EpiController extends Controller
{
    public function __construct(private EpiService $epi)
    {
    }

    /** GET /epi/statut — l'APK s'en sert pour se verrouiller / déverrouiller. */
    public function statut()
    {
        $compte = Tenant::compte();

        if (!in_array($compte->role, ['chef', 'technicien'], true) || !$compte->equipe_id) {
            return response()->json(['debloque' => true, 'raison' => 'non_concerne', 'peut_envoyer' => false]);
        }

        return response()->json(
            $this->epi->statut($compte->entreprise_id, $compte->equipe_id)
            + ['peut_envoyer' => $this->epi->peutEnvoyer($compte)]
        );
    }

    /** POST /epi — multipart : fichier, prise_le (heure réelle si envoyé après coup). */
    public function envoyer(Request $request)
    {
        $compte = Tenant::compte();

        if (!$this->epi->peutEnvoyer($compte)) {
            return response()->json(['error' => "Vous n'êtes pas autorisé à envoyer la photo EPI aujourd'hui"], 403);
        }

        $data = $request->validate([
            'fichier' => 'required|file|mimetypes:image/jpeg,image/png,image/webp|max:10240',
            'prise_le' => 'nullable|date',
        ]);

        $existante = $this->epi->photoDuJour($compte->entreprise_id, $compte->equipe_id);
        if ($existante?->statut === 'valide') {
            return response()->json($existante, 200); // déjà validée : renvoi sans effet
        }

        $date = $this->epi->aujourdhui();
        $chemin = $request->file('fichier')->store(
            "uploads/{$compte->entreprise_id}/epi/{$date}", 'local'
        );

        $maintenant = now();
        // L'heure déclarée par l'APK ne peut pas être dans le futur.
        $priseLe = isset($data['prise_le']) ? min(now()->parse($data['prise_le']), $maintenant) : $maintenant;

        $champs = [
            'envoye_par' => $compte->id,
            'fichier' => $chemin,
            'prise_le' => $priseLe,
            'envoye_le' => $maintenant, // heure serveur : départ du délai de 30 min
            'statut' => 'en_attente',
            'motif' => null,
            'decide_par' => null,
            'decide_le' => null,
        ];

        if ($existante) {
            Storage::disk('local')->delete($existante->fichier);
            $existante->update($champs);
            $epi = $existante;
        } else {
            $epi = EpiJournalier::create($champs + [
                'entreprise_id' => $compte->entreprise_id,
                'equipe_id' => $compte->equipe_id,
                'date' => $date,
            ]);
        }

        return response()->json(
            $this->epi->statut($compte->entreprise_id, $compte->equipe_id, $epi),
            201
        );
    }

    /** GET /epi/jour — conformité/admin : toutes les équipes, aujourd'hui. */
    public function jour()
    {
        $entreprise = Entreprise::find(Tenant::entrepriseId());
        $date = $this->epi->aujourdhui();
        $alerte = $this->epi->alerteActive();

        $epis = EpiJournalier::whereDate('date', $date)->get()->keyBy('equipe_id');
        $delegations = EpiDelegation::whereDate('date', $date)->get()->groupBy('equipe_id');
        $noms = Compte::whereIn('id', $delegations->flatten()->pluck('compte_id'))->pluck('nom', 'id');
        $techniciens = Compte::where('role', 'technicien')->where('actif', true)
            ->orderBy('nom')->get(['id', 'nom', 'equipe_id'])->groupBy('equipe_id');

        $equipes = Equipe::where('actif', true)->orderBy('nom')->get()->map(function ($e) use ($epis, $delegations, $noms, $techniciens, $entreprise, $alerte) {
            $epi = $epis->get($e->id);
            $deleguees = ($delegations->get($e->id) ?? collect())
                ->map(fn ($d) => ['id' => $d->id, 'compte_id' => $d->compte_id, 'nom' => $noms[$d->compte_id] ?? null])
                ->values();

            return [
                'equipe_id' => $e->id,
                'equipe' => $e->nom,
                'statut' => $this->epi->statut($e->entreprise_id, $e->id, $epi, $entreprise),
                'delegations' => $deleguees,
                'techniciens' => ($techniciens->get($e->id) ?? collect())->map(fn ($t) => $t->only(['id', 'nom']))->values(),
                // Pas de photo ni de délégation passé 08h30 : la conformité doit intervenir.
                'a_signaler' => $alerte && !$epi && $deleguees->isEmpty(),
            ];
        })->values();

        return response()->json([
            'date' => $date,
            'epi_obligatoire' => (bool) $entreprise?->epi_obligatoire,
            'equipes' => $equipes,
        ]);
    }

    /** POST /epi/{id}/decision — valide, ou rejette avec motif (aussi pour révoquer après coup). */
    public function decision(Request $request, string $id)
    {
        $data = $request->validate([
            'decision' => 'required|in:valide,rejete',
            'motif' => 'required_if:decision,rejete|nullable|string|max:255',
        ]);

        $epi = EpiJournalier::findOrFail($id); // TenantScope : jamais celle d'une autre entreprise
        $epi->update([
            'statut' => $data['decision'],
            'motif' => $data['decision'] === 'rejete' ? $data['motif'] : null,
            'decide_par' => Tenant::compte()->id,
            'decide_le' => now(),
        ]);

        return response()->json($this->epi->statut($epi->entreprise_id, $epi->equipe_id, $epi));
    }

    /** GET /epi/{id}/photo — conformité/admin, ou chef de l'équipe concernée. */
    public function photo(string $id)
    {
        $epi = EpiJournalier::findOrFail($id);
        $compte = Tenant::compte();

        if ($compte->role === 'chef' && $compte->equipe_id !== $epi->equipe_id) {
            abort(403, 'Photo hors de votre équipe');
        }
        if (!Storage::disk('local')->exists($epi->fichier)) {
            return response()->json(['error' => 'Fichier manquant'], 404);
        }

        return Storage::disk('local')->response($epi->fichier, 'epi-' . Str::slug($epi->date->toDateString()) . '.jpg');
    }

    /**
     * POST /epi/delegations — donne le droit d'envoi à un technicien.
     * admin/conformité : n'importe quelle équipe ; chef : la sienne seulement
     * (il peut prévenir à l'avance, avant minuit).
     */
    public function deleguer(Request $request)
    {
        $compte = Tenant::compte();

        $data = $request->validate([
            'compte_id' => 'required|integer',
            'equipe_id' => 'nullable|integer',
            'date' => 'nullable|date_format:Y-m-d|after_or_equal:' . $this->epi->aujourdhui(),
        ]);

        $equipeId = $compte->role === 'chef' ? $compte->equipe_id : ($data['equipe_id'] ?? null);
        if (!$equipeId) {
            return response()->json(['error' => "L'équipe est requise"], 422);
        }
        $equipe = Equipe::findOrFail($equipeId); // TenantScope : équipe de l'entreprise uniquement

        $technicien = Compte::where('id', $data['compte_id'])
            ->where('role', 'technicien')
            ->where('equipe_id', $equipe->id)
            ->first();
        if (!$technicien) {
            return response()->json(['error' => "Le technicien doit appartenir à l'équipe"], 422);
        }

        $delegation = EpiDelegation::firstOrCreate([
            'equipe_id' => $equipe->id,
            'compte_id' => $technicien->id,
            'date' => $data['date'] ?? $this->epi->aujourdhui(),
        ], [
            'entreprise_id' => $equipe->entreprise_id,
            'accorde_par' => $compte->id,
        ]);

        return response()->json($delegation, $delegation->wasRecentlyCreated ? 201 : 200);
    }
}
