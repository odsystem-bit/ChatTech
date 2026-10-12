<?php

namespace Tests\Feature;

use App\Models\Compte;
use App\Models\Entreprise;
use App\Models\Equipe;
use App\Models\EpiJournalier;
use App\Support\Tenant\Tenant;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Http\UploadedFile;
use Illuminate\Support\Carbon;
use Illuminate\Support\Facades\Storage;
use Illuminate\Support\Str;
use Tests\TestCase;

/**
 * Photo EPI du matin : validation / rejet motivé / déblocage auto après
 * 30 min / fenêtre 06h-23h / délégation / alerte 08h30 / isolation.
 * Heures exprimées en heure locale (Africa/Porto-Novo, UTC+1).
 */
class EpiTest extends TestCase
{
    use RefreshDatabase;

    private const JOUR = '2026-10-12';

    private Entreprise $A;
    private Entreprise $B;
    private Equipe $eq1;
    private Equipe $eq2;
    private Compte $admin;
    private Compte $conformite;
    private Compte $chef;
    private Compte $tech;
    private Compte $techAutreEquipe;

    protected function setUp(): void
    {
        parent::setUp();
        Tenant::setCompte(null);
        Storage::fake('local');

        $this->A = Entreprise::create(['nom' => 'A', 'etat_abonnement' => 'actif', 'epi_obligatoire' => true]);
        $this->B = Entreprise::create(['nom' => 'B', 'etat_abonnement' => 'actif']);
        $this->eq1 = Equipe::withoutGlobalScopes()->create(['entreprise_id' => $this->A->id, 'nom' => 'Eq 1']);
        $this->eq2 = Equipe::withoutGlobalScopes()->create(['entreprise_id' => $this->A->id, 'nom' => 'Eq 2']);

        $this->admin = $this->compte($this->A, 'admin');
        $this->conformite = $this->compte($this->A, 'conformite');
        $this->chef = $this->compte($this->A, 'chef', $this->eq1);
        $this->tech = $this->compte($this->A, 'technicien', $this->eq1);
        $this->techAutreEquipe = $this->compte($this->A, 'technicien', $this->eq2);
    }

    protected function tearDown(): void
    {
        $this->travelBack();
        Tenant::setCompte(null);
        parent::tearDown();
    }

    private function compte(Entreprise $e, string $role, ?Equipe $equipe = null): Compte
    {
        return Compte::withoutGlobalScopes()->create([
            'entreprise_id' => $e->id,
            'equipe_id' => $equipe?->id,
            'identifiant' => $role . '.' . Str::random(6),
            'nom' => ucfirst($role) . ' ' . Str::random(3),
            'password_hash' => password_hash('x', PASSWORD_BCRYPT),
            'role' => $role,
        ]);
    }

    /** Fige l'horloge à une heure locale du jour de test. */
    private function heure(string $hhmm, string $jour = self::JOUR): void
    {
        $this->travelTo(Carbon::parse("$jour $hhmm:00", 'Africa/Porto-Novo')->utc());
    }

    private function as(Compte $c)
    {
        return $this->withToken($this->creerToken($c))->withHeaders(['Accept' => 'application/json']);
    }

    private function envoyerPhoto(Compte $c)
    {
        return $this->as($c)->post('/api/v1/epi', ['fichier' => UploadedFile::fake()->image('epi.jpg')]);
    }

    private function statut(Compte $c): array
    {
        return $this->as($c)->getJson('/api/v1/epi/statut')->assertOk()->json();
    }

    private function epiDuJour(): EpiJournalier
    {
        return EpiJournalier::withoutGlobalScopes()->where('equipe_id', $this->eq1->id)->firstOrFail();
    }

    public function test_sans_photo_l_equipe_est_bloquee_et_le_terrain_refuse(): void
    {
        $this->heure('08:00');

        $this->assertFalse($this->statut($this->tech)['debloque']);
        $this->assertSame('photo_manquante', $this->statut($this->tech)['raison']);

        $this->as($this->tech)->postJson('/api/v1/interventions/' . Str::uuid() . '/ops', [])
            ->assertStatus(423)->assertJson(['error' => 'epi_requis']);
        $this->as($this->chef)->postJson('/api/v1/interventions', [])->assertStatus(423);
    }

    public function test_l_entreprise_sans_epi_obligatoire_n_est_jamais_bloquee(): void
    {
        $this->heure('03:00'); // même hors horaires
        $chefB = $this->compte($this->B, 'chef', Equipe::withoutGlobalScopes()->create(['entreprise_id' => $this->B->id, 'nom' => 'Eq B']));

        $this->assertSame('non_requis', $this->statut($chefB)['raison']);
        $this->assertTrue($this->statut($chefB)['debloque']);
    }

    public function test_le_chef_envoie_la_photo_l_equipe_attend_puis_se_debloque_apres_30_min(): void
    {
        $this->heure('08:00');
        $this->envoyerPhoto($this->chef)->assertStatus(201);

        $this->assertSame('en_attente', $this->statut($this->tech)['raison']);

        $this->heure('08:29');
        $this->assertFalse($this->statut($this->tech)['debloque']);

        $this->heure('08:31');
        $statut = $this->statut($this->tech);
        $this->assertTrue($statut['debloque']);
        $this->assertSame('auto', $statut['raison']);
    }

