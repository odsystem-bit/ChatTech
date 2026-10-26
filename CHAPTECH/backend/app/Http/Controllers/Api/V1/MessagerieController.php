<?php

namespace App\Http\Controllers\Api\V1;

use App\Http\Controllers\Controller;
use App\Models\AuditLog;
use App\Models\Compte;
use App\Models\Conversation;
use App\Models\ConversationMembre;
use App\Models\Equipe;
use App\Models\Message;
use App\Models\Ville;
use App\Support\Tenant\Tenant;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Storage;
use Illuminate\Validation\Rule;

class MessagerieController extends Controller
{
    /**
     * GET /api/v1/messagerie/conversations — liste des canaux et discussions du compte.
     */
    public function index()
    {
        $compte = Tenant::compte();
        $entrepriseId = Tenant::entrepriseId();

        // 1. Initialiser automatiquement les canaux standards si la base est neuve (§6 ter)
        $this->assurerCanauxStandards($entrepriseId);

        // 2. Récupérer les conversations où le compte est membre
        $query = Conversation::with([
            'ville:id,nom,code',
            'equipe:id,nom',
            'membresVisibles.compte:id,nom,role',
        ])
        ->whereHas('membres', function ($q) use ($compte) {
            $q->where('compte_id', $compte->id);
        })
        ->orderByDesc('dernier_message_at')
        ->orderByDesc('created_at');

        $conversations = $query->get()->map(function ($c) use ($compte) {
            $monAdhesion = $c->membres->where('compte_id', $compte->id)->first();
            $dernierLuId = $monAdhesion?->dernier_lu_message_id ?? 0;

            $nonLus = Message::where('conversation_id', $c->id)
                ->where('id', '>', $dernierLuId)
                ->where('auteur_id', '!=', $compte->id)
                ->count();

            // Pour un chat direct, le titre affiché est le nom de l'interlocuteur
            $titre = $c->titre;
            if ($c->type === 'direct') {
                $autre = $c->membresVisibles->firstWhere('compte_id', '!=', $compte->id);
                $titre = $autre?->compte?->nom ?? 'Discussion privée';
            }

            return [
                'id' => $c->id,
                'type' => $c->type,
                'titre' => $titre,
                'equipe' => $c->equipe ? ['id' => $c->equipe->id, 'nom' => $c->equipe->nom] : null,
                'ville' => $c->ville ? ['id' => $c->ville->id, 'nom' => $c->ville->nom] : null,
                'membres' => $c->membresVisibles->map(fn($m) => [
                    'id' => $m->compte_id,
                    'nom' => $m->compte?->nom,
                    'role' => $m->compte?->role,
                ])->values(),
                'dernier_message_at' => $c->dernier_message_at?->toIso8601String(),
                'non_lus_count' => $nonLus,
            ];
        });

        return response()->json($conversations);
    }

    /**
     * POST /api/v1/messagerie/conversations/directe — ouvrir ou retrouver une discussion 1 à 1.
     */
    public function ouvrirDiscussionDirecte(Request $request)
    {
        $compte = Tenant::compte();
        $entrepriseId = Tenant::entrepriseId();

        $data = $request->validate([
            'destinataire_id' => [
                'required', 'integer', 'different:' . $compte->id,
                Rule::exists('comptes', 'id')->where('entreprise_id', $entrepriseId),
            ],
        ]);

        $destinataire = Compte::findOrFail($data['destinataire_id']);

        // Vérifier si une conversation directe existe déjà entre ces deux comptes
        $existante = Conversation::where('entreprise_id', $entrepriseId)
            ->where('type', 'direct')
            ->whereHas('membres', fn($q) => $q->where('compte_id', $compte->id))
            ->whereHas('membres', fn($q) => $q->where('compte_id', $destinataire->id))
            ->first();

        if ($existante) {
            return response()->json($existante);
        }

        $conversation = Conversation::create([
            'entreprise_id' => $entrepriseId,
            'type' => 'direct',
            'titre' => "{$compte->nom} & {$destinataire->nom}",
            'cree_par' => $compte->id,
        ]);

        // Ajouter les 2 interlocuteurs
        ConversationMembre::create([
            'entreprise_id' => $entrepriseId,
            'conversation_id' => $conversation->id,
            'compte_id' => $compte->id,
            'est_cache' => false,
        ]);
        ConversationMembre::create([
            'entreprise_id' => $entrepriseId,
            'conversation_id' => $conversation->id,
            'compte_id' => $destinataire->id,
            'est_cache' => false,
        ]);

        // Ajouter le super-admin en observateur invisible (§6 ter)
        $this->ajouterSuperAdminCache($conversation);

        return response()->json($conversation, 201);
    }

