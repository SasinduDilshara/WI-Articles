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

> **Companion code.** Everything in this article is in the [`voltmart-orders-mcp`](voltmart-orders-mcp) folder: `orders-service/` is the new MCP service (with its Docker setup), and `voltmart-support/` is the part-1 agent project carried forward with the MCP toolkit added.

---

## Prerequisites

You'll need everything from [part 1](build-first-ai-integration.md#prerequists-getting-your-tools-ready) — WSO2 Integrator installed, a WSO2 account, and the part-1 agent project — plus one new thing:

- **Docker Desktop** (or any Docker engine with Compose). We use it to run PostgreSQL with zero manual setup. Install it from `https://www.docker.com/products/docker-desktop/` and make sure `docker compose version` prints a version.

---

## Part A — Build the VoltMart Orders MCP service

We'll build the orders service one layer at a time: first the live database, then the data-access layer that talks to it, then the MCP service that exposes the three tools. Each layer is checked before we move on.

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

Then create `db/init.sql` — the schema plus three seed orders (the same ones the part-1 article used as mock data, now living in a real table):

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

### Step A.3 — Configure the database connection

The service needs to know where the database is. Add the PostgreSQL connector to your project (in the design view, **+ Add Artifact** → **Connection** → search **PostgreSQL**), then put the connection settings in `Config.toml` so no credentials are hard-coded:

```toml
# Connection settings for the Dockerized PostgreSQL order database.
# These match the credentials in docker-compose.yml. In production, keep real
# secrets out of source control and inject them as environment variables instead.
dbHost = "localhost"
dbPort = 5432
dbUser = "voltmart"
dbPassword = "voltmart"
dbName = "voltmart_orders"
```

### Step A.4 — Define the order type

Just like the agent project, we describe the shape of an order once as a record type. Create `types.bal`:

```ballerina
// A single VoltMart order, as stored in the PostgreSQL `orders` table.
// The SELECT queries in database.bal alias the snake_case columns
// (order_number, account_email) onto these camelCase fields.
public type Order record {|
    string orderNumber;
    // The email on the account — used for identity verification before sharing details.
    string accountEmail;
    string item;
    // processing | shipped | delivered
    string status;
    string eta;
|};
```

### Step A.5 — Write the data-access layer

Before the MCP tools can do anything useful, they need to read and write the database. We isolate that in `database.bal` — one pooled client plus three small query functions. Keeping data access in its own file means the MCP service in the next step reads almost like plain English.

```ballerina
import ballerina/sql;
import ballerinax/postgresql;
// The `as _` import wires in the JDBC driver without exposing any symbols.
import ballerinax/postgresql.driver as _;

// Read from Config.toml (or environment variables in production).
configurable string dbHost = "localhost";
configurable int dbPort = 5432;
configurable string dbUser = "voltmart";
configurable string dbPassword = "voltmart";
configurable string dbName = "voltmart_orders";

// One pooled client for the whole service. The order tools below all share it.
// This is the "live backend" the agent could never reach from the knowledge base.
final postgresql:Client ordersDb = check new (
    host = dbHost,
    port = dbPort,
    username = dbUser,
    password = dbPassword,
    database = dbName
);

// Fetch a single order by its number. Returns sql:NoRowsError when nothing matches —
// the callers turn that into the friendly ORDER_NOT_FOUND signal.
isolated function fetchOrder(string orderNumber) returns Order|sql:Error =>
    ordersDb->queryRow(`SELECT order_number  AS "orderNumber",
                               account_email AS "accountEmail",
                               item, status, eta
                          FROM orders
                         WHERE order_number = ${orderNumber}`);

// Insert a brand-new order.
isolated function insertOrder(Order ord) returns sql:Error? {
    _ = check ordersDb->execute(`INSERT INTO orders
            (order_number, account_email, item, status, eta)
        VALUES (${ord.orderNumber}, ${ord.accountEmail}, ${ord.item}, ${ord.status}, ${ord.eta})`);
}

// Delete an order by its number.
isolated function deleteOrder(string orderNumber) returns sql:Error? {
    _ = check ordersDb->execute(`DELETE FROM orders WHERE order_number = ${orderNumber}`);
}
```

A couple of things worth calling out:

