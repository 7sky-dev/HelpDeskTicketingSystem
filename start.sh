#!/usr/bin/env bash
# Starts the whole HelpDesk Ticketing System (MongoDB + Next.js + bot daemon).
# Everything is torn down automatically when you press Ctrl+C or close this terminal.
set -uo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$ROOT" || exit 1

# Make user-local binaries discoverable (e.g. MongoDB installed under ~/.local/share/mongodb).
case ":$PATH:" in
  *":$HOME/.local/bin:"*) ;;
  *) PATH="$HOME/.local/bin:$PATH" ;;
esac
export PATH

APP_PORT="${APP_PORT:-3000}"
BOT_PORT="${BOT_PORT:-3001}"
MONGO_PORT="${MONGO_PORT:-27017}"

declare -a SVC_NAME=()
declare -a SVC_PID=()

log()  { printf '\033[1;36m[start]\033[0m %s\n' "$*"; }
warn() { printf '\033[1;33m[start]\033[0m %s\n' "$*" >&2; }
err()  { printf '\033[1;31m[start]\033[0m %s\n' "$*" >&2; }

port_busy() { timeout 1 bash -c "exec 3<>/dev/tcp/127.0.0.1/$1" 2>/dev/null; }

wait_for_port() {
  local port="$1" name="$2" tries="${3:-60}"
  for ((i = 0; i < tries; i++)); do
    port_busy "$port" && return 0
    sleep 0.5
  done
  err "$name did not open port $port in time."
  return 1
}

start_service() {
  local name="$1"; shift
  "$@" > >(sed -u "s/^/[$name] /") 2>&1 &
  SVC_NAME+=("$name")
  SVC_PID+=("$!")
  log "$name started (pid ${SVC_PID[-1]})"
}

# Kill a pid and every descendant it spawned (npm -> next -> workers, etc.).
stop_tree() {
  local pid="$1" sig="${2:-TERM}" child
  for child in $(pgrep -P "$pid" 2>/dev/null); do
    stop_tree "$child" "$sig"
  done
  kill -s "$sig" "$pid" 2>/dev/null || true
}

cleanup() {
  trap - EXIT INT TERM HUP
  echo
  log "Shutting everything down..."
  local i
  for i in "${!SVC_PID[@]}"; do
    if kill -0 "${SVC_PID[$i]}" 2>/dev/null; then
      log "stopping ${SVC_NAME[$i]} (pid ${SVC_PID[$i]})"
      stop_tree "${SVC_PID[$i]}" TERM
    fi
  done

  # give services a moment to exit gracefully, then force-kill what is left
  local deadline=$((SECONDS + 8)) alive
  while ((SECONDS < deadline)); do
    alive=0
    for i in "${!SVC_PID[@]}"; do
      kill -0 "${SVC_PID[$i]}" 2>/dev/null && alive=1
    done
    ((alive == 0)) && break
    sleep 0.3
  done
  for i in "${!SVC_PID[@]}"; do
    if kill -0 "${SVC_PID[$i]}" 2>/dev/null; then
      warn "force-killing ${SVC_NAME[$i]}"
      stop_tree "${SVC_PID[$i]}" KILL
    fi
  done

  wait 2>/dev/null || true
  log "All services stopped."
}

# Terminal closed (SIGHUP) or Ctrl+C (SIGINT) -> exit so the EXIT trap runs cleanup.
trap 'exit 129' HUP
trap 'exit 130' INT
trap 'exit 143' TERM
trap cleanup EXIT

start_mongodb() {
  if [[ -n "${MONGODB_URI:-}" ]]; then
    log "Using MongoDB from MONGODB_URI"
    return 0
  fi
  if port_busy "$MONGO_PORT"; then
    log "MongoDB already running on port $MONGO_PORT"
    return 0
  fi
  if command -v mongod >/dev/null 2>&1; then
    mkdir -p "$ROOT/.data/mongodb"
    log "Starting local MongoDB ($ROOT/.data/mongodb)"
    start_service mongodb mongod \
      --dbpath "$ROOT/.data/mongodb" \
      --bind_ip 127.0.0.1 \
      --port "$MONGO_PORT" \
      --logpath "$ROOT/.data/mongodb/mongod.log"
    wait_for_port "$MONGO_PORT" "MongoDB" 60 || return 1
    log "MongoDB is ready"
  else
    warn "No MongoDB: 'mongod' is not installed and nothing is listening on port $MONGO_PORT."
    warn "The app will start, but every DB-backed page/API call will fail."
    warn "Install MongoDB or set MONGODB_URI to a reachable instance."
  fi
}

# ---------------------------------------------------------------- preflight
if [[ ! -d node_modules ]]; then
  log "node_modules missing - installing dependencies..."
  npm install || { err "npm install failed"; exit 1; }
fi

for p in "$APP_PORT" "$BOT_PORT"; do
  if port_busy "$p"; then
    err "Port $p is already in use - stop the other process first (lsof -i :$p)."
    exit 1
  fi
done

start_mongodb || exit 1

# ---------------------------------------------------------------- services
log "Starting Next.js dev server..."
start_service web npm run dev -- -p "$APP_PORT"
wait_for_port "$APP_PORT" "Next.js" 120 || exit 1

log "Starting bot daemon (Discord + Telegram + HTTP bridge)..."
start_service bot env BOT_PORT="$BOT_PORT" node bot/index.js
wait_for_port "$BOT_PORT" "Bot bridge" 30 || exit 1

echo
echo "------------------------------------------------------------"
echo " HelpDesk Ticketing System is up"
echo "   Web : http://localhost:$APP_PORT"
echo "   Bot : http://localhost:$BOT_PORT"
echo "   Stop: press Ctrl+C or close this terminal"
echo "------------------------------------------------------------"
echo

# ---------------------------------------------------------------- supervisor
# Poll the services: if one dies, take everything else down with it.
while :; do
  for i in "${!SVC_PID[@]}"; do
    if ! kill -0 "${SVC_PID[$i]}" 2>/dev/null; then
      err "${SVC_NAME[$i]} exited unexpectedly."
      exit 1
    fi
  done
  sleep 1
done