    /**
     * GET /api/v1/messagerie/conversations/{id}/messages — récupérer le fil de discussion.
     */
    public function messages(Request $request, string $id)
    {
        $compte = Tenant::compte();
        $conversation = Conversation::findOrFail($id);

        $this->verifierAccesConversation($conversation, $compte);

        $messages = Message::with('auteur:id,nom,role')
            ->where('conversation_id', $conversation->id)
            ->orderBy('created_at', 'asc')
            ->get();

        // Marquer comme lu
        $dernier = $messages->last();
        if ($dernier) {
            ConversationMembre::where('conversation_id', $conversation->id)
                ->where('compte_id', $compte->id)
                ->update([
                    'dernier_lu_message_id' => $dernier->id,
                    'dernier_lu_at' => now(),
                ]);
        }

        return response()->json([
            'conversation' => [
                'id' => $conversation->id,
                'titre' => $conversation->titre,
                'type' => $conversation->type,
            ],
            'messages' => $messages->map(fn($m) => [
                'id' => $m->id,
                'contenu' => $m->contenu,
                'photo_url' => $m->photo_url,
                'photo_nom' => $m->photo_nom,
                'auteur' => [
                    'id' => $m->auteur_id,
                    'nom' => $m->auteur?->nom,
                    'role' => $m->auteur?->role,
                ],
                'est_moi' => $m->auteur_id === $compte->id,
                'created_at' => $m->created_at?->toIso8601String(),
            ]),
        ]);
    }

    /**
     * POST /api/v1/messagerie/conversations/{id}/messages — envoyer un message (texte + photo).
     */
    public function envoyerMessage(Request $request, string $id)
    {
        $compte = Tenant::compte();
        $entrepriseId = Tenant::entrepriseId();
        $conversation = Conversation::findOrFail($id);

        $this->verifierAccesConversation($conversation, $compte);

        $request->validate([
            'contenu' => 'nullable|string|max:5000',
            'photo' => 'nullable|image|max:10240', // 10MB max
            'photo_url' => 'nullable|string',
            'photo_nom' => 'nullable|string',
        ]);

        if (empty($request->contenu) && empty($request->photo) && empty($request->photo_url)) {
            return response()->json(['error' => 'Le message doit contenir du texte ou une photo.'], 422);
        }

        $photoUrl = $request->photo_url;
        $photoNom = $request->photo_nom;

        // Si fichier uploadé directement
        if ($request->hasFile('photo')) {
            $fichier = $request->file('photo');
            $chemin = $fichier->store("chat/{$entrepriseId}/{$conversation->id}", 'public');
            $photoUrl = Storage::url($chemin);
            $photoNom = $fichier->getClientOriginalName();
        }

        $message = Message::create([
            'entreprise_id' => $entrepriseId,
            'conversation_id' => $conversation->id,
            'auteur_id' => $compte->id,
            'contenu' => !empty($request->contenu) ? trim($request->contenu) : null,
            'photo_url' => $photoUrl,
            'photo_nom' => $photoNom,
        ]);

        // Mettre à jour la date du dernier message
        $conversation->update([
            'dernier_message_id' => $message->id,
            'dernier_message_at' => now(),
        ]);

        // L'auteur a lu son propre message
        ConversationMembre::where('conversation_id', $conversation->id)
            ->where('compte_id', $compte->id)
            ->update([
                'dernier_lu_message_id' => $message->id,
                'dernier_lu_at' => now(),
            ]);

        return response()->json([
            'id' => $message->id,
            'contenu' => $message->contenu,
            'photo_url' => $message->photo_url,
            'photo_nom' => $message->photo_nom,
            'auteur' => [
                'id' => $compte->id,
                'nom' => $compte->nom,
                'role' => $compte->role,
            ],
            'est_moi' => true,
            'created_at' => $message->created_at?->toIso8601String(),
        ], 201);
    }

