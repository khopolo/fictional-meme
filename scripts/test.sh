#!/usr/bin/env bash
set -euo pipefail
unset SUPABASE_URL SUPABASE_ANON_KEY SUPABASE_SERVICE_ROLE_KEY AI_API_KEY
export NODE_ENV=test
export OCR_CACHE_DIR="$PWD/.data"
mkdir -p "$OCR_CACHE_DIR"
export DATA_DIR="$(mktemp -d /tmp/docuflow-tests.XXXXXX)"
export PORT="$(node --input-type=module -e "import net from 'node:net';const s=net.createServer();s.listen(0,'127.0.0.1',()=>{console.log(s.address().port);s.close()})")"
node server/index.js >"$DATA_DIR/server.log" 2>&1 &
server_pid=$!
trap 'kill "$server_pid" 2>/dev/null || true; rm -rf "$DATA_DIR"' EXIT
ready=false
for i in {1..100}; do
 if curl --silent --fail "http://localhost:$PORT/api/config" >/dev/null; then ready=true; break; fi
 if ! kill -0 "$server_pid" 2>/dev/null; then cat "$DATA_DIR/server.log"; exit 1; fi
 sleep .1
done
if [ "$ready" != true ]; then cat "$DATA_DIR/server.log"; exit 1; fi
TEST_API_URL="http://localhost:$PORT/api" node --test tests/*.test.js
