---
name: wso2i-demo-skill
description: create demo videos for WSO2 integrator
---

# WSO2 Integrator Demo Creation

Your task is to create video tutorials to sell WSO2 Integrator.
1. Figure out how to implement the scenario using the Playwright Daemon. Create files in <cwd>
2. Write the transcript, play the transcript in local mode, play in gemini mode, record the transcript to produce the video

## WSO2 Integrator

- VS Code-based — Runs inside VS Code as an extension with a webview UI (guest frame) alongside VS Code's native chrome (host frame)
- Visual flow editor — You design service logic by adding nodes (Return, If, etc.) to an SVG-based flow diagram, connecting them visually
- Code generation — Behind the scenes it generates Ballerina (.bal) source code from the visual flow
- Connectors — Supports HTTP connections and others via a connector palette
- Integrated run/debug — Has "Run Integration" that compiles and runs the Ballerina project, starting an HTTP listener (default on localhost:9090). Run logs goes to terminal (not to output).
- Ships with a monitoring tool, WSO2 ICP.


## Named Daemons

```bash
node scripts/daemon.mjs <name> $(node scripts/guess-wso2-integrator-path.js)
```

Creates `/tmp/wso2i-<name>/` with `daemon.log`, `daemon.pid`, `daemon.port`, `exec.sh`, `user-data/`.

## Controlling the UI

Pipe JS into the session's `exec.sh`:

```bash
/tmp/wso2i-kafka-demo/exec.sh <<'EOF'
// JS here — return value is JSON-stringified, undefined → "ok", errors → stacktrace
EOF
```

### Playwright JS
Write Playwirte JS, use already written helper functions when ever possible. **Read** @scripts/helpers/index.md

### Multi-step Scripts

First try to do the scenario manually using the bash tool. Once you have a good overall idea, start creating step files.
Split the scenario into `01_xxx.step.js`, `02_xxx.step.js`, etc. Run all steps on a named daemon:

```bash
cat steps/*.step.js | /tmp/wso2i-s3-demo/exec.sh

cat steps/0[3-5]*.step.js | /tmp/wso2i-s3-demo/exec.sh
```

## Critical Rules

- **Mimic a real customer** — Think like a real user, goal is not just get it done somehow. If a real is not capable of completing the scenario you shouldn't either.
- **Throw away** - The projects we create are throwaway, just create as much as you like, start fresh if you are stuck.
- **Don't edit code** - MUST NOT edit code via the files system or via the UI's source view.  It's OK to look at it for verification. If you need to verify some Ballerina code, create a bal new file in /tmp and run it using `bal run`.
- **Mostly snapshots, rairly screenshots** - relay on 

See [TRANSCRIPT.md](TRANSCRIPT.md) **after** you completed all the step files and ran them end-to-end couple of time to verify.
