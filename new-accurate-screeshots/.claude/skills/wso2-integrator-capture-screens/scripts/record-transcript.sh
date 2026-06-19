#!/bin/bash
# Record a transcript run as video with stitched TTS audio.
#
# Usage: bash record-transcript.sh examples/image-to-s3/transcript.js [output.mp4]
#
# 1. Starts daemon + Electron app
# 2. Finds the app window ID
# 3. Starts screencapture -v on that window (silent)
# 4. Runs the transcript (say() logs timestamps + wav paths)
# 5. Stops recording
# 6. Stitches cached TTS wavs at logged offsets → final mp4
#
# Requires: GEMINI_API_KEY, ffmpeg, jq
set -e

TESTBED=$(cd "$(dirname "$0")" && pwd)
TRANSCRIPT="${1:?Usage: record-transcript.sh <transcript.js> [output.mp4]}"
if [ -f "$TRANSCRIPT" ]; then TRANSCRIPT="$(cd "$(dirname "$TRANSCRIPT")" && pwd)/$(basename "$TRANSCRIPT")"
elif [ -f "$TESTBED/$TRANSCRIPT" ]; then TRANSCRIPT="$TESTBED/$TRANSCRIPT"
else echo "File not found: $TRANSCRIPT"; exit 1; fi
OUTPUT="${2:-$TESTBED/transcript.mp4}"
# Resolve to absolute path before we cd
case "$OUTPUT" in /*) ;; *) OUTPUT="$(pwd)/$OUTPUT" ;; esac

APP=$("$TESTBED/guess-wso2-integrator-path.js" 2>/dev/null || echo "/Applications/WSO2 Integrator.app/Contents/MacOS/Electron")
: "${GEMINI_API_KEY:?Set GEMINI_API_KEY}"

RAW_VIDEO="/tmp/transcript-raw.mov"
SAYLOG_FILE="/tmp/saylog.json"

cleanup() {
  [ -n "$REC_PID" ] && kill -INT "$REC_PID" 2>/dev/null || true
  [ -n "$DAEMON_PID" ] && kill "$DAEMON_PID" 2>/dev/null || true
  pkill afplay 2>/dev/null || true
}
trap cleanup EXIT

pkill afplay 2>/dev/null || true
sleep 1

# --- Start daemon ---
echo "Starting daemon..."
cd "$TESTBED"
SESSION_NAME="record-$(date +%s)"
SESSION_DIR="/tmp/wso2i-$SESSION_NAME"
node daemon.mjs "$SESSION_NAME" "$APP" &
DAEMON_PID=$!
for i in $(seq 1 30); do [ -f "$SESSION_DIR/daemon.port" ] && break; sleep 1; done
PORT=$(cat "$SESSION_DIR/daemon.port" 2>/dev/null)
[ -z "$PORT" ] && echo "Daemon failed to start" && exit 1
echo "Daemon ready on port $PORT (pid $DAEMON_PID)"

# --- Find window ID ---
echo "Finding app window..."
# Bring window to front
curl -sf --max-time 10 -X POST "http://127.0.0.1:$PORT" --data-binary 'await window.evaluate(() => window.focus()); "ok"' > /dev/null
sleep 1

WINID=$(swift -e '
import CoreGraphics
let list = CGWindowListCopyWindowInfo([.optionAll], kCGNullWindowID) as! [[String: Any]]
var best = 0
var bestArea = 0.0
for w in list {
    let owner = w["kCGWindowOwnerName"] as? String ?? ""
    guard owner == "WSO2 Integrator", let bounds = w["kCGWindowBounds"] as? [String: Double],
          let width = bounds["Width"], let height = bounds["Height"],
          let num = w["kCGWindowNumber"] as? Int else { continue }
    let area = width * height
    if area > bestArea { bestArea = area; best = num }
}
if best > 0 { print(best) }
' 2>/dev/null)
[ -z "$WINID" ] && echo "Could not find WSO2 Integrator window" && exit 1
echo "Window ID: $WINID"

# --- Start recording ---
rm -f "$RAW_VIDEO"
echo "Recording..."
screencapture -v -l "$WINID" "$RAW_VIDEO" &
REC_PID=$!
sleep 2  # let recording stabilize

# --- Run transcript ---
echo "Playing transcript..."
RESULT_FILE="/tmp/transcript-result.json"
curl -sf --max-time 1200 -X POST "http://127.0.0.1:$PORT" --data-binary @"$TRANSCRIPT" -o "$RESULT_FILE"
# Result file may have console.log lines before the final JSON line
RESULT=$(tail -1 "$RESULT_FILE")
echo "$RESULT" | jq -r '.response // .' 2>/dev/null || echo "$RESULT"

# --- Stop recording ---
sleep 1
kill -INT "$REC_PID" 2>/dev/null || true
wait "$REC_PID" 2>/dev/null || true
REC_PID=""
sleep 1
echo "Recording saved: $RAW_VIDEO"
ls -lh "$RAW_VIDEO"

# --- Stitch audio ---
# Try sayLog from result JSON; fall back to the jsonl file written by say()
SAYLOG_JSONL="${TMPDIR:-/tmp}/saylog.jsonl"
if echo "$RESULT" | jq -e '.sayLog' > /dev/null 2>&1; then
  echo "$RESULT" | jq -c '.sayLog' > "$SAYLOG_FILE"
else
  echo "sayLog not in result, using $SAYLOG_JSONL"
  jq -s '.' "$SAYLOG_JSONL" > "$SAYLOG_FILE"
fi
CLIP_COUNT=$(jq 'length' "$SAYLOG_FILE")
echo "Stitching $CLIP_COUNT audio clips..."

INPUTS="-i $RAW_VIDEO"
FILTER=""
AMIX=""

for i in $(seq 0 $((CLIP_COUNT - 1))); do
  WAV=$(jq -r ".[$i].wav" "$SAYLOG_FILE")
  T_MS=$(jq -r ".[$i].t" "$SAYLOG_FILE")
  INPUTS="$INPUTS -i $WAV"
  IDX=$((i + 1))
  FILTER="${FILTER}[${IDX}:a]adelay=${T_MS}|${T_MS},aresample=48000[a${i}];"
  AMIX="${AMIX}[a${i}]"
done
FILTER="${FILTER}${AMIX}amix=inputs=${CLIP_COUNT}:normalize=0[aout]"

ffmpeg -y $INPUTS \
  -filter_complex "$FILTER" \
  -map 0:v -map "[aout]" \
  -c:v libx264 -preset fast -crf 23 \
  -c:a aac -b:a 128k \
  -shortest "$OUTPUT" 2>&1 | tail -3

echo ""
echo "Done: $OUTPUT"
ls -lh "$OUTPUT"
ffprobe -hide_banner "$OUTPUT" 2>&1 | grep -E "Duration|Stream"
