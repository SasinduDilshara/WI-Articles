# Your First AI Agent on WSO2 Integrator - Customer Support Assistant

## Introduction

There is a massive buzz around AI agents right now. We are shifting into the agentic enterprise, a space where AI agents do much more than just talk—they think, grab real-time data, and actively run tasks across the software you already use. It is all about killing busywork and making our jobs significantly easier. Everything sounds perfect, right up until someone asks the hard question — `how do I actually build one without drowning in glue code and brittle SDKs?`

That's where [WSO2 Integrator](https://wso2.com/integration-platform/docs/genai/overview) comes in,
and makes it easy: AI agents, RAG, vector stores, and LLM providers come built in, wired
up with built-in connections in the same low-code editor you'd use for any integration, plus an
expert copilot for AI integrations. So you can build an AI agent that does real work, connected to real data and tools, with less effort and time.

Let's discover how to build your first AI agent on WSO2 Integrator, step by step, in this tutorial. No prior experience with AI agents is needed — just follow along and you'll have a working AI Agent at the end, plus the confidence to build your own.

---

## What we are going to build

In this tutorial you'll build a **Customer Support Assistant** — an **AI agent** running on **WSO2 Integrator** — for a fictional electronics shop called **VoltMart**, which sells headphones, speakers, laptops, and the usual accessories.

Like a lot of small stores, VoltMart has a tiny support team and an inbox flooded with the same routine questions every day: `How long do I have to return this? Is it still under warranty? What payment methods do you take?` — answered for the hundredth time this week, while the few cases that genuinely need a person get buried in the pile. The assistant solves exactly that: it sits at the front line of every customer conversation, answers the easy, well-defined questions on its own — grounded in VoltMart's own policy documents — and steps back the moment a request needs real judgement, politely pointing the customer to VoltMart's support team so staff spend their time only where it's truly needed.

You'll start from an empty machine and add one capability at a time, checking that each works before moving on. By the end you'll have a running assistant that acts as a front-line support agent.

> **This is part 1 of a four-part series.** Here we build the foundation: an agent that answers policy questions from a knowledge base and knows when to step back. In **[part 2](connect-live-data-with-mcp.md)** we connect it to a live orders backend over **MCP** (Model Context Protocol) so it can look up real order data, in **[part 3](push-live-notifications-with-webhooks.md)** we let it **file returns and push a live notification** to the team over a webhook, and in **[part 4](deploy-and-observe-on-wso2-cloud.md)** we **deploy it to WSO2 Cloud and observe** every decision it makes in production. Each part builds directly on the previous one.

### Architecture

![VoltMart Support Assistant architecture: a customer chats with the AI agent, which uses a system prompt and per-session memory to decide when to call its knowledge/RAG tool. The tool retrieves grounding passages over HTTP from the WSO2 Cloud RAG service, which queries a managed PostgreSQL vector database. A scheduled RAG ingestion automation in WSO2 Cloud loads the policy documents from cloud storage into that vector database.](voltmart-support/architecture.png)

> 📝 **Diagram note:** the figure above should be updated to show RAG as a cloud capability — a **scheduled ingestion automation** feeding a **managed PostgreSQL vector database**, and the agent's tool calling the **RAG service retrieval API** over HTTP — rather than an in-editor startup automation and in-memory knowledge base.

Everything centres on the **AI agent**. A customer's message comes in, and the agent — guided by
the instructions you give it — works out what the customer actually wants and routes the request
to the right place. Straightforward questions about **VoltMart's policies** (shipping, returns,
refunds, warranty, billing) it answers on its own, grounding every reply in VoltMart's own
documents rather than guessing. And when a request is beyond what it should decide alone, it steps
back, **declines politely, and points the customer to VoltMart's support team**. All the while it
remembers what's been said, so the customer never has to repeat themselves.

That foundation is exactly what this first article delivers end to end, and the parts that follow then
extend this very same agent. You'll learn how to build each piece in the steps that follow.

---

## Prerequisites: Getting your tools ready

Let's get your machine set up so the rest of the tutorial just flows.

### 1. Install WSO2 Integrator

