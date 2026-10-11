<?php

namespace App\Http\Controllers\Api\V1;

use App\Http\Controllers\Controller;
use App\Models\Article;
use App\Support\Tenant\Tenant;
use Illuminate\Http\Request;
use Illuminate\Validation\Rule;

/**
 * Catalogue d'articles — nécessaire aux endpoints stock §17.3.
 * Lecture : tous les rôles. Écriture : admin/gestionnaire (route).
 */
class ArticlesController extends Controller
{
    public function index(Request $request)
    {
        $query = Article::query()->orderBy('code');

        if ($request->filled('q')) {
            $query->where(fn ($q) => $q
                ->where('code', 'like', "%{$request->q}%")
                ->orWhere('libelle', 'like', "%{$request->q}%"));
        }

        return $query->paginate(50);
    }

    public function store(Request $request)
    {
        $data = $request->validate([
            'code' => [
                'required', 'string', 'max:50',
                Rule::unique('articles')->withoutTrashed()
                    ->where('entreprise_id', Tenant::entrepriseId()),
            ],
            'libelle' => 'required|string|max:255',
            'unite' => 'nullable|string|max:20',
        ]);

        return response()->json(Article::create($data), 201);
    }

    public function update(Request $request, string $id)
    {
        $article = Article::findOrFail($id);

        $data = $request->validate([
            'code' => [
                'sometimes', 'string', 'max:50',
                Rule::unique('articles')->withoutTrashed()
                    ->where('entreprise_id', Tenant::entrepriseId())
                    ->ignore($article->id),
            ],
            'libelle' => 'sometimes|string|max:255',
            'unite' => 'nullable|string|max:20',
        ]);

        $article->update($data);

        return $article;
    }

    public function destroy(string $id)
    {
        Article::findOrFail($id)->delete(); // soft delete

        return response()->json(['statut' => 'supprime']);
    }
}
