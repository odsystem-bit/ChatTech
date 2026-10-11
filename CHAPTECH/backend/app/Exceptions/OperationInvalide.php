<?php

namespace App\Exceptions;

/**
 * Erreur métier d'une opération de sync (champ non éditable,
 * type inconnu...). Rendue en 422 par SyncController — jamais en 500.
 */
class OperationInvalide extends \InvalidArgumentException
{
}