    public function test_la_conformite_valide_et_l_equipe_est_debloquee_tout_de_suite(): void
    {
        $this->heure('08:00');
        $this->envoyerPhoto($this->chef)->assertStatus(201);
        $id = $this->epiDuJour()->id;

        $this->heure('08:05');
        $this->as($this->conformite)->postJson("/api/v1/epi/$id/decision", ['decision' => 'valide'])->assertOk();

        $this->assertSame('valide', $this->statut($this->tech)['raison']);
        $this->assertTrue($this->statut($this->chef)['debloque']);
    }

    public function test_le_rejet_exige_un_motif_et_bloque_l_equipe(): void
    {
        $this->heure('08:00');
        $this->envoyerPhoto($this->chef);
        $id = $this->epiDuJour()->id;

        $this->as($this->conformite)->postJson("/api/v1/epi/$id/decision", ['decision' => 'rejete'])
            ->assertStatus(422);

        $this->as($this->conformite)->postJson("/api/v1/epi/$id/decision", ['decision' => 'rejete', 'motif' => 'Casques manquants'])
            ->assertOk();

        $this->heure('09:00'); // largement après 30 min : un rejet ne se débloque pas seul
        $statut = $this->statut($this->tech);
        $this->assertFalse($statut['debloque']);
        $this->assertSame('rejete', $statut['raison']);
        $this->assertSame('Casques manquants', $statut['epi']['motif']);
    }

    public function test_la_conformite_peut_revoquer_apres_le_deblocage_automatique(): void
    {
        $this->heure('08:00');
        $this->envoyerPhoto($this->chef);
        $id = $this->epiDuJour()->id;

        $this->heure('08:40');
        $this->assertTrue($this->statut($this->tech)['debloque']); // débloquée d'elle-même

        $this->as($this->conformite)->postJson("/api/v1/epi/$id/decision", ['decision' => 'rejete', 'motif' => 'EPI non porté'])
            ->assertOk();

        $this->assertFalse($this->statut($this->tech)['debloque']);
    }

    public function test_le_chef_peut_renvoyer_apres_un_rejet_et_le_delai_repart(): void
    {
        $this->heure('08:00');
        $this->envoyerPhoto($this->chef);
        $id = $this->epiDuJour()->id;
        $this->as($this->conformite)->postJson("/api/v1/epi/$id/decision", ['decision' => 'rejete', 'motif' => 'Flou']);

        $this->heure('08:10');
        $this->envoyerPhoto($this->chef)->assertStatus(201);
        $this->assertSame(1, EpiJournalier::withoutGlobalScopes()->count()); // une seule ligne par équipe et par jour
        $this->assertSame('en_attente', $this->statut($this->tech)['raison']);

        $this->heure('08:41');
        $this->assertSame('auto', $this->statut($this->tech)['raison']);
    }

    public function test_une_photo_validee_n_est_pas_remplacee(): void
    {
        $this->heure('08:00');
        $this->envoyerPhoto($this->chef);
        $id = $this->epiDuJour()->id;
        $this->as($this->conformite)->postJson("/api/v1/epi/$id/decision", ['decision' => 'valide']);

        $this->envoyerPhoto($this->chef)->assertOk();
        $this->assertSame('valide', $this->epiDuJour()->statut);
    }

    public function test_fenetre_de_deblocage_6h_23h(): void
    {
        $this->heure('09:00');
        EpiJournalier::withoutGlobalScopes()->create([
            'entreprise_id' => $this->A->id, 'equipe_id' => $this->eq1->id, 'date' => self::JOUR,
            'envoye_par' => $this->chef->id, 'fichier' => 'x.jpg', 'envoye_le' => now(), 'statut' => 'valide',
        ]);

        $this->heure('05:59');
        $this->assertSame('hors_horaires', $this->statut($this->tech)['raison']);
        $this->heure('06:00');
        $this->assertTrue($this->statut($this->tech)['debloque']);
        $this->heure('22:59');
        $this->assertTrue($this->statut($this->tech)['debloque']);
        $this->heure('23:00');
        $this->assertSame('hors_horaires', $this->statut($this->tech)['raison']);
    }

    public function test_un_technicien_sans_delegation_ne_peut_pas_envoyer(): void
    {
        $this->heure('08:00');
        $this->envoyerPhoto($this->tech)->assertStatus(403);
        $this->assertFalse($this->statut($this->tech)['peut_envoyer']);
    }

    public function test_l_admin_ou_la_conformite_delegue_l_envoi_a_un_technicien(): void
    {
        $this->heure('08:30');

        $this->as($this->conformite)->postJson('/api/v1/epi/delegations', [
            'equipe_id' => $this->eq1->id, 'compte_id' => $this->tech->id,
        ])->assertStatus(201);

        $this->assertTrue($this->statut($this->tech)['peut_envoyer']);
        $this->envoyerPhoto($this->tech)->assertStatus(201);
    }