- The queries use Ballerina's backtick **parameterized queries**, so the `${...}` values are sent as bound SQL parameters, not string-concatenated — that's your built-in protection against SQL injection.
- `queryRow` returns a typed `Order` directly, mapping the `AS "orderNumber"` aliases onto the record fields. When no row matches it returns `sql:NoRowsError`, which we'll turn into a clean `ORDER_NOT_FOUND` signal — the same explicit-signal pattern the agent relied on in part 1.

### Step A.6 — Expose the three tools as an MCP service

This is the heart of the article. An [**MCP service**](https://wso2.com/integration-platform/docs/genai/overview) in WSO2 Integrator turns ordinary functions into MCP tools: you write a `remote function`, and WSO2 Integrator publishes it as a named, typed tool over the MCP protocol — handling all the JSON-RPC and transport plumbing for you. The function **name** becomes the tool name, its **doc comment** becomes the description the calling LLM reads to decide *when* to use it, and its **parameters** become the tool's input schema.

> This is the same idea as the custom tools in part 1 — name, description, and typed parameters are what an agent reasons over — except now the tools live in a standalone service that *any* MCP client can use.

Create `service.bal`:

```ballerina
import ballerina/log;
import ballerina/mcp;
import ballerina/sql;

// The MCP server listens on its own port, separate from the agent. Anything that speaks
// MCP — the WSO2 agent we build later, Claude Desktop, or any other MCP client — can connect.
listener mcp:Listener ordersMcpListener = check new (8290);

// One MCP service exposes three tools to any connected client. WSO2 Integrator turns each
// `remote function` into a named, typed MCP tool automatically: the function name becomes the
// tool name, the doc comment becomes the description the client's LLM reads to decide when to
// call it, and the parameters become the tool's input schema. `sessionMode: AUTO` lets the
// transport decide whether to track sessions.
@mcp:ServiceConfig {
    info: {name: "VoltMart Orders", version: "1.0.0"},
    sessionMode: mcp:AUTO
}
service mcp:Service /mcp on ordersMcpListener {

    # Look up the current status and delivery ETA of a VoltMart order. You MUST pass BOTH the
    # order number AND the account email. Details are returned ONLY when the email matches the
    # order on file — that is the identity check. Returns VERIFICATION_FAILED if the email does
    # not match, or ORDER_NOT_FOUND if no order matches the number. Never share details this
    # tool did not return.
    #
    # + orderNumber - The order number, e.g. "10432" (a leading '#' is fine)
    # + accountEmail - The email address on the customer's VoltMart account
    # + return - The status and ETA when the email matches, otherwise a VERIFICATION_FAILED / ORDER_NOT_FOUND signal
    remote isolated function getStatus(string orderNumber, string accountEmail) returns string|error {
        string number = normalize(orderNumber);
        Order|sql:Error result = fetchOrder(number);
        if result is sql:NoRowsError {
            return "ORDER_NOT_FOUND: No VoltMart order matches that number. Do not guess a status.";
        }
        if result is sql:Error {
            return error("Could not reach the VoltMart order database.", result);
        }
        if result.accountEmail.toLowerAscii() != accountEmail.trim().toLowerAscii() {
            return "VERIFICATION_FAILED: That email does not match this order. Do not share any order details.";
        }
        return string `Order #${number} (${result.item}): status is "${result.status}", ${result.eta}.`;
    }

    # Create a new VoltMart order in the order database. Call this only when the customer has
    # given you the account email and the item to order. The new order always starts in the
    # "processing" status. Returns ORDER_EXISTS if an order with that number already exists.
    #
    # + orderNumber - The order number to create, e.g. "10644"
    # + accountEmail - The email on the customer's VoltMart account
    # + item - The product being ordered, e.g. "AirWave Pro wireless headphones"
    # + return - A confirmation line, or an ORDER_EXISTS signal
    remote isolated function createOrder(string orderNumber, string accountEmail, string item)
            returns string|error {
        string number = normalize(orderNumber);
        Order|sql:Error existing = fetchOrder(number);
        if existing is Order {
            return "ORDER_EXISTS: An order with that number already exists. Pick a different number.";
        }
        Order newOrder = {
            orderNumber: number,
            accountEmail: accountEmail.trim(),
            item: item,
            status: "processing",
            eta: "ships within 1 business day"
        };
        check insertOrder(newOrder);
        log:printInfo("Created order", orderNumber = number, item = item);
        return string `Order #${number} created for ${item}. Status: processing, ${newOrder.eta}.`;
    }

    # Remove a VoltMart order from the order database. Call this to cancel an order the customer
    # asks to remove. You MUST pass BOTH the order number AND the account email; the order is only
    # removed when the email matches the order on file. Returns VERIFICATION_FAILED if it does not,
    # or ORDER_NOT_FOUND if no order matches the number.
    #
    # + orderNumber - The order number to remove
    # + accountEmail - The email on the customer's VoltMart account, used to verify identity
    # + return - A confirmation line, or a VERIFICATION_FAILED / ORDER_NOT_FOUND signal
    remote isolated function removeOrder(string orderNumber, string accountEmail) returns string|error {
        string number = normalize(orderNumber);
        Order|sql:Error existing = fetchOrder(number);
        if existing is sql:NoRowsError {
            return "ORDER_NOT_FOUND: No VoltMart order matches that number.";
        }
        if existing is sql:Error {
            return error("Could not reach the VoltMart order database.", existing);
        }
        if existing.accountEmail.toLowerAscii() != accountEmail.trim().toLowerAscii() {
            return "VERIFICATION_FAILED: That email does not match this order. The order was not removed.";
        }
        check deleteOrder(number);
        log:printInfo("Removed order", orderNumber = number);
        return string `Order #${number} has been removed.`;
    }
}

