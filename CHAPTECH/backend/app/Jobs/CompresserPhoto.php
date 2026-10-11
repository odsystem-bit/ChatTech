<?php

namespace App\Jobs;

use App\Models\Photo;
use Illuminate\Bus\Queueable;
use Illuminate\Contracts\Queue\ShouldQueue;
use Illuminate\Foundation\Bus\Dispatchable;
use Illuminate\Queue\InteractsWithQueue;
use Illuminate\Queue\SerializesModels;
use Illuminate\Support\Facades\Log;
use Illuminate\Support\Facades\Storage;

/**
 * §16.5 : compression + correction EXIF en job queued — jamais dans
 * la requête HTTP (fini les timeouts terrain).
 *
 * Le job tourne sans contexte tenant → withoutGlobalScopes explicite.
 * Défensif : si GD/EXIF ne peuvent traiter le fichier, on garde
 * l'original et on log — jamais d'échec qui perd la photo.
 */
class CompresserPhoto implements ShouldQueue
{
    use Dispatchable, InteractsWithQueue, Queueable, SerializesModels;

    private const MAX_DIMENSION = 1920;

    public function __construct(public string $photoId) {}

    public function handle(): void
    {
        $photo = Photo::withoutGlobalScopes()->find($this->photoId);
        if (!$photo || $photo->type === 'video') {
            return;
        }

        $disk = Storage::disk('local');
        if (!$disk->exists($photo->fichier)) {
            return;
        }

        $chemin = $disk->path($photo->fichier);
        $extension = strtolower(pathinfo($chemin, PATHINFO_EXTENSION));

        try {
            $image = match ($extension) {
                'jpg', 'jpeg' => @imagecreatefromjpeg($chemin),
                'png' => @imagecreatefrompng($chemin),
                'webp' => @imagecreatefromwebp($chemin),
                default => null,
            };
            if (!$image) {
                return; // format non traitable → on garde l'original
            }

            $image = $this->corrigerOrientation($image, $chemin, $extension);
            $image = $this->redimensionner($image);

            $ok = match ($extension) {
                'jpg', 'jpeg' => imagejpeg($image, $chemin, 80),
                'png' => imagepng($image, $chemin, 6),
                'webp' => imagewebp($image, $chemin, 80),
                default => false,
            };
            imagedestroy($image);

            if ($ok) {
                $photo->update(['taille_octets' => filesize($chemin)]);
            }
        } catch (\Throwable $e) {
            // La photo reste utilisable — on signale sans échouer la file
            Log::warning('CompresserPhoto: échec traitement', [
                'photo_id' => $this->photoId,
                'erreur' => $e->getMessage(),
            ]);
        }
    }

    /**
     * Corrige l'orientation EXIF (le bug des « photos couchées »
     * vu sur l'APK — on le corrige aussi côté serveur).
     */
    private function corrigerOrientation(\GdImage $image, string $chemin, string $extension): \GdImage
    {
        if (!in_array($extension, ['jpg', 'jpeg'], true) || !function_exists('exif_read_data')) {
            return $image;
        }

        $exif = @exif_read_data($chemin);
        $orientation = $exif['Orientation'] ?? 1;

        $angle = match ((int) $orientation) {
            3 => 180,
            6 => -90,
            8 => 90,
            default => 0,
        };

        if ($angle === 0) {
            return $image;
        }

        $tournee = imagerotate($image, $angle, 0);
        if ($tournee) {
            imagedestroy($image);
            return $tournee;
        }
        return $image;
    }

    private function redimensionner(\GdImage $image): \GdImage
    {
        $largeur = imagesx($image);
        $hauteur = imagesy($image);

        if (max($largeur, $hauteur) <= self::MAX_DIMENSION) {
            return $image;
        }

        $ratio = self::MAX_DIMENSION / max($largeur, $hauteur);
        $reduite = imagescale($image, (int) ($largeur * $ratio));

        if ($reduite) {
            imagedestroy($image);
            return $reduite;
        }
        return $image;
    }
}