    public function test_le_chef_previent_la_veille_et_designe_un_technicien_de_son_equipe(): void
    {
        $this->heure('21:00');
        $demain = '2026-10-13';

        $this->as($this->chef)->postJson('/api/v1/epi/delegations', [
            'compte_id' => $this->tech->id, 'date' => $demain,
        ])->assertStatus(201);

        // pas valable aujourd'hui, seulement demain
        $this->assertFalse($this->statut($this->tech)['peut_envoyer']);
        $this->heure('07:00', $demain);
        $this->assertTrue($this->statut($this->tech)['peut_envoyer']);
    }

    public function test_le_chef_ne_delegue_qu_a_sa_propre_equipe(): void
    {
        $this->heure('08:00');

        $this->as($this->chef)->postJson('/api/v1/epi/delegations', [
            'compte_id' => $this->techAutreEquipe->id,
        ])->assertStatus(422);

        // même en forçant l'équipe : celle du chef est imposée
        $this->as($this->chef)->postJson('/api/v1/epi/delegations', [
            'equipe_id' => $this->eq2->id, 'compte_id' => $this->techAutreEquipe->id,
        ])->assertStatus(422);
    }

    public function test_une_delegation_dans_le_passe_ou_par_un_technicien_est_refusee(): void
    {
        $this->heure('08:00');

        $this->as($this->admin)->postJson('/api/v1/epi/delegations', [
            'equipe_id' => $this->eq1->id, 'compte_id' => $this->tech->id, 'date' => '2026-10-10',
        ])->assertStatus(422);

        $this->as($this->tech)->postJson('/api/v1/epi/delegations', [
            'compte_id' => $this->tech->id,
        ])->assertStatus(403);
    }

    public function test_alerte_conformite_a_8h30_pour_une_equipe_sans_photo_ni_delegation(): void
    {
        $this->heure('08:29');
        $avant = collect($this->as($this->conformite)->getJson('/api/v1/epi/jour')->json('equipes'));
        $this->assertFalse($avant->firstWhere('equipe_id', $this->eq1->id)['a_signaler']);

        $this->heure('08:30');
        $apres = collect($this->as($this->conformite)->getJson('/api/v1/epi/jour')->json('equipes'));
        $this->assertTrue($apres->firstWhere('equipe_id', $this->eq1->id)['a_signaler']);

        // une délégation ou une photo supprime l'alerte
        $this->as($this->conformite)->postJson('/api/v1/epi/delegations', [
            'equipe_id' => $this->eq1->id, 'compte_id' => $this->tech->id,
        ]);
        $this->envoyerPhoto($this->techAutreEquipe)->assertStatus(403); // pas délégué
        $maj = collect($this->as($this->conformite)->getJson('/api/v1/epi/jour')->json('equipes'));
        $this->assertFalse($maj->firstWhere('equipe_id', $this->eq1->id)['a_signaler']);
        $this->assertTrue($maj->firstWhere('equipe_id', $this->eq2->id)['a_signaler']);
    }

    public function test_seuls_admin_et_conformite_voient_la_vue_du_jour_et_decident(): void
    {
        $this->heure('08:00');
        $this->envoyerPhoto($this->chef);
        $id = $this->epiDuJour()->id;

        $this->as($this->chef)->getJson('/api/v1/epi/jour')->assertStatus(403);
        $this->as($this->tech)->getJson('/api/v1/epi/jour')->assertStatus(403);
        $this->as($this->chef)->postJson("/api/v1/epi/$id/decision", ['decision' => 'valide'])->assertStatus(403);
    }

    public function test_isolation_entre_entreprises(): void
    {
        $this->heure('08:00');
        $this->envoyerPhoto($this->chef);
        $id = $this->epiDuJour()->id;

        $conformiteB = $this->compte($this->B, 'conformite');
        $this->as($conformiteB)->postJson("/api/v1/epi/$id/decision", ['decision' => 'valide'])->assertStatus(404);
        $this->as($conformiteB)->getJson("/api/v1/epi/$id/photo")->assertStatus(404);
        $this->assertSame('en_attente', $this->epiDuJour()->statut);

        $this->assertCount(0, $this->as($conformiteB)->getJson('/api/v1/epi/jour')->json('equipes'));
    }

    public function test_la_conformite_peut_voir_la_photo_et_le_chef_d_une_autre_equipe_non(): void
    {
        $this->heure('08:00');
        $this->envoyerPhoto($this->chef);
        $id = $this->epiDuJour()->id;
        $autreChef = $this->compte($this->A, 'chef', $this->eq2);

        $this->as($this->conformite)->get("/api/v1/epi/$id/photo")->assertOk();
        $this->as($this->chef)->get("/api/v1/epi/$id/photo")->assertOk();
        $this->as($autreChef)->get("/api/v1/epi/$id/photo")->assertStatus(403);
    }
}