// Customers say "#10432" and "10432" interchangeably; the database stores the bare number.
isolated function normalize(string orderNumber) returns string {
    string trimmed = orderNumber.trim();
    return trimmed.startsWith("#") ? trimmed.substring(1) : trimmed;
}
```

Notice how much of part 1 carries straight over. The identity check in `getStatus` and `removeOrder` is the same rule the order-status tool followed in part 1 — *never reveal order details until the email matches* — only now it guards a real database, and the rule lives in the backend where it belongs rather than in the agent. The `VERIFICATION_FAILED` / `ORDER_NOT_FOUND` strings are explicit signals the agent can act on, exactly like `NO_POLICY_FOUND` was for the RAG tool.

### Step A.7 — Run the MCP service and verify the tools

With the database already running from Step A.2, start the orders service with the **Run** button. It comes up on port `8290`, publishing the three tools at `http://localhost:8290/mcp`.

You don't need the agent to test this — any MCP client will do. The quickest check is to confirm the server lists exactly the three tools we wrote:

```bash
curl -s -X POST http://localhost:8290/mcp \
  -H "Content-Type: application/json" \
  -H "Accept: application/json, text/event-stream" \
  -d '{"jsonrpc":"2.0","id":1,"method":"tools/list"}'
```

The response lists `getStatus`, `createOrder`, and `removeOrder`, each with the description and input schema derived from your function. That's the MCP contract the agent will consume next.

[SCREENSHOT: The tools/list response showing the three tools with their descriptions.]

---

## Part B — Connect the MCP service to the agent

Half the work is done: the orders service is live and publishing tools. Now we give the part-1 agent access to them. The beauty of MCP is that we **don't** add three tools one by one — we add the *service* as a single **toolkit**, and the agent gains every tool it publishes at once.

We pick up the `voltmart-support` agent project from part 1.

### Step B.1 — Add the MCP toolkit

A [**toolkit**](https://wso2.com/integration-platform/docs/genai/develop/agents/tools) is a bundle of tools an agent can use. WSO2 Integrator ships a ready-made one for MCP — `ai:McpToolKit` — that connects to an MCP server, discovers its tools at startup, and presents them to the agent as if they were native. It's a single line of construction. Create `mcp_toolkit.bal` in the agent project:

```ballerina
import ballerina/ai;

// ----- MCP toolkit: the bridge from the agent to the orders MCP service (Part 2) -----
//
// `ai:McpToolKit` connects to an MCP server, discovers every tool it publishes at startup,
// and presents them to the agent as native tools — no per-tool wiring. Point it at the orders
// MCP service and the agent gains getStatus, createOrder, and removeOrder all at once. Add a
// tool to the service later and it is picked up automatically, with no change here.
configurable string ordersMcpUrl = "http://localhost:8290/mcp";

final ai:McpToolKit ordersToolKit = check new (ordersMcpUrl,
    info = {name: "VoltMart Orders Client", version: "1.0.0"}
);
```

That's the whole toolkit. When `ai:McpToolKit` is constructed it connects to the server, calls the MCP `tools/list` endpoint, and turns each tool the server reports into something the agent can call — **no hardcoded tool names**. Discovery is automatic, which is exactly why adding a tool to the service later requires zero changes on the agent side (you'll see this pay off in part 3).

