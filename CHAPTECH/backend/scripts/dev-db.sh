#!/usr/bin/env bash
# CHAPTECH — instance MySQL de développement (sans sudo, sans docker)
#
# Pourquoi : le mysqld système est verrouillé par AppArmor (/var/lib/mysql
# uniquement) et pas d'identifiants locaux. On fait donc tourner une
# instance MySQL dédiée, en userspace, sur 127.0.0.1:3307.
#
# Le datadir est dans /tmp → volatile (perdu au reboot). Ce script
# réinitialise tout proprement : init + base + user + migrations + seed.
#
# Usage :
#   ./scripts/dev-db.sh start     # démarre (crée si besoin)
#   ./scripts/dev-db.sh stop      # arrête proprement
#   ./scripts/dev-db.sh reset     # repart de zéro + migrate:fresh --seed

set -euo pipefail

DATADIR=/tmp/chaptech-db
SOCK=/tmp/chaptech-mysql.sock
PID=/tmp/chaptech-mysql.pid
LOG=/tmp/chaptech-err.log
PORT=3307
DB=chaptech
USER_=chaptech
PASS='Ch4pt3ch_D3v_2026!'
BACKEND_DIR="$(cd "$(dirname "$0")/.." && pwd)"

running() { [ -f "$PID" ] && kill -0 "$(cat "$PID")" 2>/dev/null; }

init_datadir() {
    echo "→ init datadir $DATADIR"
    /usr/sbin/mysqld --no-defaults --initialize-insecure \
        --datadir="$DATADIR" --user="$USER" \
        --log-error=/tmp/chaptech-init.log
}

start_server() {
    echo "→ démarrage mysqld :$PORT"
    /usr/sbin/mysqld --no-defaults \
        --datadir="$DATADIR" --user="$USER" \
        --port=$PORT --socket="$SOCK" --mysqlx=OFF \
        --pid-file="$PID" --log-error="$LOG" \
        --bind-address=127.0.0.1 &
    for i in $(seq 1 30); do
        mysqladmin -h127.0.0.1 -P$PORT -uroot ping >/dev/null 2>&1 && break
        sleep 1
    done
    mysqladmin -h127.0.0.1 -P$PORT -uroot ping >/dev/null
    echo "→ MySQL prêt sur 127.0.0.1:$PORT"
}

setup_db() {
    mysql -h127.0.0.1 -P$PORT -uroot -e "
        CREATE DATABASE IF NOT EXISTS $DB CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
        CREATE DATABASE IF NOT EXISTS ${DB}_test CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
        CREATE USER IF NOT EXISTS '$USER_'@'127.0.0.1' IDENTIFIED BY '$PASS';
        CREATE USER IF NOT EXISTS '$USER_'@'localhost' IDENTIFIED BY '$PASS';
        GRANT ALL ON $DB.* TO '$USER_'@'127.0.0.1';
        GRANT ALL ON $DB.* TO '$USER_'@'localhost';
        GRANT ALL ON ${DB}_test.* TO '$USER_'@'127.0.0.1';
        GRANT ALL ON ${DB}_test.* TO '$USER_'@'localhost';
        FLUSH PRIVILEGES;"
    echo "→ bases $DB + ${DB}_test, user $USER_ créés"
}

migrate_seed() {
    (cd "$BACKEND_DIR" && php artisan migrate:fresh --seed --no-interaction)
    echo "→ migrations + seed OK"
}

case "${1:-start}" in
    start)
        if running; then echo "Déjà démarré (pid $(cat $PID))"; exit 0; fi
        [ -d "$DATADIR/mysql" ] || { init_datadir; NEED_SETUP=1; }
        start_server
        [ "${NEED_SETUP:-}" = "1" ] && { setup_db; migrate_seed; }
        ;;
    stop)
        running && mysqladmin -h127.0.0.1 -P$PORT -uroot shutdown \
            && echo "Arrêté" || echo "Pas démarré"
        ;;
    reset)
        running && mysqladmin -h127.0.0.1 -P$PORT -uroot shutdown || true
        rm -rf "$DATADIR"
        init_datadir; start_server; setup_db; migrate_seed
        ;;
    *)
        echo "Usage: $0 {start|stop|reset}"; exit 1;;
esac
