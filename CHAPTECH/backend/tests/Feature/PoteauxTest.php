<?php

namespace Tests\Feature;

use App\Models\Compte;
use App\Models\Entreprise;
use App\Models\Equipe;
use App\Models\Intervention;
use App\Models\PointGps;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Str;
use Tests\TestCase;

/**
 * Conformité §3 (poteaux) : isolation entreprise, règle max(déclaré, GPS),
 * réservé à admin et conformité (le chef n'y a pas accès).
 */
class PoteauxTest extends TestCase
{
    use RefreshDatabase;

    private Entreprise $entrepriseA;
    private Entreprise $entrepriseB;
    private Equipe $equipe1;
    private Equipe $equipe2;

    protected function setUp(): void
    {
        parent::setUp();

        $this->entrepriseA = Entreprise::create(['nom' => 'A', 'etat_abonnement' => 'actif']);
        $this->entrepriseB = Entreprise::create(['nom' => 'B', 'etat_abonnement' => 'actif']);
        $this->equipe1 = Equipe::withoutGlobalScopes()->create(['entreprise_id' => $this->entrepriseA->id, 'nom' => 'Eq 1']);
        $this->equipe2 = Equipe::withoutGlobalScopes()->create(['entreprise_id' => $this->entrepriseA->id, 'nom' => 'Eq 2']);
    }

    private function compte(Entreprise $e, string $role, ?Equipe $equipe = null): Compte
    {
        return Compte::withoutGlobalScopes()->create([
            'entreprise_id' => $e->id,
            'equipe_id' => $equipe?->id,
            'identifiant' => $role . '.' . Str::random(6),
            'nom' => ucfirst($role),
            'password_hash' => password_hash('x', PASSWORD_BCRYPT),
            'role' => $role,
        ]);
    }

    private function fiche(Entreprise $e, Equipe $equipe, Compte $par, array $champs = []): Intervention
    {
        return Intervention::withoutGlobalScopes()->create(array_merge([
            'id' => (string) Str::uuid(),
            'entreprise_id' => $e->id,
            'equipe_id' => $equipe->id,
            'cree_par' => $par->id,
            'statut' => 'termine',
            'date' => '2026-10-05 10:00:00',
        ], $champs));
    }

    private function pointGps(Intervention $i, string $sousType, string $type = 'Poteau'): void
    {
        PointGps::withoutGlobalScopes()->create([
            'id' => (string) Str::uuid(),
            'entreprise_id' => $i->entreprise_id,
            'intervention_id' => $i->id,
            'ajoute_par' => $i->cree_par,
            'type' => $type,
            'sous_type' => $sousType,
            'lat' => 6.37, 'lng' => 2.39,
            'horodatage' => '2026-10-05 10:05:00',
        ]);
    }

    public function test_A_ne_voit_pas_les_poteaux_de_B(): void
    {
        $adminA = $this->compte($this->entrepriseA, 'admin');
        $adminB = $this->compte($this->entrepriseB, 'admin');
        $equipeB = Equipe::withoutGlobalScopes()->create(['entreprise_id' => $this->entrepriseB->id, 'nom' => 'Eq B']);

        $this->fiche($this->entrepriseA, $this->equipe1, $adminA, ['nb_poteaux_implantes' => 2]);
        $this->fiche($this->entrepriseB, $equipeB, $adminB, ['nb_poteaux_implantes' => 99]);

        $reponse = $this->withToken($this->creerToken($adminA))->getJson('/api/v1/poteaux');

        $reponse->assertOk();
        $this->assertSame(2, $reponse->json('totaux.implantes'));
        $this->assertCount(1, $reponse->json('lignes'));
    }

    public function test_on_retient_le_max_entre_declare_et_gps(): void
    {
        $admin = $this->compte($this->entrepriseA, 'admin');
        $f1 = $this->fiche($this->entrepriseA, $this->equipe1, $admin, ['nb_poteaux_implantes' => 0]);
        $this->pointGps($f1, 'Implanté');
        $this->pointGps($f1, 'Implanté');
        $this->pointGps($f1, 'Armé');
        $this->pointGps($f1, 'Implanté', 'FAT'); // pas un poteau : ignoré

        $f2 = $this->fiche($this->entrepriseA, $this->equipe1, $admin, ['nb_poteaux_armes' => 3]);
        $this->pointGps($f2, 'Armé');

        $reponse = $this->withToken($this->creerToken($admin))->getJson('/api/v1/poteaux');

        $this->assertSame(2, $reponse->json('totaux.implantes')); // GPS > déclaré 0
        $this->assertSame(4, $reponse->json('totaux.armes'));     // 1 (GPS) + 3 (déclaré > GPS 1)
    }