> 💡 **Fastest path with Copilot.** You don't even have to type this line. On the **AI Agent** node, click **+** → **Add MCP Server (Tool)**, point it at `http://localhost:8290/mcp`, and WSO2 Integrator generates the toolkit wiring for you. The code above is what it produces — shown here so you understand each piece.

### Step B.2 — Give the agent the toolkit and update its instructions

Open `agents.bal` and add the toolkit to the agent's `tools` list, right alongside the policy tool from part 1:

```ballerina
final ai:Agent voltMartAssistantAgent = check new (
    systemPrompt = { ... },
    model = wso2ModelProvider,
    memory = voltMartMemory,
    // The policy RAG tool from Part 1, plus EVERY tool the orders MCP service publishes
    // (getStatus, createOrder, removeOrder) — added as a single toolkit.
    tools = [searchVoltMartPolicies, ordersToolKit]
);
```

That one addition — `ordersToolKit` — is the entire wiring. The agent now has four tools: `searchVoltMartPolicies` plus the three from the orders service.

Now teach the agent *when* to use them. In part 1 the system prompt told the agent it couldn't look orders up and to fall back to support. We replace that with real tool guidance. Update the **USING YOUR TOOLS** section of the system prompt:

```
USING YOUR TOOLS
- For ANY question about VoltMart policy (shipping, delivery, returns, refunds, warranty, payments, billing, account basics), call searchVoltMartPolicies FIRST and answer only from what it returns. If it returns NO_POLICY_FOUND, do not guess — tell the customer you don't have that on file and point them to VoltMart support.
- For the LIVE status of a specific order, call getStatus. You need BOTH the order number AND the account email; if either is missing, ask for it first. Never reveal order details unless the tool returns them — if it returns VERIFICATION_FAILED or ORDER_NOT_FOUND, tell the customer politely and do not invent a status.
- To place a NEW order, call createOrder once you have the account email and the item. Read the new order number back to the customer.
- To CANCEL/remove an order, call removeOrder. As with status, you need BOTH the order number AND the account email, and the tool only removes it when the email matches.
```

Also drop the two part-1 lines that no longer apply — the one telling the agent it *can't* look up orders, and the one saying it can't change or cancel an order — since those capabilities now exist. (The full, updated `agents.bal` is in the companion project.)

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

Step back and look at what you built. The orders service knows nothing about AI — it's a plain integration over a database that happens to publish MCP tools. The agent knows nothing about PostgreSQL — it just sees four tools and reasons about when to call them. The only thing connecting them is the MCP contract and one line of wiring (`ordersToolKit`). That's the decoupling MCP buys you: either side can change independently, and the same orders service could back a second agent, a mobile app, or Claude Desktop without a single change.

## What's next in the series

The agent can now read and write live order data. But it's still **reactive** — the customer has to ask. In **[part 3](push-live-notifications-with-webhooks.md)** we close that loop: we add an order **status-change** capability that fires a **webhook** the moment an order moves from *processing* → *shipped* → *delivered*, so customers get a live notification pushed to them instead of having to check. As before, we'll build the capability as its own tool and then hand it to the same agent.

A few directions to explore on your own first:

- **Add a fourth tool.** Add an `updateStatus` `remote function` to the MCP service. Restart only the service — the agent picks it up with no changes, thanks to automatic tool discovery. (We'll do exactly this in part 3.)
- **Swap the database.** Point `Config.toml` at a managed PostgreSQL instead of the Docker one. Nothing else changes.
- **Secure the MCP endpoint.** For anything beyond local development, put auth in front of the MCP service — see the [tools documentation](https://wso2.com/integration-platform/docs/genai/develop/agents/tools).

---
