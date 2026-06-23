# Give Your AI Agent Live Data with MCP on WSO2 Integrator

## Introduction

In [part 1 of this series](build-first-ai-integration.md) you built a real AI agent on [WSO2 Integrator](https://wso2.com/integration-platform/docs/genai/overview) — the VoltMart Support Assistant. It answers policy questions from a knowledge base and stays on-topic, but it has a blind spot you probably felt: it can't see *live* data and it can't *do* anything. Ask it *"where's my order #10432?"* and the best it can do is recite the tracking steps from the docs. To actually answer — let alone *act* — the agent has to reach a real backend.

In any real company, that backend already exists, and it almost always exposes itself the same way: as an **HTTP API**. Enterprises run an **order management system** behind a REST service — `GET /orders/123`, `POST /orders`, and so on — often for years. The goal is never to *rebuild* it; it's to connect the agent to the API that's already there, cleanly, without copying the data or rewriting the business rules, so it can *perform the operation* the customer asked for: look up a live order, place a new one, cancel one.

We'll do it the way the agentic world is converging on: **MCP**, the Model Context Protocol. MCP is an open standard — think of it as a universal adapter between agents and the systems they act on. An MCP server publishes a set of named, typed **tools**, and any AI agent (our WSO2 agent) can discover and call them without bespoke integration code. The order system stays where it is and keeps speaking plain HTTP; a small MCP service sits in front of its API and republishes its operations as MCP tools, knowing nothing about any agent. The agent connects as a single **toolkit** and instantly gains every tool it publishes — add a tool later and the agent picks it up automatically. WSO2 Integrator has first-class support for every layer of this.

To keep the tutorial focused on MCP, VoltMart's order system **already exists** — a real **HTTP service backed by a PostgreSQL database**, ready to clone and run from GitHub, exactly the shape of backend you'd already have in production. We put an MCP service in front of *that API*. By the end, the same agent from part 1 will look up live orders, create new ones, and cancel them, all by calling a real REST API over a generated HTTP client. No prior MCP experience needed.

---

## What we are going to build

We'll focus on the two things you build — the MCP service and the agent wiring — on top of an order system that already exists:

1. **VoltMart's order management system — an existing HTTP service.** The backend the agent will ultimately act on, exposed the way real systems are: a REST API (`GET`/`POST`/`DELETE` on `/orders`) over a **PostgreSQL database**. It enforces its own rules — including the **ownership check** that an order is only revealed to the email it belongs to — and knows nothing about AI. In a real company this API *already exists*, so we don't build it here: you'll **clone it from GitHub and run it locally** (or point Part B at your own order API instead).
2. **A VoltMart Orders MCP service** — the bridge that sits *in front of* that API. It calls the order service through a **typed HTTP client generated from the API's OpenAPI contract**, and republishes three order *operations* as MCP tools. It holds no data of its own — it's a thin adapter from HTTP to MCP.
   - `getStatus` — look up an order's live status and ETA.
   - `createOrder` — place a new order.
   - `removeOrder` — cancel/remove an order.
3. **The agent from part 1, now wired to that service** — we add the orders service to the VoltMart agent as a single **MCP toolkit**, so it gains all three tools at once.

### Architecture

![VoltMart with MCP architecture: the customer chats with the AI agent; the agent uses its policy RAG tool plus an MCP toolkit; the toolkit speaks MCP to the standalone VoltMart Orders MCP service; that service calls the VoltMart order management HTTP API through a generated HTTP client; the order API reads and writes a PostgreSQL database running in Docker.](voltmart-orders-mcp/architecture.png)

The agent keeps the policy RAG tool from part 1. Alongside it sits the **MCP toolkit** — the agent's connection to the orders MCP service. When a customer asks about a live order, the agent calls a tool on the toolkit; the toolkit forwards the call over MCP to the **orders MCP service**, which calls the **order management HTTP API** through its generated client; the API runs the real query against **PostgreSQL** and the answer flows back up. Four layers, each one decoupled from the next — they share only a contract (MCP between the agent and the MCP service; the OpenAPI contract between the MCP service and the order API).

> **Companion code.** You'll build the MCP service and wire up the agent below in the low-code editor. If you'd rather read or run the finished result, the complete projects are in the [`voltmart-orders-mcp`](voltmart-orders-mcp) folder — the orders MCP service (`orders-mcp-service`, with the generated client) and the part-1 agent carried forward (`voltmart-support`). The order management API lives in its own repo, which you clone in [Part A](#part-a--get-voltmarts-order-management-system-running). WSO2 Integrator keeps the visual flows and the underlying source in sync, so the projects there are exactly what the clicks below produce.

---

## Prerequisites

You'll need everything from [part 1](build-first-ai-integration.md#prerequisites-getting-your-tools-ready) — WSO2 Integrator installed, a WSO2 account, and the part-1 agent project — plus one new thing:

- **Docker Desktop** (or any Docker engine with Compose). The order service you clone in Part A runs its PostgreSQL database in Docker, so you'll need it to start that backend locally. Install it from `https://www.docker.com/products/docker-desktop/` and make sure `docker compose version` prints a version. (Skip this if you're pointing at your own already-running order API.)

---

## Part A — Get VoltMart's order management system running

> **In your system, this part already exists.** VoltMart's order API is a backend you'd already run in production, so we don't build it in this tutorial — we use a ready-made one. **Already have an order API? Skip to [Part B](#part-b--build-the-voltmart-orders-mcp-service)** and point the HTTP client at your own service instead.

The agent ultimately acts on VoltMart's **order management system**: a plain HTTP service over a PostgreSQL database. The MCP service in Part B will only ever talk to this API — never the database directly — exactly as it would against your real backend. The API exposes three operations on `/orders`:

- **`GET /orders/{orderNumber}?email=…`** — look up an order. Returns `200` with the order, `404` if no order matches the number, or `403` if the email doesn't match the account the order belongs to.
- **`POST /orders`** — create an order from `{ orderNumber, accountEmail, item }`. Returns `201` with the new order, or `409` if that number is already taken.
- **`DELETE /orders/{orderNumber}?email=…`** — remove an order after the same ownership check. Returns `200`, `404`, or `403`.

The one rule worth calling out is the **ownership check**: an order's details are only revealed — and an order is only removed — when the caller supplies the email the order belongs to (compared case-insensitively). That rule lives *in the API*, the system that owns the data, not in the agent's prompt or the MCP adapter, so it holds for every caller: our MCP service, a mobile app, a back-office tool. Each operation also returns its statuses as a *typed* contract (the order plus the `403`/`404`/`409` records), which is what lets the generated client in Part B branch on them with full type safety.

### Clone and run it locally

Get the order service from [VoltMart Order Service](TODO: repo URL) and start it by following the steps in its README. It comes up on **`http://localhost:8080/orders`**, backed by a PostgreSQL container (this is the one place you need Docker) and seeded with a few orders to work with.

Once it's up, a quick check from the command line — no agent, no MCP, just HTTP — confirms it's live and that the ownership check works:

```bash
# A real order, with the matching email → 200 and the order
curl -s "http://localhost:8080/orders/10432?email=jordan@example.com"

# The wrong email → 403, no details leak
curl -s -o /dev/null -w "%{http_code}\n" "http://localhost:8080/orders/10432?email=wrong@example.com"
```

The first call returns order `10432` as JSON; the second prints `403`. That's the live backend the agent could never reach from a knowledge base — and the contract Part B will consume.

[SCREENSHOT: A terminal showing the two curl calls and their responses.]

---

## Part B — Build the VoltMart Orders MCP service

With the order API in place (whether the one from Part A or your own), we now build the integration that sits **in front of** it and republishes its operations as MCP tools. We'll do it one layer at a time: first the project, then the **HTTP client** that reaches the order API, then the MCP service that publishes the three tools. Each layer is checked before we move on.

### Step B.1 — Create the orders MCP service project

The MCP service is a **separate integration** from both the order API and the agent — its own project, its own runtime. Keeping it separate is the whole point: it's a thin adapter that turns an existing HTTP API into agent tools, without the order system knowing anything about it.

1. In WSO2 Integrator, create a new integration. Set **Integration Name** to `VoltMartOrders` and **Project Name** to `orders-mcp-service`.
2. Select **Create Integration**.

[SCREENSHOT: The "Create New Integration" dialog for the orders-mcp-service project.]

### Step B.2 — Create an HTTP client for the order API

This service never touches the database — it calls the order API. The cleanest way to do that in WSO2 Integrator is to **generate a typed client from the API's OpenAPI contract**, so every operation becomes a named method with typed inputs and outputs. You can get that contract two ways: it ships in the order service repo as `orders_openapi.yaml`, and WSO2 Integrator can also produce it for you — open the order API project and it exposes the OpenAPI definition of the `/orders` service. Either way you end up with the same `orders_openapi.yaml`.

Now create the client connection:

1. In the `orders-mcp-service` design view, select **+ Add Artifact**, then **Connection** under **Other Artifacts**.
2. Choose **Connect Via API Specification** and provide the order API's OpenAPI file (`orders_openapi.yaml`).
3. In the **Create Connection** step, expand **Advanced Configurations** and set the **Service Url** to where the order API runs — `http://localhost:8080/orders`.
4. Enter a **Connection Name** like `ordersApi` and select **Save Connection**.

WSO2 Integrator generates a fully typed client from the contract. Its remote methods are named after the API's operations — `getOrder`, `createOrder`, `removeOrder` — and they return the API's typed responses, including the `403`/`404`/`409` status records. In source, the generated client is initialized once and shared:

```ballerina
import orders_mcp_service.ordersapi as api;

configurable string ordersApiUrl = "http://localhost:8080/orders";

final api:Client ordersApi = check new (serviceUrl = ordersApiUrl);
```

[SCREENSHOT: The "Connect Via API Specification" flow importing the order API's OpenAPI file.]

> 💡 Because the client is generated from the contract, the order API's shape is checked at build time. If the API adds a field or an operation, you regenerate the client and the compiler tells you exactly what changed — no hand-written URL strings to drift out of sync. See [Connections](https://wso2.com/integration-platform/docs/develop/integration-artifacts/supporting/connections) and the [OpenAPI tool](https://wso2.com/integration-platform/docs/develop/tools/integration-tools/openapi-tool) for the full reference.

### Step B.3 — Create the MCP service

This is the heart of the article. An **MCP service** is an integration artifact that publishes tools over the Model Context Protocol — any MCP client (our agent, Claude Desktop, an IDE) can then discover and call them. WSO2 Integrator gives you a dedicated artifact for it, so there's nothing low-level to wire up.

1. Select **+ Add Artifact**.
2. Under **AI Integration**, select **MCP Service**.
3. Fill in the creation form:
   - **Service Name:** `VoltMart Orders` — the display name MCP clients see.
   - **Version:** `1.0.0`.
   - **Port:** `8290` — the port the service listens on.
   - **Base Path:** `/mcp` — so the service is reachable at `http://localhost:8290/mcp`.
4. Select **Create**.

WSO2 Integrator opens the **MCP Service editor**: a listener, an empty **Tools** section with a **+ Add Tool** button, and **Try It** for testing. The three tools come next — each one is added the same way: fill a short form, then build a flow that calls the `ordersApi` client and translates the result.

[SCREENSHOT: The empty MCP Service editor showing the Tools section and the + Add Tool button.]

See [Exposing a service as MCP](https://wso2.com/integration-platform/docs/genai/develop/mcp/overview) for the full reference.

### Step B.4 — Add the `getStatus` tool

Our first tool looks up an order's live status by calling the order API. This is the live order lookup part 1 deliberately left out, now reading through a real REST call.

**Add the tool.** In the MCP Service editor, click **+ Add Tool** and fill in the form:

1. **Name:** `getStatus`. This is the tool name MCP clients see, so make it clear.
2. **Description:** the single most important field — it's what the calling agent reads to decide *when* to use this tool, and the rule it must follow. Paste in:

   ```
   Look up the current status and delivery ETA of a VoltMart order. You MUST pass BOTH the order number AND the account email. Details are returned ONLY when the email matches the order on file — that is the identity check. Returns VERIFICATION_FAILED if the email does not match, or ORDER_NOT_FOUND if no order matches the number. Never share details this tool did not return.
   ```
3. **Parameters:** add two `string` parameters:
   - `orderNumber` — *"The order number, e.g. 10432 (a leading # is fine)."*
   - `accountEmail` — *"The email address on the customer's VoltMart account."*
4. **Return Type:** `string` — the status line, or one of the `VERIFICATION_FAILED` / `ORDER_NOT_FOUND` signals.
5. Select **Save**. WSO2 Integrator opens an **empty flow diagram** for the tool — this is where we call the API and map its response.

Now build the flow. The pattern for every tool is the same: **call the `ordersApi` client, then map each typed response to a string the agent understands.** For `getStatus`:

1. Click **+** → under **Connections**, select `ordersApi` and choose its **getOrder** operation. Pass the `orderNumber` parameter and the `accountEmail` as the `email` query argument; bind the result to a variable.
2. The order API already does the lookup and the ownership check, so the tool's job is just translation. Map the client's typed result:
   - On a **200** (`OrderOk`) — return a status line built from the order, e.g. `Order #10432 (AirWave Pro wireless headphones): status is "shipped", arriving Thursday, 18 June 2026.`
   - On a **404** (`ErrorMessageNotFound`) — return `"ORDER_NOT_FOUND: …"`, an explicit signal the agent can act on instead of a blank.
   - On a **403** (`ErrorMessageForbidden`) — return `"VERIFICATION_FAILED: …"`. This is the rule the system prompt depends on, enforced in the backend and surfaced here.

WSO2 Integrator keeps the flow and the source in sync; the result is:

```ballerina
remote isolated function getStatus(string orderNumber, string accountEmail) returns string|error {
    api:OrderOk|api:ErrorMessageForbidden|api:ErrorMessageNotFound|api:ErrorPayloadInternalServerError|api:ErrorPayloadBadRequest|error result =
        ordersApi->getOrder(orderNumber, email = accountEmail);
    if result is api:OrderOk {
        api:Order ord = result.body;
        return string `Order #${ord.orderNumber} (${ord.item}): status is "${ord.status}", ${ord.eta}.`;
    }
    if result is api:ErrorMessageNotFound {
        return "ORDER_NOT_FOUND: No VoltMart order matches that number. Do not guess a status.";
    }
    if result is api:ErrorMessageForbidden {
        return "VERIFICATION_FAILED: That email does not match this order. Do not share any order details.";
    }
    return error("Could not reach the VoltMart order service.");
}
```

[SCREENSHOT: The getStatus tool flow — the ordersApi getOrder call and the response mapping.]

> **Why the MCP service is so thin.** Notice there's no database query and no identity logic here — that all lives in the order API. The MCP service's only job is to translate between two worlds: it turns a typed HTTP response into the plain-string signals an LLM reasons about best. Keeping the business rule in the backend and the translation in the adapter is what lets either side change without touching the other.

### Step B.5 — Add the `createOrder` tool

Back in the MCP Service editor, click **+ Add Tool** again:

1. **Name:** `createOrder`.
2. **Description:**

   ```
   Create a new VoltMart order in the order system. Call this only when the customer has given you the account email and the item to order. The new order always starts in the "processing" status. Returns ORDER_EXISTS if an order with that number already exists.
   ```
3. **Parameters:** three `string` parameters — `orderNumber`, `accountEmail`, and `item` (*"The product being ordered, e.g. AirWave Pro wireless headphones."*).
4. **Return Type:** `string`.
5. **Save**, then build the flow: call `ordersApi`'s **createOrder** operation with an order built from the three parameters, then map the result — a **201** (`OrderCreated`) becomes a confirmation line, a **409** (`ErrorMessageConflict`) becomes `"ORDER_EXISTS: …"`.

```ballerina
remote isolated function createOrder(string orderNumber, string accountEmail, string item)
        returns string|error {
    api:NewOrder newOrder = {orderNumber, accountEmail, item};
    api:OrderCreated|api:ErrorMessageConflict|api:ErrorPayloadInternalServerError|api:ErrorPayloadBadRequest|error result =
        ordersApi->createOrder(newOrder);
    if result is api:OrderCreated {
        api:Order ord = result.body;
        return string `Order #${ord.orderNumber} created for ${ord.item}. Status: ${ord.status}, ${ord.eta}.`;
    }
    if result is api:ErrorMessageConflict {
        return "ORDER_EXISTS: An order with that number already exists. Pick a different number.";
    }
    return error("Could not reach the VoltMart order service.");
}
```

> **Note.** To keep the tutorial simple, the order number is passed in as a parameter. A production API would generate it server-side (a sequence or UUID) and return it, rather than trusting the caller to supply a unique one.

### Step B.6 — Add the `removeOrder` tool

One more time — **+ Add Tool**:

1. **Name:** `removeOrder`.
2. **Description:**

   ```
   Remove a VoltMart order from the order system. You MUST pass BOTH the order number AND the account email; the order is only removed when the email matches the order on file. Returns VERIFICATION_FAILED if it does not, or ORDER_NOT_FOUND if no order matches the number.
   ```
3. **Parameters:** two `string` parameters — `orderNumber` and `accountEmail`.
4. **Return Type:** `string`.
5. **Save**, then build the flow. It's the same shape as `getStatus` — call `ordersApi`'s **removeOrder** operation, then map **200** to a removal confirmation, **404** to `ORDER_NOT_FOUND`, and **403** to `VERIFICATION_FAILED`. The order API enforces the ownership check before deleting, so the wrong email never removes a row.

> Notice the pattern across all three tools: **call the API, then map each status to an explicit signal.** The `VERIFICATION_FAILED` / `ORDER_NOT_FOUND` / `ORDER_EXISTS` strings are the same explicit-signal style as `NO_POLICY_FOUND` from part 1 — the agent reads them and responds sensibly instead of guessing. The HTTP status codes carry the meaning; the MCP tool turns them into words the model understands.

### Step B.7 — Run the MCP service and verify the tools

With the database and the order API both running, start the MCP service with the **Run** button. It comes up on port `8290`, publishing the three tools at `http://localhost:8290/mcp`.

You don't need the agent to test this. The quickest check is the editor's **Try It** panel, which lists the three tools and lets you invoke one directly — try `getStatus` with `10432` / `jordan@example.com` and watch the call travel through the HTTP client to the order API and back with the live status.

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

## Part C — Connect the MCP service to the agent

The orders service is live and publishing tools. Now we give the part-1 agent access to them. The beauty of MCP is that we **don't** add three tools one by one — we point the agent at the *service*, and it discovers every tool at once.

Reopen the `voltmart-support` agent from part 1.

### Step C.1 — Add the orders service as an MCP server

1. Open the **AI Chat Agent** and click the **AI Agent** node.
2. Click **+ Add Tool**, then choose **Use MCP Server**.
3. In the **Add MCP Server** panel:
   - **Server URL:** `http://localhost:8290/mcp` — the orders MCP service from Part B.
   - **Tools to Include:** leave it at **All** (we want all three).
   - **Info → name / version:** an identifier for this client, e.g. `VoltMart Orders Client` / `1.0.0`.
4. The panel queries the server and lists the discovered tools — `getStatus`, `createOrder`, `removeOrder`. Confirm they appear, then select **Save**.

[SCREENSHOT: The "Add MCP Server" panel showing the three discovered tools after entering the server URL.]

That's the entire wiring. The agent now has four tools: `searchVoltMartPolicies` from part 1, plus the three it just discovered. There were **no tool names to type** — discovery is automatic, which is why adding a tool to the service later (as we'll do in part 3) needs no change here.

