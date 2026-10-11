# CHAPTECH backend — développement local

## Prérequis
- PHP 8.5 + Composer (déjà installés)
- MySQL de dev dédié : `./scripts/dev-db.sh start` (userspace, port **3307**)

## Démarrer
```bash
./scripts/dev-db.sh start     # MySQL 127.0.0.1:3307 (crée bases + migrate + seed au 1er run)
php artisan serve             # API sur http://127.0.0.1:8000
```

## Après un reboot (le datadir est dans /tmp)
```bash
./scripts/dev-db.sh start     # réinitialise tout automatiquement
```

## Comptes de dev (seed)
| Entreprise | Identifiant | Mot de passe | Rôle |
|---|---|---|---|
| Demo Telecom | admin | admin123 | admin |
| Demo Telecom | chef1 | chef123 | chef |
| Demo Telecom | tech1 | tech123 | technicien |
| Autre SARL | admin | admin123 | admin (test isolation §2) |

## Tests
```bash
php artisan test                  # 12 tests : isolation tenant, sync, stock
```
Base de test : `chaptech_test` (voir `phpunit.xml`).

## Vérifier l'API à la main
```bash
# Login → récupère un jeton
curl -X POST http://127.0.0.1:8000/api/v1/auth/login \
  -H 'Content-Type: application/json' \
  -d '{"entreprise":"Demo Telecom","identifiant":"tech1","password":"tech123"}'

# Liste des interventions (avec le jeton)
curl http://127.0.0.1:8000/api/v1/interventions -H "Authorization: Bearer TOKEN"
```

## Production (rappel §15)
MariaDB sur VPS dédié — `.env` pointera sur la vraie base ; ce script MySQL
userspace est **dev uniquement**.