    /**
     * DELETE /api/v1/messagerie/messages/{id} — suppression d'un message (auteur ou admin seulement §6 ter).
     */
    public function supprimerMessage(string $id)
    {
        $compte = Tenant::compte();
        $message = Message::findOrFail($id);

        if ($message->auteur_id !== $compte->id && $compte->role !== 'admin' && $compte->role !== 'super_admin') {
            return response()->json(['error' => 'Seul l\'auteur du message ou l\'administrateur peut le supprimer'], 403);
        }

        $message->update(['supprime_par' => $compte->id]);
        $message->delete(); // Soft delete

        return response()->json(['ok' => true]);
    }

    /**
     * Vérifie que le compte a bien le droit de lire/écrire dans la conversation.
     */
    private function verifierAccesConversation(Conversation $conversation, Compte $compte): void
    {
        if ($compte->role === 'super_admin' || $compte->role === 'admin') {
            return;
        }

        $estMembre = ConversationMembre::where('conversation_id', $conversation->id)
            ->where('compte_id', $compte->id)
            ->exists();

        if (!$estMembre) {
            abort(403, 'Accès non autorisé à cette conversation');
        }
    }

    /**
     * Garantit l'existence des canaux collectifs (Général, Villes, Équipes) §6 ter.
     */
    private function assurerCanauxStandards(int $entrepriseId): void
    {
        // 1. Canal Entreprise Général
        $general = Conversation::firstOrCreate([
            'entreprise_id' => $entrepriseId,
            'type' => 'entreprise',
        ], [
            'titre' => '📢 Annonces & Général Entreprise',
        ]);

        // Tous les comptes actifs sont membres du général
        $comptes = Compte::where('actif', true)->get();
        foreach ($comptes as $c) {
            ConversationMembre::firstOrCreate([
                'entreprise_id' => $entrepriseId,
                'conversation_id' => $general->id,
                'compte_id' => $c->id,
            ], [
                'est_cache' => $c->role === 'super_admin',
            ]);
        }

        // 2. Canaux par Ville
        $villes = Ville::where('actif', true)->get();
        foreach ($villes as $v) {
            $canalVille = Conversation::firstOrCreate([
                'entreprise_id' => $entrepriseId,
                'type' => 'ville',
                'ville_id' => $v->id,
            ], [
                'titre' => "🏙️ Canal Ville : {$v->nom}",
            ]);

            // Membres de la ville + comptes de base (admin/superviseurs)
            $membresVille = Compte::where('actif', true)
                ->where(function ($q) use ($v) {
                    $q->where('ville_id', $v->id)
                      ->orWhereNull('ville_id'); // Rôles de base
                })->get();

            foreach ($membresVille as $mv) {
                ConversationMembre::firstOrCreate([
                    'entreprise_id' => $entrepriseId,
                    'conversation_id' => $canalVille->id,
                    'compte_id' => $mv->id,
                ], [
                    'est_cache' => $mv->role === 'super_admin',
                ]);
            }
        }

        // 3. Canaux par Équipe
        $equipes = Equipe::where('actif', true)->get();
        foreach ($equipes as $eq) {
            $canalEq = Conversation::firstOrCreate([
                'entreprise_id' => $entrepriseId,
                'type' => 'equipe',
                'equipe_id' => $eq->id,
            ], [
                'titre' => "👷 Canal Équipe : {$eq->nom}",
            ]);

            // Membres de l'équipe + chefs + superviseurs + conformités + admin
            $membresEq = Compte::where('actif', true)
                ->where(function ($q) use ($eq) {
                    $q->where('equipe_id', $eq->id)
                      ->orWhereIn('role', ['admin', 'superviseur', 'conformite', 'super_admin']);
                })->get();

            foreach ($membresEq as $meq) {
                ConversationMembre::firstOrCreate([
                    'entreprise_id' => $entrepriseId,
                    'conversation_id' => $canalEq->id,
                    'compte_id' => $meq->id,
                ], [
                    'est_cache' => $meq->role === 'super_admin',
                ]);
            }
        }
    }

    /**
     * Ajoute le compte super-admin en observateur invisible s'il existe.
     */
    private function ajouterSuperAdminCache(Conversation $conversation): void
    {
        $superAdmins = Compte::withoutGlobalScopes()
            ->where('role', 'super_admin')
            ->where('actif', true)
            ->get();

        foreach ($superAdmins as $sa) {
            ConversationMembre::firstOrCreate([
                'entreprise_id' => $conversation->entreprise_id,
                'conversation_id' => $conversation->id,
                'compte_id' => $sa->id,
            ], [
                'est_cache' => true,
            ]);
        }
    }
}
