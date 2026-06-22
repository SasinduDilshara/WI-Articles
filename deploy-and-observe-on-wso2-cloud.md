# Deploy and Observe Your AI Agent on WSO2 Cloud

## Introduction

Across this series your VoltMart Support Assistant grew from a blank machine into a real, capable AI agent. In [part 1](build-first-ai-integration.md) it learned to answer policy questions from a knowledge base and step back when a request was beyond its remit. In [part 2](connect-live-data-with-mcp.md) it gained a live orders backend over **MCP**, so it could look up, create, and cancel real orders. In [part 3](push-live-notifications-with-webhooks.md) it learned to file a return and **push a live alert** to the team the instant it did.

There's just one thing left, and it's the thing that turns a tutorial into a product: it all still runs on your laptop. The moment you close the IDE, the agent is gone. To put it in front of real customers it needs to run somewhere always-on, and — just as importantly — you need to be able to *see what it's doing* once it's there. An agent makes decisions on its own; shipping one you can't observe is shipping one you can't trust.

That's what this final part is about. We'll take the very same agent — and the orders service and returns receiver it depends on — and **deploy it to [WSO2 Cloud](https://wso2.com/integration-platform/docs/deploy/cloud/overview)**, the managed runtime for the WSO2 Integration Platform. Then we'll **observe it** two ways: the built-in **agent trace viewer** while you build, which shows every tool call and LLM decision in real time, and **WSO2 Cloud's observability** once it's live — runtime logs, metrics, alerts, and distributed traces.

If you've followed parts 1 through 3, you have everything you need. Let's ship it.

---

## What we are going to do

This part has two acts, deploy and observe, and a short prep step before them:

1. **Make it production-ready.** A few things that were fine on localhost aren't fine in the cloud. We switch the agent off the development-only WSO2 model provider and onto **Azure OpenAI**, move the orders database off Docker and onto a **managed database**, and replace every hardcoded `localhost` URL with a **configurable** so the same build can run in any environment.
2. **Deploy to WSO2 Cloud.** We push all three integrations — the **agent**, the **orders MCP service**, and the **returns-team receiver** — to WSO2 Cloud straight from the IDE, set their configuration and secrets per environment, wire them to each other by their cloud endpoints, and promote from **Development** to **Production**.
3. **Observe the agent.** First in development, with the built-in **agent execution trace viewer** that lays out the agent's tool calls, LLM calls, and token usage span by span. Then in production, with the WSO2 Cloud console's **runtime logs, metrics, alerts**, and **OpenTelemetry-based distributed tracing**.

By the end you'll have the same VoltMart agent running as a managed cloud service, and a clear window into every decision it makes — in dev and in production.

### Architecture

![VoltMart on WSO2 Cloud: the three integrations from parts 1–3 — the AI agent, the orders MCP service, and the returns-team receiver — now run as managed components in a WSO2 Cloud project, each deployed from Git into a Development and a Production environment. The agent calls Azure OpenAI for its LLM, the cloud RAG service for policy retrieval, and the orders MCP service over its cloud endpoint; the orders service reads and writes a managed PostgreSQL database and POSTs return events to the receiver. The WSO2 Cloud observability plane collects runtime logs, metrics, and OpenTelemetry traces from all three components, while the IDE's agent trace viewer shows tool calls and LLM calls during development.](voltmart-deploy-observe/architecture.png)

> 📝 **Diagram note:** the figure should show one **WSO2 Cloud project** containing three deployed components (agent, orders MCP service, returns receiver), each spanning a **Development** and **Production** environment and built from a **Git repository**; the agent's outbound calls to **Azure OpenAI**, the **managed database** behind the orders service, the **webhook** to the receiver, and a side panel for **observability** (logs, metrics, traces) fed by all three. The dev-time **agent trace viewer** sits beside the IDE, separate from the cloud.

Nothing about the agent's *logic* changes in this part — the system prompt, the tools, and the MCP wiring are exactly what you built in parts 1–3. What changes is *where it runs* and *how you watch it*.

---

## Prerequisites

You'll need everything from the earlier parts, plus a couple of cloud-side accounts:

- **The three projects from parts 1–3** — the `voltmart-support` agent, the `orders-service` MCP service, and the `notifications-receiver`. We deploy them as-is (with the small production tweaks in Part A).
- **A WSO2 Cloud account.** If you don't have one yet, follow [Sign up and sign in](https://wso2.com/integration-platform/docs/get-started/setup/sign-up-sign-in). The console lives at `https://console.devant.dev`.
- **An Azure OpenAI resource** with a deployed chat model (e.g. a GPT-4-class deployment). You'll need its **endpoint URL**, an **API key**, the **deployment name**, and an **API version**. (Prefer OpenAI or Anthropic? The steps are identical — just pick that provider's form instead. See [Model providers](https://wso2.com/integration-platform/docs/genai/develop/components/model-providers).)
- A **Git account** (GitHub is the smoothest — one-click authorization; GitLab, Bitbucket, and Azure DevOps work too with credentials added at the organization level). WSO2 Cloud builds from a repository, so your projects will be pushed to Git as part of deploying.

You won't need Docker in the cloud — the throwaway PostgreSQL container from part 2 is replaced by a managed database in Part A.

> 💡 **A note on the WSO2 Integrator version.** The agent trace viewer and evaluation features used in the *observe* half ship with **WSO2 Integrator 5.0.0** and later. If you don't see the **Tracing** toggle described below, update your WSO2 Integrator install.

---

## Part A — Make it production-ready

Three things that were perfectly fine for local development need to change before this runs in the cloud. None of them touch the agent's behaviour — they're all about credentials, durability, and not hardcoding addresses.

### Step A.1 — Switch the agent to Azure OpenAI

Back in [part 1](build-first-ai-integration.md#step-13--configure-the-model-for-the-ai-agent) we built and tested on the **WSO2 default model provider**. That provider is meant **only for development and testing** — its access token can even expire mid-session. For production you switch to a model provider of your own, and here we'll use **Azure OpenAI**.

1. Open the `voltmart-support` project and the **AI Chat Agent**.
2. Click the **model provider icon** on the **AI Agent** node, then select **Create New Model Provider**.
3. Choose **Azure OpenAI** and fill in the form:
   - **Service URL** — the base URL of your Azure OpenAI resource, e.g. `https://your-resource.openai.azure.com`.
   - **API Key** — your Azure OpenAI API key.
   - **Deployment ID** — the deployment identifier you created in the Azure portal (the model name is implicit in the deployment).
   - **API Version** — e.g. `2023-07-01-preview`.
4. Attach it to the agent and **Save**.

> ⚠️ **Don't hardcode the key.** Store the **API Key** (and ideally the service URL and deployment ID) as **configurable values** rather than literals in the form, so the real secret lives outside your source and is supplied per environment in the cloud — exactly the configuration model WSO2 Cloud expects (see [Step B.3](#step-b3--set-configuration-and-secrets-per-environment)). WSO2 Integrator keeps these in `Config.toml`, which you keep out of Git.

The full provider list (Azure OpenAI, OpenAI, Anthropic, Google Vertex AI, Mistral, DeepSeek, Ollama, OpenRouter, and the dev-only WSO2 default) and each provider's fields are in [Model providers](https://wso2.com/integration-platform/docs/genai/develop/components/model-providers).

### Step A.2 — Move the orders database off Docker

In [part 2](connect-live-data-with-mcp.md#step-a2--stand-up-the-live-database-in-docker) the orders lived in a throwaway PostgreSQL container — great for a tutorial, gone the moment you run `docker compose down`. A deployed service needs a database that's always there. So point the `ordersDb` connection at a **managed database** instead of the local container.

1. Provision a managed PostgreSQL database — WSO2 Cloud offers fully managed PostgreSQL (the same managed-database capability you used for the RAG vector store in part 1; see [Managed vector databases](https://wso2.com/integration-platform/docs/manage/cloud/rag-ingestion/vector-databases)), or use any managed PostgreSQL your team already runs.
2. Apply the part-3 schema (`db/init.sql`) to it once, so the `orders` and `returns` tables and the seed rows exist.
3. In the `orders-service` project, open the **`ordersDb`** PostgreSQL connection and replace the local host/port/credentials with the managed database's — and, as with the model key, supply them through **configurables** so the production credentials never sit in source.

Nothing else in the orders service changes: the three MCP tools (`getStatus`, `createOrder`, `removeOrder`) and the part-3 `requestReturn` tool all reach the database through that one connection, so repointing it is the only move.

> 💡 Part 2 promised this would be easy: *"Swap the database — point the PostgreSQL connection at a managed database instead of the Docker one. Nothing else changes."* This is that step.

### Step A.3 — Replace every `localhost` with a configurable

This is the one that bites if you skip it. On your laptop the agent reached the orders service at `http://localhost:8290/mcp`, and the orders service reached the returns receiver at `http://localhost:9091/notifications`. In the cloud those addresses are meaningless — each integration runs as its own component with its own URL. So anything pointing at `localhost` must become a **configurable** you can set per environment.

Audit the three projects for hardcoded endpoints and make each one a configurable:

- **Agent → orders MCP service.** The MCP toolkit URL (`ordersMcpUrl` in part 2) must be a configurable. You'll set it to the orders service's cloud endpoint in [Step B.4](#step-b4--wire-the-services-together).
- **Agent → RAG service.** The `searchVoltMartPolicies` tool already calls the cloud **RAG service** over HTTP using its base URL and token (from [part 1, Step 2.4](build-first-ai-integration.md#step-24--expose-retrieval-as-an-api-with-a-rag-service)) — confirm those are configurables, not literals.
- **Orders service → returns receiver.** The `notifier` HTTP connection's base URL (part 3) must be a configurable, set to the receiver's cloud endpoint.

> 💡 **Why this matters.** WSO2 Cloud's whole deployment model is *build once, deploy many*: one build is promoted from Development to Production, and the **only** thing that differs between environments is the configuration injected at runtime. Hardcode a URL or a key and you've baked one environment into the image. Make it a configurable and the same build runs anywhere. See [WSO2 Cloud concepts](https://wso2.com/integration-platform/docs/get-started/concepts/integration-cloud-concepts).

Finally, confirm observability is compiled into each project — open each `Ballerina.toml` and check for:

```toml
[build-options]
observabilityIncluded = true
```

This flag includes the components that emit metrics and traces. It's on by default in these projects; we'll lean on it in the *observe* half. (More in [Step C.2](#step-c2--observe-the-deployed-agent-in-production).)

---

## Part B — Deploy to WSO2 Cloud

With the agent production-ready, deploying is mostly clicking. WSO2 Cloud builds your integration from a Git repository and runs it as a managed component — you don't manage servers, containers, or scaling. We'll deploy straight from the IDE; if you'd rather, you can [import an existing repository](https://wso2.com/integration-platform/docs/deploy/cloud/import-project) or build entirely in the browser-based [Cloud Editor](https://wso2.com/integration-platform/docs/deploy/cloud/deploy-from-cloud-editor) — same result.

> **A quick map of the concepts.** In WSO2 Cloud an **organization** holds your **projects**; a project holds your **integrations** (components); and each integration is deployed into **environments** — by default a **Development** and a **Production** one. A build is created once and *promoted* across environments, with configuration injected per environment. Full glossary: [WSO2 Cloud concepts](https://wso2.com/integration-platform/docs/get-started/concepts/integration-cloud-concepts).

### Step B.1 — Deploy each integration from the IDE

We have three integrations to deploy. The flow is the same for each; do the **orders MCP service** and the **returns receiver** first (the agent depends on them), then the agent.

1. Open the integration's **project overview** canvas in WSO2 Integrator.
2. In the **Deploy to WSO2 Cloud** box, click **Deploy**.
3. **Sign in** to WSO2 Cloud if prompted, and **select your organization** (or create one).
4. If the project isn't in Git yet, the IDE walks you through it: initialize the repository via **Source Control**, commit your files, and publish to GitHub (authorizing access when asked). WSO2 Cloud needs read access to the repository to build from it.
5. Click **Deploy All** to deploy the whole project (or open a single integration's overview and click **Deploy** to do just one).

WSO2 Cloud connects to the repository, **builds** the integration, and automatically **deploys it to the Development environment**. Repeat for all three projects.

[SCREENSHOT: The "Deploy to WSO2 Cloud" box on the project overview canvas, with the Deploy button.]

See [Deploy from the IDE](https://wso2.com/integration-platform/docs/deploy/cloud/push-from-ide) for the full walkthrough.

### Step B.2 — Watch the build

A deploy kicks off a build pipeline — it turns your source into a container image, scans it, and pushes it to the registry before deploying. You can follow it in the console:

1. Open the component in the WSO2 Cloud console.
2. Go to the **Build** page and, if needed, click **Build Latest** to trigger a build.
3. Click **View Details** next to a build to see its logs.

When the build succeeds, the component shows as deployed in **Development**. If a build fails, the logs here are the first place to look (and you can set a **build-failure alert** later — see [Step C.2](#step-c2--observe-the-deployed-agent-in-production)).

### Step B.3 — Set configuration and secrets per environment

Now we feed each component the configuration it needs — the values you turned into configurables in Part A. This is where the Azure key, the database credentials, the RAG token, and the inter-service URLs live, encrypted and separate from your code.

1. Open a component and go to its **Deploy** page.
2. In the environment card, click **Manage Configs and Secrets**.
3. Add each value under **Environment Variables** (and mark sensitive ones — the Azure API key, the database password, the RAG token — as **secrets**). You can also mount a config file under **File Mount** if you prefer to supply a whole `Config.toml`.
4. Click **Save and Deploy** to roll the values into the running component.

Do this for each component:

- **Agent:** Azure OpenAI service URL / key / deployment / API version, the RAG service base URL and token, the vector-store and embedding credentials, and `ordersMcpUrl` (set in the next step).
- **Orders service:** the managed database host/port/database/user/password, and the `notifier` base URL (next step).
- **Receiver:** any settings it needs (it mostly just listens).

> 💡 **Configs and secrets are environment-scoped.** The Development environment can point at a test database and a cheaper model deployment; Production can point at the real ones — same build, different injected values. All of it is **encrypted at rest and in transit**. See [WSO2 Cloud concepts](https://wso2.com/integration-platform/docs/get-started/concepts/integration-cloud-concepts).

[SCREENSHOT: The "Manage Configs and Secrets" panel with Environment Variables and a secret value.]

### Step B.4 — Wire the services together

On localhost the three integrations found each other at `localhost:8290` and `localhost:9091`. In the cloud each deployed integration exposes its own **endpoint URL**, so we point the configurables at those.

1. Open the deployed **orders MCP service**, find its endpoint URL, and set the agent's `ordersMcpUrl` configurable to it (the MCP base path, e.g. `…/mcp`).
2. Open the deployed **returns receiver**, find its endpoint URL, and set the orders service's `notifier` base URL configurable to it.
3. Save and redeploy the components whose configuration you changed.

Because services in the same project can reach one another over an internal (project-scoped) endpoint, you can keep the orders service and receiver off the public internet and expose only what needs to be public. Each endpoint has a **visibility** setting — **Project**, **Organization**, or **Public** — so you choose exactly how reachable each component is.

> ⚠️ **Confirm the exact endpoint URLs against your console.** The endpoint URL generally follows the shape `<domain>/<project>/<component>/<endpoint>`, but the precise URL (and whether you use a public or project-internal address for service-to-service calls) is shown on **your** deployed component's page in the console. Copy the real values from there — don't assume the path. This is the cloud equivalent of the `<RAG_SERVICE_BASE_URL>` placeholders you filled in back in part 1.

### Step B.5 — Promote to Production

Everything so far landed in **Development** — your safe place to test. When you're happy, promote each component to **Production**:

1. On the component's **Deploy** page, open the **Development** environment card.
2. Click **Promote**.
3. Confirm the Production environment's configuration (it has its own configs and secrets — set the production database, the production Azure deployment, and the production inter-service URLs here).

Promotion reuses the build you already tested in Development — *build once, deploy many* — so what you verified is exactly what goes live. The Production component shows **Active** once it's up.

### Step B.6 — Talk to the deployed agent

The agent now runs as a managed service with its own endpoint. To call it you need its URL and a credential.

1. On the agent component, find its **endpoint URL**.
2. Deployed endpoints are secured — depending on how you expose it, you'll authenticate with an **API key** or **OAuth2**. For a quick test, use the console's built-in test console: click **Get Test Key** (or **Generate Token**) to mint a short-lived token, and either invoke it inline or copy the generated **cURL**.

A call looks just like the local ones from earlier parts, but against the cloud URL and with the auth header — **replace the `<...>` placeholders with your own values**:

```bash
curl -X POST "<AGENT_ENDPOINT_URL>/voltMartAssistant/chat" \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer <TEST_TOKEN>" \
  -d '{
    "sessionId": "cloud-1",
    "message": "How long do I have to return something?"
  }'
```

A successful response is the same JSON you saw locally — only now it came from the cloud:

```json
{
  "message": "You have 30 days from the delivery date to return most items, as long as they're in their original packaging with all accessories. Want me to walk you through starting a return?"
}
```

> ⚠️ **Test keys are for testing.** The **Get Test Key** token is meant for development checks, not production traffic. For real clients, set up proper API-key or OAuth2 credentials and (for the internal services) keep their endpoints project-scoped.

That's the deploy done. The same agent, the same orders service, the same receiver — now running always-on in WSO2 Cloud, talking to Azure OpenAI and a managed database. Next we make it *observable*.

---

## Part C — Observe your agent

An agent decides things on its own — which tool to call, whether to call one at all, what to say when a tool comes back empty. When something looks off (it answered without searching the knowledge base; it called `getStatus` before asking for the email), you don't want to guess. Observability is how you *see* those decisions. We'll use it at two stages: while you build (the agent trace viewer), and once it's live (WSO2 Cloud's observability).

### Step C.1 — Observe in development with the agent trace viewer

WSO2 Integrator has a built-in, dev-time **trace viewer** that records exactly what the agent does on each turn — every LLM call and every tool call — and lays it out as a timeline. It runs locally alongside the IDE; there's nothing to deploy. This is the fastest way to understand and debug the agent before it ever reaches the cloud.

**Turn tracing on.** On the **AI Chat Agent** canvas, click the **Tracing** toggle in the top-right corner so it reads **Tracing: On**. (For an inline agent, run **Ballerina: Enable Tracing** from the command palette — `Cmd/Ctrl + Shift + P`.)

**Chat, then open the trace.** Run the agent and send it a message from the **Chat** panel. Below each reply a **View Trace** link appears; click it. (A **Session Traces** button in the chat header lists every trace in the session, and an **Execution Steps (n)** dropdown summarizes the Chat and tool spans for that turn.) You can also open the **Traces** panel directly with `Cmd/Ctrl + J` and use the **agent filter** to show only agent traces.

**Read the timeline.** The trace lays out the turn as a tree of **spans**:

- An **Invoke Agent** span at the top — the whole turn, with aggregate latency and total input/output tokens.
- One or more **Chat** spans — the calls to the LLM (now Azure OpenAI). Each shows latency, **input/output token counts**, temperature, provider, and model, and — in its Input/Output sections — the messages sent to the model, the **tool definitions** it was offered, and the model's response **including which tool it chose to call**.
- **Execute Tool** spans — the actual tool runs. For VoltMart these are exactly the tools you built: `searchVoltMartPolicies`, `getStatus`, `createOrder`, `removeOrder`, and `requestReturn`. Each span shows the **arguments passed in** and the **value returned** — so you can see, for instance, `getStatus` receiving `10432` / `jordan@example.com` and returning the live status line, or `searchVoltMartPolicies` returning `NO_POLICY_FOUND`.

Switch any Input/Output section between **Formatted** and **JSON**, search within a span, and view the spans as a **Timeline** (Gantt-style) to see where the time actually went.

This is the answer to *"why did the agent do that?"* You can watch it decide to call `searchVoltMartPolicies` first for a policy question, see the exact grounding text it got back, and confirm it answered only from that — or catch it skipping the tool and fix the system prompt. It's the same decisions you reasoned about in parts 1–3, now laid out in front of you.

[SCREENSHOT: The agent trace viewer — the Invoke Agent → Chat → Execute Tool span timeline for a return request, with token counts and the requestReturn arguments.]

**From a trace to a test.** Each trace can be exported: click the download icon and choose **Export as JSON**, or **Export as Evalset** to turn a real conversation into a test case. That feeds the **[Evaluations](https://wso2.com/integration-platform/docs/genai/develop/agents/evaluations)** framework — build a "golden" dataset from real runs and score the agent (correctness, tool selection, groundedness, safety, tone) before you change a prompt, swap a model, or add a tool. It's how you make sure a tweak that helps one case doesn't quietly break ten others — run the evalset and check the pass rate before you ship.

Full reference: [Agent observability](https://wso2.com/integration-platform/docs/genai/develop/agents/observability) and [Evaluations](https://wso2.com/integration-platform/docs/genai/develop/agents/evaluations).

> 💡 **Dev now, prod next.** The trace viewer is a *development* tool — it streams from a trace server running with the IDE. To watch the agent once it's deployed, you use WSO2 Cloud's observability, next. The two are complementary: the trace viewer is for understanding a single turn in depth; cloud observability is for watching the whole service in aggregate, around the clock.

### Step C.2 — Observe the deployed agent in production

Once the agent is live in WSO2 Cloud, the console gives you the three pillars of observability — **logs, metrics, and traces** — without any extra setup. Open the deployed component and look under **Observability**.

**Runtime logs.** Go to **Observability → Runtime Logs**. Every line your integrations log shows up here — including the `log:printInfo` calls you wrote, like the returns receiver's *"Returns team alerted"* message from part 3. Filter by **log level** (Error / Warn / Info / Debug), by **environment**, and by time, and search the content (Lucene query syntax). Gateway logs (HTTP method, path, status code, latency, correlation IDs) sit alongside the application logs. This is where you confirm a return actually fired its webhook in production, or find the stack trace behind a 500.

**Metrics.** The **Observability** dashboard charts the component's health over time — **requests per minute, latency, CPU and memory usage, data transfer**. The default window is the last 24 hours; click-and-drag on a graph to zoom into a spike, and the **Runtime Logs** view updates to the log lines from that exact moment — so you can jump from *"latency spiked at 3pm"* straight to *"here's what was happening at 3pm."*

**Alerts.** Don't wait to be told there's a problem — go to **Alerts → Create Alert Rule** and set thresholds. WSO2 Cloud supports **latency**, **traffic**, **resource** (CPU/memory), **log** (fire when a phrase recurs in the logs), and **build-failure** alerts, with up to 10 rules per integration and notifications to as many as 5 email addresses. A *log alert* on a repeated error phrase, or a *latency alert* on the agent's response time, is a good first line of defence.

**Distributed tracing.** Because you compiled with `observabilityIncluded = true`, each integration emits **OpenTelemetry** traces. A single customer request can cross all three components — agent → orders MCP service → database, then → webhook → receiver — and distributed tracing stitches those hops into one end-to-end trace, so you can see where latency or an error actually lives. You can export these traces to an OpenTelemetry-compatible backend such as **Jaeger**, **Zipkin**, **New Relic**, or **Datadog**; the setup (import the provider, set `tracingEnabled`/`tracingProvider` in `Config.toml`) is in [Jaeger distributed tracing](https://wso2.com/integration-platform/docs/deploy-operate/observe/jaeger-distributed-tracing) and the [observability overview](https://wso2.com/integration-platform/docs/deploy-operate/observe/observability-overview).

> 💡 **Logs are only as good as what you log.** The explicit signals you designed across the series — `NO_POLICY_FOUND`, `VERIFICATION_FAILED`, `RETURN_WINDOW_CLOSED`, and the receiver's *"Returns team alerted"* line — aren't just for the agent to read; they're exactly the phrases that make production logs searchable and alertable. Well-chosen log lines pay off twice.

The full menu of observability options — the WSO2 Cloud built-ins, plus self-hosted Prometheus/Jaeger/Zipkin and commercial New Relic/Datadog/Moesif — is in the [observability overview](https://wso2.com/integration-platform/docs/deploy-operate/observe/observability-overview), [metrics](https://wso2.com/integration-platform/docs/deploy-operate/observe/metrics-overview), and [logging](https://wso2.com/integration-platform/docs/deploy-operate/observe/logging-overview) docs.

---

## Take it for a spin

Let's prove the whole thing end to end, watching it light up in observability as it runs. With the three components **Active** in Production and their configs wired up, send the agent a return request — the part-3 scenario — against the cloud endpoint:

```bash
curl -X POST "<AGENT_ENDPOINT_URL>/voltMartAssistant/chat" \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer <TEST_TOKEN>" \
  -d '{
    "sessionId": "cloud-ret-1",
    "message": "I want to return order #10219, it arrived damaged. My email is sam@example.com."
  }'
```

**Agent output:**

```json
{
  "message": "Done — I've filed return request RMA-1 for order #10219 (VoltBook 14 laptop). Our returns team has been notified and will email you next steps within one business day. I can't approve a refund myself, but the team reviews every request."
}
```

Now watch where that single request shows up:

- **In the agent trace viewer (if you reproduce it in dev):** an **Invoke Agent** span containing a **Chat** span where the model chose `requestReturn`, and an **Execute Tool** span showing the `orderNumber` / `accountEmail` / `reason` arguments and the `RMA-1` confirmation it returned.
- **In the orders service's runtime logs (Production):** the tool's database insert and the outbound webhook POST.
- **In the receiver's runtime logs (Production):** the *"Returns team alerted"* line with `reference=RMA-1` — the same alert you saw in part 3's console, now in the cloud log stream.
- **In the metrics dashboards:** a tick on requests-per-minute for each component the request touched.

*Expected behavior:* the agent calls `requestReturn` over MCP exactly as it did locally, the database row is written, the webhook fires, and **every hop is visible** in logs, metrics, and traces. That's the whole point of this part — the agent does the same job it always did, and now you can see it doing it.

---

## You've shipped it — and you can see it run

Step back and look at the full arc of the series. You started with a blank machine and built an AI agent that:

- **answers** policy questions grounded in a knowledge base (part 1),
- **reads and writes** live order data over MCP (part 2),
- **acts** on a customer's request and **pushes** a live alert the instant it does (part 3), and now
- **runs in production** on WSO2 Cloud, on your own model provider and a managed database, with **full observability** into every tool call and decision (part 4).

That last step is what separates a demo from a service. The agent's logic never changed in this part — what changed is that it's now always-on, configured per environment from a single tested build, and *transparent*: you can watch a single turn in the trace viewer while you build, and watch the whole fleet in the cloud console once it's live. An agent you can observe is an agent you can trust, improve, and safely put in front of customers.

That's the series, end to end: you now have an AI agent that doesn't just talk, but acts within its bounds, reaches the right people the moment something happens — and runs, observably, in production. Go build your own, and ship it.

---
