# Creating Transcripts from Steps

Transcripts convert test steps into narrated tutorials. They use the same daemon and helpers — no separate daemon needed.
**MUST NOT** create the transcript until you thoroughly test the steps.

## Converting steps to a transcript


### Creating `transcript.js`

**Inline the helpers** - rather than calling them as black boxes. This lets you add narration between individual UI actions (e.g. between clicking "Create" and filling a form). A single `createProjectAndIntegration` call is fine for tests but too coarse for a tutorial — the viewer sees nothing happen for 10 seconds.

**Unroll** - any loops and function calls, basically transcript must be a single long flow, this allows us to inject narrations. In transcript, repititiveness is actually good.

- **Meaningful names** — use descriptive names like `ImageUploader`, `S3Upload`, `s3Client`. Timestamp-suffixed names (`ImgS3${Date.now()}`) are fine for tests but wrong for tutorials.

- **Error cleanup** — wrap the whole transcript in `try { ... } catch (e) { stopSay(); throw e }` so audio stops on failure.

- **Window reloads** — VS Code reloads when opening a new workspace (e.g. after creating a project). Add `await ensureWindow()` and `await waitForGuest()` after actions that trigger reloads.

Don't add say() just yet

### Gathering Screenshots

Inject temporary screenshot taking at key points of the transcript. Save them with meaning full names. When successfully captured, comment out the screenshot taking code.
Use `window.screenshot`

### Injecting `say`

Look at the transcript and inject say blocks. Try to tell a story, think about typical story arcs such as "Three-Act Structure", "Hero's Journey".
Rearrange transcript.js (without braking the functionally) so the story flows better.

Following three functions are available in the VM context:

- **`say(text)`** — Synthesizes speech via Gemini TTS and starts playback. Synthesis is cached by text hash in `~/.wso2i-tts-cache/` so reruns are instant.
- **`waitForSay()`** — Returns a promise that resolves when playback finishes.
- **`stopSay()`** — Kills any in-progress playback. Use in error handlers.

Pattern: `say()` starts narration, automation runs *while audio plays*, `waitForSay()` blocks until the narration ends before the next segment. You may use tags such as `[excited]` `[jokingly]` in text.

eg:
```js
say("I'll name the integration ImageUploader and the project S3Upload.")
await guestFill(guestFrame.getByRole('textbox', {name: /Integration Name/i}), 'ImageUploader')
await guestFill(guestFrame.getByRole('textbox', {name: /Project Name/i}), 'S3Upload')
await waitForSay()
```

### Injecting `highlight`

Use highlights to direct the viewer's eye to the exact UI element being discussed. Pass the element you want highlighted; don't focus too narrowly on a text box if the viewer needs the label too — pass the field wrapper or form row instead.

Available helpers:

- **`highlighted(target)`** — Draws a floating rectangle around the exact Playwright locator or element handle passed.
- **`resetHighlight()`** — Removes the current highlight.

You can't blindly inject these since we don't know the parent elements, you MUST manually execute up the point, look a snapshot, figure out what to highlight, highlight it, take a screenshot, adjust as needed, keep going.

Highlight events are logged to `/tmp/hightlight-log.jsonl` with `t`, `action`, `x`, `y`, `width`, and `height`. The timestamp uses the same start point as `sayInit()`, so the log can be stitched into playback later.

Pattern:
```js
say("This is where I choose the project name.")
const projectName = guestFrame.getByRole('textbox', {name: /Project Name/i})
const projectNameField = guestFrame.locator('vscode-text-field[aria-label="Project Name*"]')
await highlighted(projectNameField)
await guestFill(projectName, 'S3Upload')
await waitForSay()
await resetHighlight()
```

## Running

`play-transcript.sh` is self-contained — it kills any old daemon, starts a fresh one, runs the transcript, and cleans up on exit:
```bash
# With Gemini TTS
GEMINI_API_KEY="..." bash scripts/play-transcript.sh gemini examples/image-to-s3/transcript.js
# With macOS local say
bash scripts/play-transcript.sh local examples/image-to-s3/transcript.js
```

## Requirements

- `GEMINI_API_KEY` — for Gemini TTS (`gemini-2.5-pro-preview-tts`)
- `ffmpeg` — converts raw PCM to WAV
- `afplay` — macOS audio playback (swap for `aplay`/`ffplay` on Linux)

## Caching

TTS results are cached as `.wav` files in `~/.wso2i-tts-cache/`, keyed by a hash of the text. Delete the cache dir to force re-synthesis.

## Example

See `examples/image-to-s3/transcript.js`.
```bash
GEMINI_API_KEY="..." bash scripts/play-transcript.sh gemini examples/image-to-s3/transcript.js
```