1. Go to the [downloads page](https://wso2.com/products/downloads/?product=wso2integrator).
2. Refer to [Local setup](https://wso2.com/integration-platform/docs/get-started/setup/local-setup) to download and install the WSO2 Integrator on your machine.
3. Launch WSO2 Integrator.

[SCREENSHOT: WSO2 Integrator open on the welcome screen after launch.]

### 2. Sign up for WSO2 Cloud

Refer to [Sign up and sign in](https://wso2.com/integration-platform/docs/get-started/setup/sign-up-sign-in) to do so.

### 3. Get to know WSO2 Integrator Copilot, your AI assistant for building integrations

1. Get started with WSO2 Integrator Copilot: [Getting started](https://wso2.com/integration-platform/docs/develop/copilot/getting-started).
2. Learn what it can do: [Copilot capabilities](https://wso2.com/integration-platform/docs/develop/copilot/copilot-capabilities).
3. You can use the WSO2 Integrator Copilot to speed up your development by generating code snippets, configurations, and even entire artifacts based on natural language prompts. It understands the context of your project and can assist you in building your AI integrations more efficiently.

---

## Building the assistant, phase by phase

We'll build the Customer Support Assistant one capability at a time. Each phase adds a single,
self-contained piece, so you always know the last thing you added actually works before moving on.

### Phase 1 — Create the project and give your agent a personality

Every assistant starts as a blank slate. In this first phase we'll create the project, drop in an
AI agent, and — most importantly — tell it *who it is*.

#### Step 1.1 — Create the integration project

1. From the **Create New Integration** card, select **Create**.
2. Set **Integration Name** to `VoltMartSupport`.
3. Set **Project Name** to `voltmart-support`.
4. Select **Create Integration**.

[SCREENSHOT: The "Create New Integration" dialog with the name fields filled in.]

> 💡 **Hint (fastest path):** With the project created, you can let WSO2 Integrator Copilot do Steps 1.2–1.4 in one
> go. Click **Generate with AI** and add a proper descriptive prompt to create the "VoltMartAssistant" chat agent —
> using the default WSO2 model provider, exposed as an HTTP chat service, with VoltMart's customer support
> persona as its system prompt. Review the preview and click **Keep**.

> Prefer to build it by hand instead of using AI? Follow the steps below instead.

#### Step 1.2 — Add the AI Chat Agent

First of all let's create the skeleton of our AI Agent — the thing that will eventually become the VoltMart Support Assistant. It's just a blank agent for now, with no instructions and no tools. But it's the foundation we build on in the next steps.

1. In the design view, select **+ Add Artifact**.
2. Under **AI Integration**, select **AI Chat Agent**.
3. Set **Name** to `VoltMartAssistant`.
4. Select **Create**. (If you're not signed in to WSO2 Integrator Copilot, sign in when prompted.)

> **What you just got.** Once this is created, WSO2 Integrator creates a fully functional AI agent skeleton for
> you — out of the box it comes with a very naive system prompt, built-in AI agent memory, and an
> LLM backed by the default WSO2 model provider capabilities (see more in Step 1.3). In the steps
> that follow we'll dig deep into how to configure and change each of these components according to our use case.

 See [Creating an agent](https://wso2.com/integration-platform/docs/genai/develop/agents/creating-an-agent).

#### Step 1.3 — Configure the Model for the AI Agent

As mentioned above, your AI Agent is initialized with the [**WSO2 default model provider**](https://wso2.com/integration-platform/docs/genai/develop/components/model-providers#default-wso2-model-provider) — that's
the circle on the **AI Agent** node. This default provider is meant **only for building and testing
your project during the development phase.** When you deploy to production you must switch to a
proper model provider implementation of your own — such as **OpenAI, Azure OpenAI, or Anthropic**.

So you have two options here.

**Option A — Build and test with the WSO2 default model provider.**
This is the quickest way to get going: keep the default provider, build out the agent, and test it
locally. Because the WSO2 default provider is intended purely for testing, its access token can
**expire while you're testing**. If that happens, just re-issue it:

1. Open the command palette (`Cmd/Ctrl + Shift + P`).
2. Run **`Ballerina: Configure default WSO2 model provider`**.

For more details, refer to [Default WSO2 model provider](https://wso2.com/integration-platform/docs/genai/develop/components/model-providers#default-wso2-model-provider).

**Option B — Switch to your own model provider (before going to production).**
Once you've finished testing, change the model provider to a production-grade one. To do that:

1. Click the **model provider icon** on the **AI Agent** node.
2. Select **Create New Model Provider** (see
   [Where to find model providers in WSO2 Integrator](https://wso2.com/integration-platform/docs/genai/develop/components/model-providers#where-to-find-model-providers-for-llm)).
3. Choose the model provider that fits your use case (OpenAI, Azure OpenAI, Anthropic, etc.) and
   add it to the agent.

> **For this tutorial** we'll stay on the WSO2 default provider so you can build and test everything
> without an external API key. See the **Next steps** section for the full provider-switching walkthrough.

#### Step 1.4 — Tell your agent how to behave

An agent's behaviour is steered almost entirely by its system prompt — it's where you define the agent's persona, the scope it stays within, and the rules it follows when deciding what to do. The skeleton we created in [Step 1.2](#step-12--add-the-ai-chat-agent) starts with an empty one, so right now the agent will happily answer anything. We'll replace it with a prompt that turns it into a focused VoltMart support agent — one that knows what it's responsible for and where to draw the line.

Click the **AI Agent** node to open its configuration panel. Set:

- **Role:** `VoltMart Support Assistant`
- **Instructions:** Click the prompt editor button in the form, then paste in the prompt below.

```
You are the front-line support assistant for VoltMart, an online consumer-electronics store (headphones, speakers, laptops, and accessories). You are friendly, sound human, and keep answers short — usually one to three sentences.

SCOPE
- Only help with VoltMart: orders, products, policies (shipping, returns, refunds, warranty, payments/billing), and basic account questions.
- Politely decline anything unrelated and steer the customer back to VoltMart support. Do not answer general-knowledge questions.

USING YOUR TOOLS
- For ANY question about VoltMart policy (shipping, delivery, returns, refunds, warranty, payments, billing, how to track an order, account basics), call searchVoltMartPolicies FIRST and answer only from what it returns. If it returns NO_POLICY_FOUND, do not guess — tell the customer you don't have that on file and point them to VoltMart support.

WHEN YOU CAN'T HELP
You cannot fully resolve every request yourself. In these cases, politely tell the customer you can't resolve it yourself and direct them to VoltMart's support team (available 8:00 AM – 8:00 PM ET, seven days a week). NEVER promise a specific outcome (no "you'll get a refund"). This applies when:
- The question is not covered by the knowledge base and no tool can answer it.
- The customer asks for the live status of a specific order — you cannot look orders up yet, so share the self-service tracking steps from the policy docs and point them to VoltMart support if they need more.
- The customer disputes a charge, or asks for a refund, discount, or any exception to policy.
- The customer reports a damaged, defective, or wrong item.
- There is a complaint, a serious or legal tone, or clear frustration.
- The customer wants to change or cancel an order (you cannot do this).
- The customer explicitly asks to speak to a person.

GUARDRAILS
- Never invent a policy, price, date, or promise. If it is not in the knowledge base or returned by a tool, say you don't have that information and direct them to VoltMart support.
- Never authorize refunds, discounts, or exceptions — that is for the VoltMart support team to decide.
- Never reveal another customer's information or account details.
```

Select **Save**.

The role and the instructions are the agent's job description — the one place you shape behaviour of the AI Agent without writing code. In this use case, **SCOPE** keeps it on-topic, **USING YOUR TOOLS** tells it when to reach for each tool, and **WHEN YOU CAN'T HELP** and **GUARDRAILS** set the limits on what it can decide, invent, or reveal. To make it your own, swap VoltMart for your domain and rewrite those blocks to match your own risk boundaries, keeping instructions short, concrete, and imperative.

---

### Phase 2 — Teach it the VoltMart playbook

Right now the agent can chat and it knows *what* it's supposed to do, but it doesn't actually *know* anything about VoltMart.

So in this phase we give it a source of truth: VoltMart's own policy documents. The agent looks up the answer in those docs before it replies, a pattern called **RAG** (retrieval-augmented generation). This time we don't build the pipeline by hand in the editor — we use the **WSO2 Cloud RAG ingestion platform** as a managed service. We'll do it in four moves: stand up a managed vector database, run a **scheduled ingestion automation** that loads the documents into it, expose **retrieval as an HTTP API** with a RAG service, and finally give the agent a tool that calls that API whenever it needs an answer.

The full pattern we follow here is covered in the WSO2 Cloud RAG docs: [RAG ingestion](https://wso2.com/integration-platform/docs/manage/cloud/rag-ingestion/ingestion), [managed vector databases](https://wso2.com/integration-platform/docs/manage/cloud/rag-ingestion/vector-databases), [RAG retrieval](https://wso2.com/integration-platform/docs/manage/cloud/rag-ingestion/retrieval), and [the RAG service API](https://wso2.com/integration-platform/docs/manage/cloud/rag-ingestion/service).

#### Step 2.1 — Put the policy documents where ingestion can read them

The RAG ingestion automation reads its source files from a **cloud data source** — **Google Drive** or **Amazon S3** — not from your local project. We'll use Google Drive.

1. Create a Google Drive folder named `voltmart-knowledge-base` and make it accessible to the ingestion automation (the docs note a publicly accessible/shared folder is the simplest setup).
2. Add these five Markdown files to the folder. (Full content is in the companion project under [`voltmart-support/knowledge_base`](voltmart-support/knowledge_base); summaries below.)

   - `shipping-and-delivery.md` — timeframes, costs, regions.
   - `returns-and-refunds.md` — 30-day window, condition requirements, refund process.
   - `warranty.md` — coverage periods, inclusions/exclusions.
   - `payments-and-billing.md` — accepted methods, billing FAQ.
   - `general-faq.md` — account questions, how to track an order.

3. Copy the **Folder ID** from the Drive URL — the part after `/folders/` — you'll paste it into the ingestion automation in Step 2.3.

> Prefer **Amazon S3**? The ingestion automation accepts an S3 bucket as the source instead; the remaining steps are identical. Beyond Markdown, the platform also ingests PDF (including scanned), DOCX, PPTX, XLSX, CSV, HTML, images, and audio (MP3, WAV, M4A, FLAC, OGG).


#### Step 2.2 — Create the managed vector database

The embeddings need somewhere to live. The in-memory store from the old flow is gone — in the cloud we use a [**WSO2-managed PostgreSQL vector database**](https://wso2.com/integration-platform/docs/manage/cloud/rag-ingestion/vector-databases): a fully managed PostgreSQL database with vector similarity search built in, so there's no infrastructure for you to run and it persists across restarts.

1. Sign in to WSO2 Cloud and select your organization.
2. Go to **Dependencies → Vector Databases**.
3. Click **Create** and select **PostgreSQL**.
4. Provide a **Display name** (e.g. `voltmart-vectors`), choose a **cloud provider** (AWS, Azure, GCP, or DigitalOcean), a **region**, and a **service plan** (the plan determines CPU, memory, storage, backup retention, and high availability). For this tutorial the smallest plan is fine; for production choose a plan with high availability and backups.
5. Once it's provisioned, open its **Overview** page and copy the connection details (host, port, database, user, password). You'll reuse these for both ingestion and retrieval — treat them as secrets.

[SCREENSHOT: The managed PostgreSQL vector database creation form — provider, region, and service plan.]

See [Managed vector databases](https://wso2.com/integration-platform/docs/manage/cloud/rag-ingestion/vector-databases) for connection limits, high availability, and backups.

#### Step 2.3 — Create the scheduled RAG ingestion automation

A vector database on its own is empty — the agent needs the policy documents *in* it, searchable by meaning rather than keywords. That's what ingestion does: each document is split into chunks, converted into embeddings (numeric vectors that capture meaning), and written to the vector database. Instead of building that pipeline by hand, we configure a **RAG ingestion automation** in WSO2 Cloud — a scheduled job that pulls the files from Drive, chunks and embeds them, and stores them in your managed vector database. Because it runs on a schedule, updating a policy doc in Drive refreshes the knowledge base automatically.

In WSO2 Cloud, open your **organization**, then from the left navigation choose **RAG → Ingestion** and create a new ingestion. Work through the six steps:

1. **Vector store.** Select your managed **PostgreSQL** vector database from [Step 2.2](#step-22--create-the-managed-vector-database), paste its connection details, and set a **Collection name** (e.g. `voltmart-policies`) — it's created automatically if it doesn't exist. Note this collection name; retrieval must point at the same one.
2. **Embedding model.** Choose the **OpenAI** provider and the **`text-embedding-ada-002`** model, and provide your **OpenAI embedding API key**. This must be the same embedding model used at retrieval time, so the question and the documents land in the same vector space.
3. **Chunking.** Review the **chunking strategy**, **max segment size**, and **max overlap size** — these control how text is split into segments and how much consecutive chunks overlap. The defaults work well for short policy docs; tune them if your documents are long.
4. **Automation details.** Select the target **Project** and set a **Display name** (`VoltMart Policy Ingestion`), **Name** (`voltmart-policy-ingestion`), and an optional **Description**.
5. **Data source.** Select **Google Drive**, provide the access key, and paste the **Folder ID** from [Step 2.1](#step-21--put-the-policy-documents-where-ingestion-can-read-them). (Choose **Amazon S3** here instead if that's where you put the files.)
6. **Schedule.** Run it **immediately** to populate the database now, and set a **recurring schedule** (minutely, hourly, daily, monthly, or yearly — daily is a sensible default) so newly added or changed files are detected and ingested automatically.

[SCREENSHOT: The RAG ingestion configuration — PostgreSQL vector store, OpenAI ada-002 embedding, Google Drive source, and the schedule.]

Run it once and confirm the files were ingested. Container resources scale automatically for RAG automations; for very large files you can scale further under **Admin → Containers**.

See [RAG ingestion](https://wso2.com/integration-platform/docs/manage/cloud/rag-ingestion/ingestion) for the full reference.

#### Step 2.4 — Expose retrieval as an API with a RAG service

Ingestion filled the vector database; now the agent needs a way to *search* it. The WSO2 Cloud **RAG service** exposes exactly that over HTTP — a `POST /retrieve` endpoint that runs semantic search against a collection (plus `/upload`, `/chunks`, and `/health`). We stand one up so the agent can query the knowledge base with an API call.

1. In your organization, go to **RAG → Service** and create a new service.
2. Fill in the **Project**, a **Display name** (`VoltMart RAG Service`), a **Name** (`voltmart-rag-service`), and an optional **Description**, then create it. The platform provisions the service with extra container resources.
3. Once it's deployed, open the service and note its **base URL** and whatever **auth/credentials** it requires — you'll plug these into the agent's tool in the next step. Use the built-in **Test** (OpenAPI) console to try `POST /retrieve` against your `voltmart-policies` collection before wiring it into the agent.

The `/retrieve` request carries the vector store, embedding model, and query; the response returns the matching chunks. A call looks like this — **replace every `<...>` placeholder with your own values**:

```bash
curl -X POST "<RAG_SERVICE_BASE_URL>/retrieve" \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer <RAG_SERVICE_TOKEN>" \
  -d '{
    "query": "How long do I have to return something?",
    "vector_store": {
      "provider": "postgresql",
      "host": "<PG_VECTOR_HOST>",
      "port": "<PG_VECTOR_PORT>",
      "database": "<PG_VECTOR_DB>",
      "user": "<PG_VECTOR_USER>",
      "password": "<PG_VECTOR_PASSWORD>",
      "collection_name": "voltmart-policies"
    },
    "embedding_model": {
      "provider": "openai",
      "model": "text-embedding-ada-002",
      "api_key": "<OPENAI_API_KEY>"
    },
    "max_chunks": 10,
    "similarity_threshold": 0.7
  }'
```

> ⚠️ **Placeholders to replace.** The WSO2 docs describe the `/retrieve` inputs (vector store credentials, collection name, embedding model info, the query, max chunks, and a minimum similarity threshold between 0 and 1) and the response shape, but they don't publish the exact base URL, auth header, or full request envelope — those come from **your** deployed service's OpenAPI console. The `<...>` placeholders above (and the exact field names/nesting) are where you drop in your real values once you have them.

A successful response returns the query and the matching chunks:

```json
{
  "query": "How long do I have to return something?",
  "retrieved_chunks": [
    {
      "text": "VoltMart accepts returns within 30 days of the delivery date, provided items are in their original packaging with all accessories...",
      "source": "returns-and-refunds.md",
      "timestamp": "..."
    }
  ]
}
```

> **Optional — reranking.** `/retrieve` can rerank the retrieved chunks with **Cohere** to reorder them by contextual relevance and improve result quality. Enable reranking and supply a Cohere API key if you need it.

See [RAG retrieval](https://wso2.com/integration-platform/docs/manage/cloud/rag-ingestion/retrieval) and [the RAG service API](https://wso2.com/integration-platform/docs/manage/cloud/rag-ingestion/service).

#### Step 2.5 — Add AI Agent tool to search the knowledge base

After [Step 2.3](#step-23--create-the-scheduled-rag-ingestion-automation) the knowledge base is **ingested and ready** — VoltMart's policies are chunked, embedded, and sitting in the managed vector database — and after [Step 2.4](#step-24--expose-retrieval-as-an-api-with-a-rag-service) there's a **RAG service** exposing `/retrieve` over HTTP. Back in [Phase 1](#step-14--tell-your-agent-how-to-behave) we already told the agent, in its system prompt, to call `searchVoltMartPolicies` *first* for any policy question. But that tool doesn't exist yet — right now the instruction points at nothing. That's the gap we close here. An agent can only reach the outside world through **tools**, so we give it a [**custom tool**](https://wso2.com/integration-platform/docs/genai/develop/agents/tools) that calls the RAG service's `/retrieve` endpoint. When a customer asks a policy question, the agent calls this tool, which queries the knowledge base over HTTP and hands the matching passages back as text the agent can answer from.

**Add the tool.** Go back to the **AI Chat Agent**. On the **AI Agent** node click **+** →
**Create Custom Tool**, then fill in the form:

1. **Name:** `searchVoltMartPolicies`. The agent runtime dynamically chooses a tool from its **name + description**, so
   this must match the name used in the system prompt exactly — otherwise the instruction in
   Phase 1 has nothing to call.
2. **Description:** the single most important field — it's what the AI Agent reads to decide *when* to
   reach for this tool. Spell out what it searches and the rule for using it (full text in the code
   below).
3. **Parameter:** click **+ Add Parameter** and add `string` types parameter named `query` with the description
   *"The customer's question, in their own words."* This is what gets searched against the
   knowledge base.
4. **Return Type:** `string` — the matching policy text we feed back to the agent. You can use a supported type in WSO2 integrator in this field, but for this use case, a simple string is enough.
5. Click **Create**. WSO2 Integrator now opens an **empty flow diagram** for the tool implementation — this is the body of `searchVoltMartPolicies`, and it's where we call the **RAG service retrieval API**.

Before you build the flow, store the service details as **configurable values / secrets** in the integration rather than hardcoding them in the flow: the RAG service base URL and auth token, the PostgreSQL vector store connection details, and the OpenAI embedding API key. The tool reads these when it builds the request.

The flow is short — call `/retrieve`, then flatten the result:

**⚡ With WSO2 Integrator Copilot (fastest path).** Click **Generate with AI** in the tool flow and describe what you want — for example: *"POST to the RAG service `/retrieve` endpoint with the tool's `query`, the `voltmart-policies` collection on our PostgreSQL vector store, the OpenAI `text-embedding-ada-002` embedding model, `max_chunks` 10 and `similarity_threshold` 0.7. Read `retrieved_chunks` from the JSON response, concatenate each chunk's `text` into a single string separated by blank lines, return `NO_POLICY_FOUND` if the array is empty, and otherwise return the combined string. Read the service URL, token, vector store credentials, and embedding key from configurables."* Review the generated flow and click **Keep**.

**Prefer to place the nodes by hand?** Build it on the flow line:

1. **Call the retrieval API.** On the flow line, click **+** → **HTTP** and add a **POST** request to the RAG service.
   - **URL:** `<RAG_SERVICE_BASE_URL>/retrieve` (from the configurable you set above).
   - **Headers:** `Content-Type: application/json` and the service's auth header (e.g. `Authorization: Bearer <RAG_SERVICE_TOKEN>`).
   - **Payload:** the `/retrieve` body from [Step 2.4](#step-24--expose-retrieval-as-an-api-with-a-rag-service) — bind `query` to the tool's `query` parameter, set `collection_name` to `voltmart-policies`, fill the vector store and OpenAI embedding fields from your configurables, and keep `max_chunks` 10 and `similarity_threshold` 0.7.
   - **Result variable:** `response`.
2. **Read the chunks.** Click **+** → **Variable** and set `matches` to `response.retrieved_chunks` — the array of matched chunks the service returned.
3. **Guard the empty case.** Click **+** → **If**, with the condition `matches.length() == 0`. In the **then** branch, click **+** → **Return** and return a clear fallback such as `"NO_POLICY_FOUND: No matching VoltMart policy found."` — that way the agent gets the explicit `NO_POLICY_FOUND` signal its system prompt looks for instead of an empty string, and won't invent an answer.
4. **Stitch the chunks into one string.** On the main (else) line, click **+** → **Variable** to declare `grounding` (type `string`, value `""`), then click **+** → **Foreach** over `matches` with the iteration variable `match`. Inside the loop, click **+** → **Variable** and update `grounding` to `grounding + match.text + "\n\n"` — each matched chunk's text is concatenated onto the running string, separated by a blank line so the passages stay readable.
5. **Return the grounding.** After the loop, click **+** → **Return** and return `grounding`. That text is the grounding the agent answers from.

> ⚠️ The exact field names on the response (`retrieved_chunks`, `text`) follow the shape documented for the RAG service; confirm them against your deployed service's OpenAPI console and adjust the bindings if your service nests them differently.

[SCREENSHOT: Chat answering the returns-window question; trace showing the searchVoltMartPolicies call out to the RAG service.]

More on the query side of RAG: [RAG retrieval](https://wso2.com/integration-platform/docs/manage/cloud/rag-ingestion/retrieval) and [the RAG service API](https://wso2.com/integration-platform/docs/manage/cloud/rag-ingestion/service).
More on tools: [Tools](https://wso2.com/integration-platform/docs/genai/develop/agents/tools).

> **Where do live order lookups go?** You might have noticed the system prompt deliberately tells
> the agent it *cannot* look up a specific order's live status yet — for now it falls back to the
> self-service tracking steps in the policy docs. That's intentional: looking up real order data
> belongs to a real backend, not the knowledge base. We give the agent exactly that capability in
> **[part 2 of this series](connect-live-data-with-mcp.md)**, where it talks to a live orders service over **MCP**.

---

### Phase 3 — Make it remember the conversation

There's nothing more frustrating than a chatbot that forgets what you just told it — you give it your
name or the email on your account, and a sentence later it asks for it again. The good news is that you don't have
to build anything to avoid this. The initial AI Agent that created from the WSO2 Integrator
[Step 1.2](#step-12--add-the-ai-chat-agent) ships with **built-in short-term memory** out of the
box, so it already remembers everything in the conversation — including the customer's name, order number, and any other details they shared — without you having to do any extra work.
This built-in memory lives in process, which is exactly what you want during development and for
conversations that don't need to outlive a restart. If you need memory that **persists** — surviving
restarts, or shared across instances by backing it with an external store such as MSSQL — follow the
[Memory guide](https://wso2.com/integration-platform/docs/genai/develop/agents/memory) to configure
a persistent short-term memory store in WSO2 Integrator.

---

### Phase 4 — Take it for a spin

This is the fun part — everything's wired up, so let's actually talk to it. Below are two
conversations that each exercise a different capability you built: answering from the docs, and
gracefully declining when a request is beyond what it should handle. Run through them and watch the
agent decide, on its own, when to answer and when to step back.

Run the project using the `Run` button in the top right and open the **Chat** panel (or use `curl` against
`http://localhost:9090/voltMartAssistant/chat` with a JSON body of `{"sessionId": "...", "message": "..."}`).
Use the **same `sessionId`** within a conversation, a **new one** between conversations.

#### Sample 1 Test — Knowledge answer (RAG)

Ask a policy question and the agent answers straight from the docs.

**Input:**

```bash
curl -X POST http://localhost:9090/voltMartAssistant/chat \
  -H "Content-Type: application/json" \
  -d '{
    "sessionId": "sample-1",
    "message": "How long do I have to return something?"
  }'
```

**Output:**

```json
{
  "message": "You have 30 days from the delivery date to return most items, as long as they're in their original packaging with all accessories. Want me to walk you through starting a return?"
}
```

*Expected behavior:* calls `searchVoltMartPolicies`, answers from the returns policy, stays brief.

#### Sample 2 Test — Policy exception (graceful decline)

Ask for something the agent isn't allowed to grant — a refund or an exception to policy — and it declines without overpromising, pointing you to the support team. Reuse the **same `sessionId`** so it stays in the same conversation when you push back on the second turn.

**Input (turn 1 — request an exception):**

```bash
curl -X POST http://localhost:9090/voltMartAssistant/chat \
  -H "Content-Type: application/json" \
  -d '{
    "sessionId": "sample-2",
    "message": "I returned my speaker 40 days after delivery. Can you refund me anyway?"
  }'
```

**Output (turn 1 — declines, points to support):**

```json
{
  "message": "I'm sorry, but returns fall outside our 30-day window and I'm not able to approve an exception myself. Our VoltMart support team can review your case — they're available 8:00 AM – 8:00 PM ET, seven days a week."
}
```

**Input (turn 2 — customer pushes back):**

```bash
curl -X POST http://localhost:9090/voltMartAssistant/chat \
  -H "Content-Type: application/json" \
  -d '{
    "sessionId": "sample-2",
    "message": "Come on, it was only 10 days late. Just approve it."
  }'
```

**Output (turn 2 — stays firm, no promises):**

```json
{
  "message": "I understand the frustration, and I'm sorry for the trouble. Refund exceptions are decided by the VoltMart support team, not something I can authorize — please reach out to them at 8:00 AM – 8:00 PM ET and they'll take a look."
}
```

*Expected behavior:* calls `searchVoltMartPolicies`, recognizes the request is an exception it can't authorize, declines politely, and directs the customer to support — without promising a refund.

[SCREENSHOT: The Chat panel running conversation 2, showing the graceful decline.]

---

## What's next in the series

You now have a working front-line agent that answers policy questions from a knowledge base and
knows when to step back. That's a complete, useful assistant on its own — but it can't yet see a
single byte of *live* data. That's exactly what the next three parts add, building directly on the
project you just created:

- **Part 2 — Give it live order data over MCP.** Right now the agent can't look up a real order. In
  part 2 we stand up a proper **orders backend**: a Ballerina **MCP service** with `getStatus`,
  `createOrder`, and `removeOrder` tools, backed by a **live PostgreSQL database running in Docker**.
  Then we connect that MCP service to this same agent as a **toolkit** — so the agent gains every one
  of those tools at once, with no extra glue code. See
  [Building a customer care agent with MCP](https://wso2.com/integration-platform/docs/genai/tutorials/building-a-customer-care-agent-mcp).
- **Part 3 — Act on a request, then push a live notification over a webhook.** In part 3 we add a
  `requestReturn` tool that lets the agent file a return on the customer's behalf and fires a
  **webhook** the moment it does, pushing a live alert to the returns team — while never deciding the
  refund itself. Then we hand that tool to the agent too.
- **Part 4 — Deploy it to WSO2 Cloud and observe it.** In part 4 we take the finished agent (and the
  orders service and returns receiver it depends on) to production on **WSO2 Cloud**, switch it to a
  production model provider and a managed database, and **observe** every tool call and decision — with
  the dev-time agent trace viewer and the cloud's runtime logs, metrics, alerts, and traces. See
  [Deploy and observe your AI agent on WSO2 Cloud](deploy-and-observe-on-wso2-cloud.md).

And a few directions beyond the series, when you take this even further in production:

- **Human handoff / real refunds.** This build politely points customers to support and never
  lets the agent move money. A real build would add a [connector-based tool](https://wso2.com/integration-platform/docs/genai/develop/agents/tools)
  to open tickets in a helpdesk for the support team to action.
- **Scale the vector store and ingestion.** This build already uses a durable, managed PostgreSQL
  vector database, so nothing resets on restart. For production, move the managed database to a
  service plan with high availability and longer backup retention, tighten access with an IP
  allowlist, and lean on the scheduled ingestion automation to keep the knowledge base current.
  Pinecone is also a supported vector store if you prefer it.
- **Persistent memory.** Swap the in-memory store for the MSSQL short-term memory store so
  conversations survive restarts — see [Memory](https://wso2.com/integration-platform/docs/genai/develop/agents/memory)
  and the [IT helpdesk tutorial](https://wso2.com/integration-platform/docs/genai/tutorials/it-helpdesk-chatbot).
- **Evaluation & observability.** Turn on **Tracing** (OpenTelemetry) to inspect tool calls, and
  add an evaluation harness before you ship prompt changes.

---
