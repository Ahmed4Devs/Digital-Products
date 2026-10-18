#!/bin/sh
# Runs once, on the first initialization of the data volume.
# Creates a non-superuser application role that owns only the project databases:
#   <name>          development
#   <name>_shadow   Prisma's shadow database for `prisma migrate dev`
#   <name>_test     automated tests (reset before each run)
set -eu

: "${APP_DB_USER:?}" "${APP_DB_PASSWORD:?}" "${APP_DB_NAME:?}"

psql -v ON_ERROR_STOP=1 --username "$POSTGRES_USER" --dbname postgres \
  --set=app_user="$APP_DB_USER" \
  --set=app_password="$APP_DB_PASSWORD" <<'SQL'
CREATE ROLE :"app_user" WITH LOGIN PASSWORD :'app_password'
  NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION NOBYPASSRLS;
SQL

for db in "$APP_DB_NAME" "${APP_DB_NAME}_shadow" "${APP_DB_NAME}_test"; do
  psql -v ON_ERROR_STOP=1 --username "$POSTGRES_USER" --dbname postgres \
    --set=db="$db" \
    --set=app_user="$APP_DB_USER" <<'SQL'
CREATE DATABASE :"db" OWNER :"app_user" ENCODING 'UTF8' TEMPLATE template0;
REVOKE ALL ON DATABASE :"db" FROM PUBLIC;
GRANT CONNECT, TEMPORARY ON DATABASE :"db" TO :"app_user";
SQL
done