    public function test_les_fiches_sans_poteau_sont_ignorees(): void
    {
        $admin = $this->compte($this->entrepriseA, 'admin');
        $this->fiche($this->entrepriseA, $this->equipe1, $admin);

        $reponse = $this->withToken($this->creerToken($admin))->getJson('/api/v1/poteaux');

        $this->assertCount(0, $reponse->json('lignes'));
    }

    public function test_filtre_par_equipe_et_par_dates(): void
    {
        $admin = $this->compte($this->entrepriseA, 'admin');
        $this->fiche($this->entrepriseA, $this->equipe1, $admin, ['nb_poteaux_implantes' => 1]);
        $this->fiche($this->entrepriseA, $this->equipe2, $admin, ['nb_poteaux_implantes' => 5]);
        $this->fiche($this->entrepriseA, $this->equipe1, $admin, [
            'nb_poteaux_implantes' => 7, 'date' => '2026-09-01 08:00:00',
        ]);

        $token = $this->creerToken($admin);

        $this->assertSame(1, $this->withToken($token)
            ->getJson("/api/v1/poteaux?equipe={$this->equipe1->id}&debut=2026-10-01&fin=2026-10-31")
            ->json('totaux.implantes'));
        $this->assertSame(13, $this->withToken($token)
            ->getJson('/api/v1/poteaux')->json('totaux.implantes'));
    }

    public function test_equipe_etrangere_refusee_en_filtre(): void
    {
        $adminA = $this->compte($this->entrepriseA, 'admin');
        $equipeB = Equipe::withoutGlobalScopes()->create(['entreprise_id' => $this->entrepriseB->id, 'nom' => 'Eq B']);

        $this->withToken($this->creerToken($adminA))
            ->getJson("/api/v1/poteaux?equipe={$equipeB->id}")
            ->assertStatus(422);
    }

    public function test_le_chef_d_equipe_n_a_pas_acces_aux_poteaux(): void
    {
        $admin = $this->compte($this->entrepriseA, 'admin');
        $chef = $this->compte($this->entrepriseA, 'chef', $this->equipe1);
        $this->fiche($this->entrepriseA, $this->equipe1, $admin, ['nb_poteaux_implantes' => 1]);

        $token = $this->creerToken($chef);
        $this->withToken($token)->getJson('/api/v1/poteaux')->assertStatus(403);
        $this->withToken($token)->getJson('/api/v1/poteaux/export')->assertStatus(403);
    }

    public function test_la_conformite_voit_toutes_les_equipes_de_son_entreprise(): void
    {
        $admin = $this->compte($this->entrepriseA, 'admin');
        $resp = $this->compte($this->entrepriseA, 'conformite');
        $this->fiche($this->entrepriseA, $this->equipe1, $admin, ['nb_poteaux_implantes' => 1]);
        $this->fiche($this->entrepriseA, $this->equipe2, $admin, ['nb_poteaux_implantes' => 5]);

        $this->assertSame(6, $this->withToken($this->creerToken($resp))
            ->getJson('/api/v1/poteaux')->json('totaux.implantes'));
    }

    public function test_technicien_et_gestionnaire_sont_refuses(): void
    {
        $tech = $this->compte($this->entrepriseA, 'technicien', $this->equipe1);
        $gest = $this->compte($this->entrepriseA, 'gestionnaire');

        $this->withToken($this->creerToken($tech))->getJson('/api/v1/poteaux')->assertStatus(403);
        $this->withToken($this->creerToken($gest))->getJson('/api/v1/poteaux')->assertStatus(403);
        $this->withToken($this->creerToken($tech))->getJson('/api/v1/poteaux/export')->assertStatus(403);
    }

    public function test_export_csv_neutralise_les_formules(): void
    {
        $admin = $this->compte($this->entrepriseA, 'admin');
        $this->fiche($this->entrepriseA, $this->equipe1, $admin, [
            'nb_poteaux_implantes' => 2,
            'client_nom' => '=HYPERLINK("http://x")',
        ]);

        $reponse = $this->withToken($this->creerToken($admin))->get('/api/v1/poteaux/export');

        $reponse->assertOk();
        $contenu = $reponse->streamedContent();
        $this->assertStringContainsString("'=HYPERLINK", $contenu);
        $this->assertStringContainsString('Poteaux implantés', $contenu);
    }
}
