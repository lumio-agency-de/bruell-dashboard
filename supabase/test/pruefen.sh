#!/bin/sh
# Prüft schema.sql (Bad) + personal.sql + fahrzeuge.sql + rechte.sql gegen eine frische, temporäre PostgreSQL-Instanz (nichts Bestehendes wird berührt).
# Braucht: brew install postgresql@15
set -e
PG=/opt/homebrew/opt/postgresql@15/bin; HIER="$(cd "$(dirname "$0")" && pwd)"; T=$(mktemp -d)
trap '"$PG/pg_ctl" -D "$T/data" stop -m fast >/dev/null 2>&1; rm -rf "$T"' EXIT
"$PG/initdb" -D "$T/data" -U postgres -A trust >/dev/null
"$PG/pg_ctl" -D "$T/data" -o "-p 55433 -k $T -c listen_addresses=''" -l "$T/log" start >/dev/null; sleep 1
p() { "$PG/psql" -h "$T" -p 55433 -U postgres -d postgres -v ON_ERROR_STOP=1 -q "$@"; }
p -f "$HIER/supabase-ersatz.sql"
p -f "$HIER/../../bad/supabase/schema.sql" 2>&1 | grep -v NOTICE || true
p -f "$HIER/../personal.sql" 2>&1 | grep -v NOTICE || true
p -f "$HIER/../personal.sql" 2>&1 | grep -v NOTICE || true      # zweiter Lauf: muss wiederholbar sein
p -f "$HIER/../fahrzeuge.sql" 2>&1 | grep -v NOTICE || true
p -f "$HIER/../fahrzeuge.sql" 2>&1 | grep -v NOTICE || true
p -f "$HIER/../rechte.sql" 2>&1 | grep -v NOTICE || true
p -f "$HIER/../rechte.sql" 2>&1 | grep -v NOTICE || true
{ "$PG/psql" -h "$T" -p 55433 -U postgres -d postgres -q -f "$HIER/personal-test.sql"; "$PG/psql" -h "$T" -p 55433 -U postgres -d postgres -q -f "$HIER/fahrzeuge-test.sql"; "$PG/psql" -h "$T" -p 55433 -U postgres -d postgres -q -f "$HIER/rechte-test.sql"; } 2>&1 | grep -E 'ERROR' | sort -u
"$PG/psql" -h "$T" -p 55433 -U postgres -d postgres -tAc "select txt from _erg order by n"
"$PG/psql" -h "$T" -p 55433 -U postgres -d postgres -tAc "select count(*) filter (where txt like 'OK%') || ' OK, ' || count(*) filter (where txt like 'FEHLER%') || ' Fehler' from _erg"
