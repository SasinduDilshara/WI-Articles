# Give Your AI Agent Live Data with MCP on WSO2 Integrator

## Introduction

In [part 1 of this series](build-first-ai-integration.md) you built a real AI agent on [WSO2 Integrator](https://wso2.com/integration-platform/docs/genai/overview) — the VoltMart Support Assistant. It answers policy questions from a knowledge base, stays on-topic, and steps back gracefully when a request is beyond what it should decide. It's genuinely useful.

But it has a blind spot, and you probably felt it: it can't see a single byte of *live* data. Ask it *"where's my order #10432?"* and the best it can do is recite the self-service tracking steps from the docs. The knowledge base holds static policy text; an order's status changes by the hour and is different for every customer. To answer that question the agent needs to reach a real backend.

That's what this article is about. We'll stand up a proper **orders backend** and connect it to the agent — and we'll do it the way the agentic world is converging on: **MCP**, the Model Context Protocol. By the end, the same VoltMart agent will look up live orders, create new ones, and cancel them — all backed by a real database running in Docker.

No prior MCP experience is needed. If you finished part 1, you're ready for this.

---

## What is MCP, and why use it here?

**MCP (Model Context Protocol)** is an open standard that lets an AI agent connect to external tools and data in a structured, predictable way. Think of it as a universal adapter between agents and the systems they need to act on: a server publishes a set of named, typed **tools**, and any MCP-aware client — our WSO2 agent, Claude Desktop, an IDE — can discover those tools and call them, reasoning over the results without any bespoke integration code.

Why does that matter for VoltMart? In part 1, the agent's one tool (`searchVoltMartPolicies`) lived *inside* the agent's own project. That's fine for one tool. But an orders backend is a different beast: it's owned by a different team, it talks to a database, and it will be reused by more than just this agent (a mobile app, an internal dashboard, a second agent). Baking it into the agent would couple things that should stay separate.

With MCP we draw a clean line:

- The **orders service** owns the data and the business rules (identity checks, what "create an order" means). It exposes them as MCP tools and knows nothing about any agent.
- The **agent** connects to that service as a **toolkit** and instantly gains every tool it publishes — with no per-tool wiring. Add a tool to the service later, and the agent picks it up automatically.

This is exactly the decoupling real systems need, and WSO2 Integrator has first-class support for both sides.

---

## What we are going to build

We'll build this in two halves, then join them:

1. **A VoltMart Orders MCP service** — a standalone integration that exposes three tools over MCP, backed by a **live PostgreSQL database running in Docker**:
   - `getStatus` — look up an order's live status and ETA (with identity verification).
   - `createOrder` — place a new order.
   - `removeOrder` — cancel/remove an order (with identity verification).
2. **The agent from part 1, now wired to that service** — we add the orders service to the VoltMart agent as a single **MCP toolkit**, so it gains all three tools at once.

### Architecture

![VoltMart with MCP architecture: the customer chats with the AI agent; the agent uses its policy RAG tool plus an MCP toolkit; the toolkit speaks MCP to the standalone VoltMart Orders MCP service, which reads and writes a PostgreSQL database running in Docker.](voltmart-orders-mcp/architecture.png)

The agent keeps the policy RAG tool from part 1. Alongside it sits the **MCP toolkit** — the agent's connection to the orders service. When a customer asks about a live order, the agent calls a tool on the toolkit; the toolkit forwards the call over MCP to the **orders service**, which runs the real query against **PostgreSQL** and hands the answer back. The two integrations run as separate processes and could live on separate machines — they only share the MCP contract.

> **Companion code.** You'll build everything below in the low-code editor. If you'd rather read or run the finished result, the complete projects are in the [`voltmart-orders-mcp`](voltmart-orders-mcp) folder — the orders MCP service (with its Docker setup) and the part-1 agent carried forward with the orders service connected. WSO2 Integrator keeps the visual flows and the underlying source in sync, so the projects there are exactly what the clicks below produce.

---

## Prerequisites

You'll need everything from [part 1](build-first-ai-integration.md#prerequisites-getting-your-tools-ready) — WSO2 Integrator installed, a WSO2 account, and the part-1 agent project — plus one new thing:

- **Docker Desktop** (or any Docker engine with Compose). We use it to run PostgreSQL with zero manual setup. Install it from `https://www.docker.com/products/docker-desktop/` and make sure `docker compose version` prints a version.

---

## Part A — Build the VoltMart Orders MCP service

We'll build the orders service one layer at a time: first the live database, then the connection that reaches it, then the MCP service that exposes the three tools. Each layer is checked before we move on.

### Step A.1 — Create the orders service project

The orders service is a **separate integration** from the agent — its own project, its own runtime. Keeping it separate is the whole point: it's an independent backend that just happens to speak MCP.

1. In WSO2 Integrator, create a new integration. Set **Integration Name** to `VoltMartOrders` and **Project Name** to `orders-service`.
2. Select **Create Integration**.

[SCREENSHOT: The "Create New Integration" dialog for the orders-service project.]

### Step A.2 — Stand up the live database in Docker

In the real world VoltMart's orders live in a production database. We'll reproduce that locally with a throwaway **PostgreSQL** container — no installs, no manual schema setup. Two small files do the job.

Create a `docker-compose.yml` at the root of the `orders-service` project:

```yaml
# A throwaway PostgreSQL instance that stands in for VoltMart's real order system.
# `db/init.sql` is mounted into the image's init directory, so the table and seed
# rows are created automatically the first time the container starts.
#
#   docker compose up -d     # start the database
#   docker compose down -v    # stop it and wipe the data
services:
  orders-db:
    image: postgres:16
    container_name: voltmart-orders-db
    environment:
      POSTGRES_USER: voltmart
      POSTGRES_PASSWORD: voltmart
      POSTGRES_DB: voltmart_orders
    ports:
      - "5432:5432"
    volumes:
      - ./db/init.sql:/docker-entrypoint-initdb.d/init.sql:ro
    healthcheck:
      test: ["CMD-SHELL", "pg_isready -U voltmart -d voltmart_orders"]
      interval: 5s
      timeout: 5s
      retries: 5
```

Then create `db/init.sql` — the schema plus three seed orders, so the agent has real data to look up the moment it connects:

```sql
-- Schema + seed data for VoltMart's order database.
-- Runs automatically the first time the Postgres container starts.

CREATE TABLE IF NOT EXISTS orders (
    order_number  TEXT PRIMARY KEY,
    account_email TEXT NOT NULL,
    item          TEXT NOT NULL,
    -- processing | shipped | delivered
    status        TEXT NOT NULL DEFAULT 'processing',
    eta           TEXT NOT NULL
);

INSERT INTO orders (order_number, account_email, item, status, eta) VALUES
    ('10432', 'jordan@example.com', 'AirWave Pro wireless headphones', 'shipped',    'arriving Thursday, 18 June 2026'),
    ('10588', 'priya@example.com',  'SoundDock 2 Bluetooth speaker',   'processing', 'ships within 1 business day'),
    ('10219', 'sam@example.com',    'VoltBook 14 laptop',              'delivered',  'delivered on 9 June 2026')
ON CONFLICT (order_number) DO NOTHING;
```

Now start the database from the project root:

```bash
docker compose up -d
```

Give it a few seconds, then confirm the seed data is there:

```bash
docker exec -it voltmart-orders-db \
  psql -U voltmart -d voltmart_orders -c "SELECT order_number, status FROM orders;"
```

You should see the three orders listed. The database is live and waiting.

> 💡 When you're done with the whole tutorial, `docker compose down -v` stops the container and wipes the data, so you always start from a clean slate next time.

### Step A.3 — Add a connection to the database

Now switch back to WSO2 Integrator. Before the service can read or write orders, it needs a **connection** to the database — the low-code equivalent of "here's where the orders live and how to sign in."

1. In the design view, select **+ Add Artifact**.
2. Under **Connections** (the connector store), search for **PostgreSQL** and select it.
3. In the **Add New Connection** form, fill in the same values you set in `docker-compose.yml`:
   - **Host:** `localhost`
   - **Port:** `5432`
   - **Username:** `voltmart`
   - **Password:** `voltmart`
   - **Database:** `voltmart_orders`
4. Give the connection a name like `ordersDb` and select **Create**.

[SCREENSHOT: The PostgreSQL "Add New Connection" form with the host, port, and database filled in.]

> 💡 WSO2 Integrator stores the connection in the project and keeps the secret values out of your source — you point at it by name from any flow. That one connection is what every order tool below will reuse to reach the live data.

### Step A.4 — Create the MCP service

This is the heart of the article. An **MCP service** is an integration artifact that publishes tools over the Model Context Protocol — any MCP client (our agent, Claude Desktop, an IDE) can then discover and call them. WSO2 Integrator gives you a dedicated artifact for it, so there's nothing low-level to wire up.

1. Select **+ Add Artifact**.
2. Under **AI Integration**, select **MCP Service**.
3. Fill in the creation form:
   - **Service Name:** `VoltMart Orders` — the display name MCP clients see.
   - **Version:** `1.0.0`.
   - **Port:** `8290` — the port the service listens on.
   - **Base Path:** `/mcp` — so the service is reachable at `http://localhost:8290/mcp`.
4. Select **Create**.

WSO2 Integrator opens the **MCP Service editor**: a listener, an empty **Tools** section with a **+ Add Tool** button, and **Try It** for testing. The three tools come next — each one is added the same way: fill a short form, then build its flow.

[SCREENSHOT: The empty MCP Service editor showing the Tools section and the + Add Tool button.]

See [Exposing a service as MCP](https://wso2.com/integration-platform/docs/genai/develop/mcp/overview) for the full reference.

### Step A.5 — Add the `getStatus` tool

Our first tool looks up an order's live status — but only after checking the customer's identity. This is the live order lookup part 1 deliberately left out, now reading straight from the real database.

**Add the tool.** In the MCP Service editor, click **+ Add Tool** and fill in the form:

1. **Name:** `getStatus`. This is the tool name MCP clients see, so make it clear.
2. **Description:** the single most important field — it's what the calling agent reads to decide *when* to use this tool, and the rule it must follow. Paste in:

   ```
   Look up the current status and delivery ETA of a VoltMart order. You MUST pass BOTH the order number AND the account email. Details are returned ONLY when the email matches the order on file — that is the identity check. Returns VERIFICATION_FAILED if the email does not match, or ORDER_NOT_FOUND if no order matches the number. Never share details this tool did not return.
   ```
3. **Parameters:** click **+ Add Parameter** twice and add two `string` parameters:
   - `orderNumber` — *"The order number, e.g. 10432 (a leading # is fine)."*
   - `accountEmail` — *"The email address on the customer's VoltMart account."*
4. **Return Type:** `string` — the status line, or one of the `VERIFICATION_FAILED` / `ORDER_NOT_FOUND` signals.
5. Select **Save**. WSO2 Integrator opens an **empty flow diagram** for the tool — this is where we look the order up and run the identity check.

Now build the flow. You have two ways to do it.

**⚡ With WSO2 Integrator Copilot (fastest path).** Click **Generate with AI** in the tool flow and describe the logic in plain English — for example: *"Look up `orderNumber` in the `ordersDb` PostgreSQL connection (the `orders` table, keyed by `order_number`). If no row matches, return `\"ORDER_NOT_FOUND\"`. Otherwise, if the row's `account_email` doesn't equal the `accountEmail` parameter, return `\"VERIFICATION_FAILED\"`. Otherwise return a sentence with the item, status, and ETA."* Review the generated flow and click **Keep**.

**Prefer to place the nodes by hand?** Build it on the flow line, node by node:

1. **Look the order up.** Click **+** → under **Connections**, select your `ordersDb` connection and choose its **query** action (the one that runs a `SELECT` and returns a row). Set the query to select the order whose `order_number` matches the `orderNumber` parameter, and bind the result to a variable named `order`.
2. **Guard the unknown order.** Click **+** → **If**, with a condition that checks whether the lookup found nothing. In the **then** branch, click **+** → **Return** and return `"ORDER_NOT_FOUND: No VoltMart order matches that number."` — an explicit signal the agent can act on, instead of a blank.
3. **Verify identity.** On the main line, click **+** → **If**, comparing `order.accountEmail` to the `accountEmail` parameter (case-insensitively). In the **then** branch, **Return** `"VERIFICATION_FAILED: That email does not match this order."` This is the rule the system prompt depends on, now enforced in the backend.
4. **Return the status.** After the check, click **+** → **Return** and return a status line built from the order, e.g. `Order #10432 (AirWave Pro wireless headphones): status is "shipped", arriving Thursday, 18 June 2026.`

[SCREENSHOT: The getStatus tool flow — query node, two If guards, and the status Return.]

> **Why both a query node and an If check?** The query reaches the live database; the identity `If` makes sure we never hand back another customer's order. Keeping that rule *inside the tool* means it holds no matter which client calls it — the agent, or anything else.

### Step A.6 — Add the `createOrder` tool

Back in the MCP Service editor, click **+ Add Tool** again:

1. **Name:** `createOrder`.
2. **Description:**

   ```
   Create a new VoltMart order in the order database. Call this only when the customer has given you the account email and the item to order. The new order always starts in the "processing" status. Returns ORDER_EXISTS if an order with that number already exists.
   ```
3. **Parameters:** three `string` parameters — `orderNumber`, `accountEmail`, and `item` (*"The product being ordered, e.g. AirWave Pro wireless headphones."*).
4. **Return Type:** `string`.
5. **Save**, then build the flow.

**⚡ With Copilot:** click **Generate with AI** and describe it — *"Check the `ordersDb` connection for an order with this `orderNumber`. If one exists, return `\"ORDER_EXISTS\"`. Otherwise insert a new row with the given order number, account email, and item, status `processing`, ETA `ships within 1 business day`, and return a confirmation line."* Review and **Keep**.

**By hand:** click **+** → **Connections** → `ordersDb` → the **query** action to check for an existing order → **If** it exists, **Return** `"ORDER_EXISTS: …"`; otherwise **+** → **Connections** → `ordersDb` → the **execute** action (the one that runs an `INSERT`) to add the new row, then **Return** a confirmation such as `Order #10644 created for VoltBuds Mini. Status: processing, ships within 1 business day.`

> **Note.** To keep the tutorial simple, the order number is passed in as a parameter. A production service would generate it server-side (a sequence or UUID) and return it, rather than trusting the caller to supply a unique one.

### Step A.7 — Add the `removeOrder` tool

One more time — **+ Add Tool**:

1. **Name:** `removeOrder`.
2. **Description:**

   ```
   Remove a VoltMart order from the order database. You MUST pass BOTH the order number AND the account email; the order is only removed when the email matches the order on file. Returns VERIFICATION_FAILED if it does not, or ORDER_NOT_FOUND if no order matches the number.
   ```
3. **Parameters:** two `string` parameters — `orderNumber` and `accountEmail`.
4. **Return Type:** `string`.
5. **Save**, then build the flow.

**⚡ With Copilot:** *"Look the order up in `ordersDb`. Return `\"ORDER_NOT_FOUND\"` if it isn't there; return `\"VERIFICATION_FAILED\"` if its `account_email` doesn't match the `accountEmail` parameter; otherwise delete the row and return a confirmation line."* Review and **Keep**.

**By hand:** it's the same shape as `getStatus` — **query** to fetch the order, an **If** for `ORDER_NOT_FOUND`, an **If** comparing the email for `VERIFICATION_FAILED` — except the final step is the connection's **execute** action running a `DELETE`, followed by a **Return** confirming the removal.

> Notice the pattern across all three tools: fetch, guard with explicit signals, then act. The `VERIFICATION_FAILED` / `ORDER_NOT_FOUND` / `ORDER_EXISTS` strings are the same explicit-signal style as `NO_POLICY_FOUND` from part 1 — the agent reads them and responds sensibly instead of guessing.

### Step A.8 — Run the MCP service and verify the tools

With the database already running from Step A.2, start the orders service with the **Run** button. It comes up on port `8290`, publishing the three tools at `http://localhost:8290/mcp`.

You don't need the agent to test this. The quickest check is the editor's **Try It** panel, which lists the three tools and lets you invoke one directly — try `getStatus` with `10432` / `jordan@example.com` and watch it return the live status from PostgreSQL.

Prefer the command line? Ask the server what tools it publishes:

```bash
curl -s -X POST http://localhost:8290/mcp \
  -H "Content-Type: application/json" \
  -H "Accept: application/json, text/event-stream" \
  -d '{"jsonrpc":"2.0","id":1,"method":"tools/list"}'
```

The response lists `getStatus`, `createOrder`, and `removeOrder`, each with the description and parameters from the form you filled in. That's the MCP contract the agent will consume next.

[SCREENSHOT: The MCP Service "Try It" panel invoking getStatus and showing the live result.]

---

## Part B — Connect the MCP service to the agent

Half the work is done: the orders service is live and publishing tools. Now we give the part-1 agent access to them. The beauty of MCP is that we **don't** add three tools one by one — we point the agent at the *service*, and it discovers every tool at once.

Reopen the `voltmart-support` agent from part 1.

### Step B.1 — Add the orders service as an MCP server

1. Open the **AI Chat Agent** and click the **AI Agent** node.
2. Click **+ Add Tool**, then choose **Use MCP Server**.
3. In the **Add MCP Server** panel:
   - **Server URL:** `http://localhost:8290/mcp` — the orders service from Part A.
   - **Tools to Include:** leave it at **All** (we want all three).
   - **Info → name / version:** an identifier for this client, e.g. `VoltMart Orders Client` / `1.0.0`.
4. The panel queries the server and lists the discovered tools — `getStatus`, `createOrder`, `removeOrder`. Confirm they appear, then select **Save**.

[SCREENSHOT: The "Add MCP Server" panel showing the three discovered tools after entering the server URL.]

That's the entire wiring. The agent now has four tools: `searchVoltMartPolicies` from part 1, plus the three it just discovered. There were **no tool names to type** — discovery is automatic, which is why adding a tool to the service later (as we'll do in part 3) needs no change here.

See [Consuming MCP from an agent](https://wso2.com/integration-platform/docs/genai/develop/mcp/overview) for more.

### Step B.2 — Update the agent's instructions

The agent can now reach the order tools, but it still needs to know *when* to use them. Click the **AI Agent** node, open the **Instructions** (system prompt) editor, and update the **USING YOUR TOOLS** section so it reads:

```
USING YOUR TOOLS
- For ANY question about VoltMart policy (shipping, delivery, returns, refunds, warranty, payments, billing, account basics), call searchVoltMartPolicies FIRST and answer only from what it returns. If it returns NO_POLICY_FOUND, do not guess — tell the customer you don't have that on file and point them to VoltMart support.
- For the LIVE status of a specific order, call getStatus. You need BOTH the order number AND the account email; if either is missing, ask for it first. Never reveal order details unless the tool returns them — if it returns VERIFICATION_FAILED or ORDER_NOT_FOUND, tell the customer politely and do not invent a status.
- To place a NEW order, call createOrder once you have the account email and the item. Read the new order number back to the customer.
- To CANCEL/remove an order, call removeOrder. As with status, you need BOTH the order number AND the account email, and the tool only removes it when the email matches.
```

Then remove the two part-1 lines that no longer apply — the one telling the agent it *can't* look up orders, and the one saying it can't change or cancel an order — since those capabilities now exist. Select **Save**.

> **Why the identity rule lives in two places.** You'll notice the prompt asks the agent for the email *and* the MCP tool enforces the match. That's deliberate: the prompt makes for a good conversation (the agent asks first instead of failing), while the service enforces the rule no matter what any client does. Never trust the prompt alone for a security boundary — the backend is the source of truth.

---

## Take it for a spin

Make sure all three pieces are running: the **Docker database** (`docker compose up -d`), the **orders MCP service** (port 8290), and the **agent** (the **Run** button, port 9090). Then open the agent's **Chat** panel — or `curl` against `http://localhost:9090/voltMartAssistant/chat` as in part 1.

#### Sample 1 — Live order status (now for real)

The question the agent couldn't answer in part 1. Keep the **same `sessionId`** across both turns so it remembers the order number.

**Input (turn 1):**

```bash
curl -X POST http://localhost:9090/voltMartAssistant/chat \
  -H "Content-Type: application/json" \
  -d '{
    "sessionId": "mcp-1",
    "message": "Where'\''s my order #10432?"
  }'
```

**Output (turn 1 — asks to verify):**

```json
{
  "message": "Happy to check! Can you confirm the email on your VoltMart account?"
}
```

**Input (turn 2):**

```bash
curl -X POST http://localhost:9090/voltMartAssistant/chat \
  -H "Content-Type: application/json" \
  -d '{
    "sessionId": "mcp-1",
    "message": "jordan@example.com"
  }'
```

**Output (turn 2 — live status, straight from PostgreSQL):**

```json
{
  "message": "Thanks! Order #10432 (AirWave Pro wireless headphones) has shipped and is arriving Thursday, 18 June 2026."
}
```

*Expected behavior:* the agent asks for the email, calls `getStatus` over MCP, and reports the status only after the email matches the row in the database.

#### Sample 2 — Place a new order

**Input:**

```bash
curl -X POST http://localhost:9090/voltMartAssistant/chat \
  -H "Content-Type: application/json" \
  -d '{
    "sessionId": "mcp-2",
    "message": "I'\''d like to order a VoltBuds Mini for my account, dana@example.com. Use order number 10644."
  }'
```

**Output:**

```json
{
  "message": "Done! Order #10644 for the VoltBuds Mini is in — status: processing, ships within 1 business day."
}
```

*Expected behavior:* calls `createOrder`; the new row is now in the database. Confirm it directly:

```bash
docker exec -it voltmart-orders-db \
  psql -U voltmart -d voltmart_orders -c "SELECT * FROM orders WHERE order_number = '10644';"
```

#### Sample 3 — Identity check on removal

Try to cancel an order with the wrong email, and the service refuses — the rule is enforced in the backend, not just the prompt.

**Input:**

```bash
curl -X POST http://localhost:9090/voltMartAssistant/chat \
  -H "Content-Type: application/json" \
  -d '{
    "sessionId": "mcp-3",
    "message": "Please cancel order #10219, my email is wrong@example.com."
  }'
```

**Output:**

```json
{
  "message": "I wasn'\''t able to cancel that — the email doesn'\''t match the one on order #10219, so I can'\''t make changes to it. If you think this is a mistake, our support team can help, 8:00 AM – 8:00 PM ET."
}
```

*Expected behavior:* calls `removeOrder`, gets `VERIFICATION_FAILED`, and the order stays in the database untouched.

[SCREENSHOT: The Chat panel running Sample 1, with the trace showing the getStatus MCP call.]

---

## What just happened

Step back and look at what you built. The orders service knows nothing about AI — it's a plain integration over a database that happens to publish MCP tools. The agent knows nothing about PostgreSQL — it just sees four tools and reasons about when to call them. The only thing connecting them is the MCP contract and the single **Use MCP Server** step you clicked in Part B. That's the decoupling MCP buys you: either side can change independently, and the same orders service could back a second agent, a mobile app, or Claude Desktop without a single change.

## What's next in the series

The agent can now read and write live order data. But it's still **reactive** — the customer has to ask. In **[part 3](push-live-notifications-with-webhooks.md)** we close that loop: we add an order **status-change** capability that fires a **webhook** the moment an order moves from *processing* → *shipped* → *delivered*, so customers get a live notification pushed to them instead of having to check. As before, we'll build the capability as its own tool and then hand it to the same agent.

A few directions to explore on your own first:

- **Add a fourth tool.** Click **+ Add Tool** on the MCP service and add one more. Restart only the service — the agent picks it up with no changes, thanks to automatic tool discovery. (We'll do exactly this in part 3.)
- **Swap the database.** Point the PostgreSQL connection at a managed database instead of the Docker one. Nothing else changes.
- **Secure the MCP endpoint.** For anything beyond local development, put auth in front of the MCP service — see the [tools documentation](https://wso2.com/integration-platform/docs/genai/develop/agents/tools).

---