See [Consuming MCP from an agent](https://wso2.com/integration-platform/docs/genai/develop/mcp/overview) for more.

### Step C.2 — Update the agent's instructions

The agent can now reach the order tools, but it still needs to know *when* to use them. Click the **AI Agent** node, open the **Instructions** (system prompt) editor, and update the **USING YOUR TOOLS** section so it reads:

```
USING YOUR TOOLS
- For ANY question about VoltMart policy (shipping, delivery, returns, refunds, warranty, payments, billing, account basics), call searchVoltMartPolicies FIRST and answer only from what it returns. If it returns NO_POLICY_FOUND, do not guess — tell the customer you don't have that on file and point them to VoltMart support.
- For the LIVE status of a specific order, call getStatus. You need BOTH the order number AND the account email; if either is missing, ask for it first. Never reveal order details unless the tool returns them — if it returns VERIFICATION_FAILED or ORDER_NOT_FOUND, tell the customer politely and do not invent a status.
- To place a NEW order, call createOrder once you have the account email and the item. Read the new order number back to the customer.
- To CANCEL/remove an order, call removeOrder. As with status, you need BOTH the order number AND the account email, and the tool only removes it when the email matches.
```

Then remove the two part-1 lines that no longer apply — the one telling the agent it *can't* look up orders, and the one saying it can't change or cancel an order — since those capabilities now exist. Select **Save**.

> **Why the identity rule shows up in the prompt too.** You'll notice the prompt asks the agent for the email *and* the order API enforces the match. That's deliberate: the prompt makes for a good conversation (the agent asks first instead of triggering a `403`), while the API enforces the rule no matter what any client does. Never trust the prompt alone for a security boundary — the backend is the source of truth.

---

## Take it for a spin

Make sure everything is running: the **order service** (port 8080, started from its repo as in [Part A](#part-a--get-voltmarts-order-management-system-running)), the **orders MCP service** (port 8290), and the **agent** (the **Run** button, port 9090). Then open the agent's **Chat** panel — or `curl` against `http://localhost:9090/voltMartAssistant/chat` as in part 1.

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

**Output (turn 2 — live status, straight from the order API):**

```json
{
  "message": "Thanks! Order #10432 (AirWave Pro wireless headphones) has shipped and is arriving Thursday, 18 June 2026."
}
```

*Expected behavior:* the agent asks for the email, calls `getStatus` over MCP, which calls `getOrder` on the order API, and reports the status only after the email matches the row in the database.

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

*Expected behavior:* calls `createOrder`, which `POST`s to the order API; the new row is now in the database. Confirm it straight through the order API:

```bash
curl -s "http://localhost:8080/orders/10644?email=dana@example.com"
```

#### Sample 3 — Identity check on removal

Try to cancel an order with the wrong email, and the service refuses — the rule is enforced by the order API, not just the prompt.

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

*Expected behavior:* calls `removeOrder`; the order API returns `403`; the MCP tool maps it to `VERIFICATION_FAILED`, and the order stays in the database untouched.

[SCREENSHOT: The Chat panel running Sample 1, with the trace showing the getStatus MCP call.]

---

## What just happened

Step back and look at what you built. The agent no longer just *answers* about orders — it *acts* on them, reaching a real backend to look up, create, and cancel live data on the customer's behalf. And the way it does that is the whole point: four layers, each one ignorant of the others' internals. The **order API** is a plain HTTP service over a database — it knows nothing about AI, only orders and the rules that govern them. The **MCP service** knows nothing about PostgreSQL — it holds a generated client and translates HTTP responses into tool results. The **agent** knows nothing about either — it just sees four tools and reasons about when to call them. Between each pair sits a single contract: the OpenAPI definition between the MCP service and the API, and the MCP protocol between the agent and the MCP service.

That layering is what makes it real. Swap the Docker database for the order system you already run in production and nothing above the API changes. Put the same order API behind a mobile app or a back-office tool and the MCP service doesn't care. Point a second agent — or Claude Desktop — at the MCP service and it gains all three tools for free. Each layer can change independently, because none of them reaches past its contract.

## What's next in the series

Your agent can now read and write *live* order data over MCP, through a real REST API behind a clean
contract. That's a big step up from the policy-only agent you started part 2 with. But there's still
a gap: when a customer wants to *return* something, the agent can only point them at support. The
next two parts close that gap and then take the whole thing to production, building directly on the
projects you just extended:

- **Part 3 — Act on a request, then push a live notification over a webhook.** Right now the agent
  can't file a return. In part 3 we add a `requestReturn` capability that lets the agent file a
  return on the customer's behalf and fires a **webhook** the moment it does, pushing a live alert to
  the VoltMart returns team. Crucially, the agent files the request but never decides the outcome —
  which is what makes it a safe write to put in front of customers. As before, we build it as its own
  tool and hand it to this same agent. See
  [Live notifications with webhooks](push-live-notifications-with-webhooks.md).
- **Part 4 — Deploy it to WSO2 Cloud and observe it.** In part 4 we take the finished agent (and the
  order API and MCP service it depends on) to production on **WSO2 Cloud**, switch it to a
  production model provider and a managed database, and **observe** every tool call and decision — with
  the dev-time agent trace viewer and the cloud's runtime logs, metrics, alerts, and traces. See
  [Deploy and observe your AI agent on WSO2 Cloud](deploy-and-observe-on-wso2-cloud.md).

And a few directions to explore on your own, beyond the series:

- **Add a fourth tool.** Click **+ Add Tool** on the MCP service and add one more — perhaps fronting
  another order API operation. Restart only the MCP service — the agent picks it up with no changes,
  thanks to automatic tool discovery. (We'll do exactly this in part 3.)
- **Point at a real order API.** Change the `ordersApi` client's **Service Url** to a managed order
  service instead of the local one. Nothing else in the MCP service or the agent changes.
- **Secure the endpoints.** For anything beyond local development, put auth in front of both the order
  API and the MCP service — see the [tools documentation](https://wso2.com/integration-platform/docs/genai/develop/agents/tools).

---
