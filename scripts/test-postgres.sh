#!/usr/bin/env bash
set -euo pipefail
# Use an existing Unix-socket Docker daemon. This test creates only a disposable database container.
container="docuflow-rls-$RANDOM-$$"
cleanup(){ docker rm -f "$container" >/dev/null 2>&1 || true; }
trap cleanup EXIT
docker run -d --name "$container" --network none -e POSTGRES_HOST_AUTH_METHOD=trust postgres:17-alpine >/dev/null
ready=false
for i in {1..100};do
 if docker exec "$container" sh -c '[ "$(cat /proc/1/comm)" = postgres ] && pg_isready -U postgres' >/dev/null 2>&1;then ready=true;break;fi
 sleep .2
done
if [ "$ready" != true ];then docker logs "$container";exit 1;fi
for sql in tests/postgres-bootstrap.sql supabase/schema.sql supabase/002_runtime.sql tests/postgres-policies.sql;do
 docker exec -i "$container" psql -v ON_ERROR_STOP=1 -U postgres <"$sql"
done
