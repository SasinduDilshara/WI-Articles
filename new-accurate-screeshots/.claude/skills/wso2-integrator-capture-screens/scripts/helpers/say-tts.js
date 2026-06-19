// TTS via Gemini, cached by text hash. say() starts playback, waitForSay() awaits finish.
//
// Context: fs, execSync, spawn, process, window (playwright)

const _ttsCacheDir = (() => {
  const d = (process.env.HOME || '/tmp') + '/.wso2i-tts-cache';
  try { fs.mkdirSync(d, {recursive: true}); } catch {}
  return d;
})();

const _ttsHash = (text) => {
  let h = 5381;
  for (let i = 0; i < text.length; i++) h = ((h << 5) + h + text.charCodeAt(i)) >>> 0;
  return h.toString(16);
};

const _ttsSynthesize = (text) => {
  const hash = _ttsHash(text);
  const wavPath = _ttsCacheDir + '/' + hash + '.wav';
  try {
    const st = fs.statSync(wavPath);
    if (st.size > 1000) return wavPath; // valid cache hit (empty wav header is ~78 bytes)
  } catch {}

  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) throw new Error('GEMINI_API_KEY not set');

  const prompt = "## Scene:\nA high-quality recording studio, expert talking casually into dynamic mics.\n\n## Sample Context:\nTech tutorial, Tone is energetic, conversational, and warm.\n\n## Transcript:\n" + text;

  const body = JSON.stringify({
    contents: [{role: "user", parts: [{text: prompt}]}],
    generationConfig: {
      responseModalities: ["audio"],
      temperature: 1,
      speech_config: {voice_config: {prebuilt_voice_config: {voice_name: "Orus"}}}
    }
  });

  const reqFile = _ttsCacheDir + '/' + hash + '.req.json';
  const respFile = _ttsCacheDir + '/' + hash + '.resp.json';
  const pcmFile = _ttsCacheDir + '/' + hash + '.pcm';
  fs.writeFileSync(reqFile, body);

  const url = 'https://generativelanguage.googleapis.com/v1beta/models/gemini-3.1-flash-tts-preview:generateContent?key=' + apiKey;
  execSync('curl -sf -X POST -H "Content-Type: application/json" "' + url + '" -d @' + reqFile + ' -o ' + respFile, {timeout: 300000});

  // Check for API errors
  const respHead = fs.readFileSync(respFile, 'utf8').slice(0, 200);
  if (respHead.includes('"error"')) {
    const msg = respHead.match(/"message":\s*"([^"]+)"/)?.[1] || 'unknown API error';
    try { fs.unlinkSync(reqFile); } catch {}
    try { fs.unlinkSync(respFile); } catch {}
    throw new Error('TTS API error: ' + msg);
  }

  // Decode base64 PCM chunks via a child node script (Buffer unavailable in vm context)
  const decodeScript = _ttsCacheDir + '/_decode.js';
  fs.writeFileSync(decodeScript,
    'const f=require("fs");' +
    'let c=JSON.parse(f.readFileSync(process.argv[2],"utf8"));' +
    'if(!Array.isArray(c))c=[c];' +
    'const b=[];for(const x of c)for(const p of x.candidates?.[0]?.content?.parts||[])' +
    'if(p.inlineData?.data)b.push(Buffer.from(p.inlineData.data,"base64"));' +
    'f.writeFileSync(process.argv[3],Buffer.concat(b));'
  );
  execSync('node ' + decodeScript + ' ' + respFile + ' ' + pcmFile, {timeout: 10000});

  execSync('ffmpeg -y -loglevel error -f s16le -ar 24000 -ac 1 -i ' + pcmFile + ' ' + wavPath, {timeout: 10000});

  try { fs.unlinkSync(reqFile); } catch {}
  try { fs.unlinkSync(respFile); } catch {}
  try { fs.unlinkSync(pcmFile); } catch {}

  return wavPath;
};

let _sayDone = Promise.resolve();
let _sayProc = null;
let _sayLog = [];  // [{t, wav}] — timestamp + wav path for each say() call
let _sayT0 = 0;
let _sayLogFile = null;

globalThis.sayInit = () => {
  _sayT0 = Date.now();
  _sayLog = [];
  _sayLogFile = (process.env.TMPDIR || '/tmp') + '/saylog.jsonl';
  try { fs.writeFileSync(_sayLogFile, ''); } catch {}
  try { globalThis.highlightInit?.(); } catch {}
};

globalThis.say = (text) => {
  const useLocal = process.env.TRANSCRIPT_SAY === 'local';
  const entry = { t: Date.now() - _sayT0, text: text.slice(0, 80) };
  if (useLocal) {
    _sayDone = new Promise((resolve) => {
      _sayProc = spawn('say', [text]);
      _sayProc.on('close', () => { _sayProc = null; resolve(); });
      _sayProc.on('error', () => { _sayProc = null; resolve(); });
    });
  } else {
    const wavPath = _ttsSynthesize(text);
    entry.wav = wavPath;
    _sayDone = new Promise((resolve) => {
      _sayProc = spawn('afplay', [wavPath]);
      _sayProc.on('close', () => { _sayProc = null; resolve(); });
      _sayProc.on('error', () => { _sayProc = null; resolve(); });
    });
  }
  _sayLog.push(entry);
  if (_sayLogFile) try { fs.appendFileSync(_sayLogFile, JSON.stringify(entry) + '\n'); } catch {}
};

globalThis.waitForSay = async () => {
  const start = Date.now();
  await _sayDone;
  const waited = Date.now() - start;
  if (waited > 50) console.log(`[waitForSay] waited ${waited}ms`);
  return waited;
};

globalThis.stopSay = () => {
  if (_sayProc) { _sayProc.kill(); _sayProc = null; }
  _sayDone = Promise.resolve();
};

globalThis.sayDump = () => JSON.parse(JSON.stringify(_sayLog));
