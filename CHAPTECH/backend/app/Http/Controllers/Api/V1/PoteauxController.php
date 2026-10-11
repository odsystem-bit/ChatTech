<?php

namespace App\Http\Controllers\Api\V1;

use App\Http\Controllers\Controller;
use App\Models\Intervention;
use App\Support\Tenant\Tenant;
use Illuminate\Http\Request;
use Illuminate\Validation\Rule;

/**
 * Suivi des poteaux §3 : implantés / armés / traversés.
 * admin et responsable poteaux : toute l'entreprise (ou une équipe).
 * chef : uniquement SON équipe — le filtre est imposé côté serveur.
 * Règle héritée de FibreTrack : par fiche, on retient le plus grand
 * entre le compteur déclaré et le nombre de points GPS correspondants.
 */
class PoteauxController extends Controller
{
    private const SOUS_TYPE_IMPLANTE = 'Implanté';
    private const SOUS_TYPE_ARME = 'Armé';

    /** GET /api/v1/poteaux?equipe=N&debut=YYYY-MM-DD&fin=YYYY-MM-DD */
    public function index(Request $request)
    {
        $lignes = $this->lignes($request);

        return response()->json([
            'lignes' => $lignes,
            'totaux' => [
                'implantes' => array_sum(array_column($lignes, 'implantes')),
                'armes' => array_sum(array_column($lignes, 'armes')),
                'traverses' => array_sum(array_column($lignes, 'traverses')),
            ],
        ]);
    }

    /** GET /api/v1/poteaux/export — même filtre, en CSV ouvrable dans Excel. */
    public function export(Request $request)
    {
        $lignes = $this->lignes($request);
        $nom = 'poteaux_' . now()->format('Ymd_His') . '.csv';

        return response()->streamDownload(function () use ($lignes) {
            $out = fopen('php://output', 'w');
            fwrite($out, "\xEF\xBB\xBF"); // BOM : Excel lit l'UTF-8 correctement
            fputcsv($out, [
                'Date', 'Équipe', 'Chef', 'Client', 'Téléphone', 'Adresse',
                'Poteaux implantés', 'Poteaux armés', 'Poteaux traversés',
                'GPS implantés', 'GPS armés',
            ], ';');

            foreach ($lignes as $l) {
                fputcsv($out, array_map([$this, 'neutraliser'], [
                    $l['date'], $l['equipe'], $l['chef_nom'], $l['client_nom'],
                    $l['client_tel'], $l['adresse'],
                    $l['implantes'], $l['armes'], $l['traverses'],
                    implode(' | ', $l['gps_implantes']),
                    implode(' | ', $l['gps_armes']),
                ]), ';');
            }
            fclose($out);
        }, $nom, ['Content-Type' => 'text/csv; charset=UTF-8']);
    }

    private function lignes(Request $request): array
    {
        $compte = Tenant::compte();
        $data = $request->validate([
            'equipe' => [
                'nullable', 'integer',
                Rule::exists('equipes', 'id')
                    ->where('entreprise_id', Tenant::entrepriseId()),
            ],
            'debut' => 'nullable|date_format:Y-m-d',
            'fin' => 'nullable|date_format:Y-m-d|after_or_equal:debut',
        ]);

        $query = Intervention::with([
            'equipe:id,nom',
            'pointsGps' => fn ($q) => $q->where('type', 'Poteau')
                ->select('id', 'intervention_id', 'sous_type', 'lat', 'lng'),
        ])->orderBy('date');

        // Un chef ne voit que son équipe, quel que soit le paramètre reçu.
        if ($compte->role === 'chef') {
            $query->where('equipe_id', $compte->equipe_id);
        } elseif (!empty($data['equipe'])) {
            $query->where('equipe_id', $data['equipe']);
        }
        if (!empty($data['debut'])) {
            $query->whereDate('date', '>=', $data['debut']);
        }
        if (!empty($data['fin'])) {
            $query->whereDate('date', '<=', $data['fin']);
        }

        $lignes = [];
        foreach ($query->get() as $i) {
            $implantes = $i->pointsGps->where('sous_type', self::SOUS_TYPE_IMPLANTE);
            $armes = $i->pointsGps->where('sous_type', self::SOUS_TYPE_ARME);

            $nbImplantes = max((int) $i->nb_poteaux_implantes, $implantes->count());
            $nbArmes = max((int) $i->nb_poteaux_armes, $armes->count());
            $nbTraverses = (int) $i->nb_poteaux_traverses;

            if ($nbImplantes + $nbArmes + $nbTraverses === 0) {
                continue;
            }

            $lignes[] = [
                'id' => $i->id,
                'date' => $i->date?->format('d/m/Y'),
                'equipe_id' => $i->equipe_id,
                'equipe' => $i->equipe?->nom,
                'chef_nom' => trim((string) $i->chef_nom),
                'client_nom' => trim((string) $i->client_nom),
                'client_tel' => $i->client_tel,
                'adresse' => trim((string) $i->adresse),
                'implantes' => $nbImplantes,
                'armes' => $nbArmes,
                'traverses' => $nbTraverses,
                'gps_implantes' => $implantes->map(fn ($p) => "{$p->lat},{$p->lng}")->values()->all(),
                'gps_armes' => $armes->map(fn ($p) => "{$p->lat},{$p->lng}")->values()->all(),
            ];
        }

        return $lignes;
    }

    /** Anti-injection de formule Excel (= + - @) sur les textes saisis par les utilisateurs. */
    private function neutraliser(mixed $valeur): mixed
    {
        if (is_string($valeur) && $valeur !== '' && str_contains('=+-@', $valeur[0])) {
            return "'" . $valeur;
        }
        return $valeur;
    }
}
