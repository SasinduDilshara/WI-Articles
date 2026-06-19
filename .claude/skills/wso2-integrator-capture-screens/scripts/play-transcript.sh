#!/bin/bash
# Usage: bash play-transcript.sh <voice> <transcript.js>
#   voice: "local" (macOS say) or "gemini" (Gemini TTS)
#   e.g. bash play-transcript.sh gemini examples/image-to-s3/transcript.js
#
# Starts a fresh daemon, runs the transcript, cleans up.
# Requires: ffmpeg, afplay. gemini voice also requires GEMINI_API_KEY.
set -e

VOICE="${1:?Usage: play-transcript.sh <local|gemini> <transcript.js>}"
case "$VOICE" in local|gemini) ;; *) echo "voice must be 'local' or 'gemini'"; exit 1;; esac

TESTBED=$(cd "$(dirname "$0")" && pwd)
TRANSCRIPT="${2:?Usage: play-transcript.sh <local|gemini> <transcript.js>}"
if [ -f "$TRANSCRIPT" ]; then TRANSCRIPT="$(cd "$(dirname "$TRANSCRIPT")" && pwd)/$(basename "$TRANSCRIPT")"
elif [ -f "$TESTBED/$TRANSCRIPT" ]; then TRANSCRIPT="$TESTBED/$TRANSCRIPT"
else echo "File not found: $TRANSCRIPT"; exit 1; fi

APP=$("$TESTBED/guess-wso2-integrator-path.js" 2>/dev/null || echo "/Applications/WSO2 Integrator.app/Contents/MacOS/Electron")
if [ "$VOICE" = "gemini" ]; then
  : "${GEMINI_API_KEY:?Set GEMINI_API_KEY}"
fi
export TRANSCRIPT_SAY="$VOICE"

pkill afplay 2>/dev/null || true
sleep 1

# Start daemon
echo "Starting daemon..."
cd "$TESTBED"
SESSION_NAME="play-$(date +%s)"
SESSION_DIR="/tmp/wso2i-$SESSION_NAME"
node daemon.mjs "$SESSION_NAME" "$APP" &
DAEMON_PID=$!
cleanup() { kill $DAEMON_PID 2>/dev/null || true; pkill afplay 2>/dev/null || true; }
trap cleanup EXIT

# Wait for ready
for i in $(seq 1 30); do
  [ -f "$SESSION_DIR/daemon.port" ] && break
  sleep 1
done
PORT=$(cat "$SESSION_DIR/daemon.port" 2>/dev/null)
[ -z "$PORT" ] && echo "Daemon failed to start" && exit 1
echo "Daemon ready on port $PORT (pid $DAEMON_PID)"
echo "Playing $TRANSCRIPT ..."

# Run transcript
curl -sf --max-time 1200 -X POST "http://127.0.0.1:$PORT" --data-binary @"$TRANSCRIPT"
echo
