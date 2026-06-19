# Push Live Notifications from Your AI Agent with Webhooks on WSO2 Integrator

## Introduction

Across this series your VoltMart Support Assistant has grown up fast. In [part 1](build-first-ai-integration.md) it learned to answer policy questions from a knowledge base. In [part 2](connect-live-data-with-mcp.md) it gained a live orders backend over **MCP**, so it can look up, create, and cancel real orders in a PostgreSQL database.

But there's still a gap, and it's the one customers feel most. When someone says *"my speaker arrived damaged, I'd like to send it back,"* the best the agent can do today is recite the returns policy and point them at the support team — exactly where part 1 left off. The request lands nowhere. Nobody on the team hears about it until the customer chases it down a second time.

That's what this part closes. We'll give the agent the ability to **file a return on the customer's behalf** — and the moment it does, a **webhook** pushes a live alert to the VoltMart returns team, so a human is on it immediately. The customer gets an instant, honest confirmation; the team gets a real-time signal instead of polling a queue.

And notice what we are deliberately **not** doing. The agent never decides the outcome — it doesn't approve the refund, and it doesn't change the order. It *routes a customer's legitimate request* to the people who own that decision. That's what makes this capability safe to put in front of customers: a tool a customer can trigger should never be one that lets them do something they shouldn't. Filing a return is something a customer is entitled to do; advancing their own order's status, or approving their own refund, is not.

If you've followed parts 1 and 2, you have everything you need. Let's close the loop.

---

## What is a webhook, and why here?

A **webhook** is a reverse API call. Instead of a client repeatedly asking *"anything new yet?"* (polling), the system that *has* the news makes an HTTP call **out** to a URL you registered, the moment the event happens. It's the difference between a support team refreshing a returns queue every few minutes and getting pinged the instant a request comes in.

For VoltMart this is exactly the right tool. A return request is an **event** — discrete, timed, and worth acting on immediately. Polling a database for new requests would be wasteful and slow; a webhook delivers the alert at the instant the customer files, to whatever channel actually reaches the team (a ticketing system, a Slack channel, an ops dashboard).

So we add two things:

- A **publisher** — the orders service gains a `requestReturn` tool that records the request and then POSTs a `return.requested` event.
- A **subscriber** — a small returns-team inbox that receives those events and turns them into the alert a human would act on.

And because the publisher is just another MCP tool, the agent gains the ability to file a return with zero new wiring — the same automatic discovery you saw in part 2.

---

## What we are going to build

Building on the part-2 project, we'll add:

1. **A `requestReturn` MCP tool** on the orders service. It verifies the customer's identity, checks the order is eligible (delivered, and within the 30-day return window), records the request in PostgreSQL, and **fires a webhook**.
2. **A returns-team receiver** — a standalone webhook subscriber that receives the event and composes the alert the team would actually see.
3. **The agent, unchanged in wiring** — it discovers `requestReturn` automatically over MCP; we only update its instructions so it knows when to use it, and that it must never promise a refund.

### Architecture

![VoltMart returns webhook architecture: the customer asks the AI agent to return an item; the agent calls requestReturn over MCP on the orders service; the orders service verifies identity and the 30-day window, records the request in PostgreSQL, and fires a webhook to the returns-team receiver, which alerts a human. The agent never approves the refund.](voltmart-orders-webhook/architecture.png)

The flow reads left to right and then *pushes* onward: the customer asks the agent to return an item; the agent calls `requestReturn`; the orders service verifies the request, writes it to **PostgreSQL**, and immediately POSTs a `return.requested` event to the **returns-team receiver**; the team is alerted in real time. The webhook is fire-and-forget — the request is safely recorded regardless of whether the alert is delivered. Crucially, the decision (approve, reject, refund) stays with the team; the agent only files.

> **Companion code.** You'll build everything below in the low-code editor. The finished projects — the part-2 orders service with `requestReturn` added, plus the new returns-team receiver — are in the [`voltmart-orders-webhook`](voltmart-orders-webhook) folder if you'd rather read or run the result.

---

## Prerequisites

Everything from [part 2](connect-live-data-with-mcp.md#prerequisites) — WSO2 Integrator, Docker, and the part-2 projects (the agent and the orders MCP service with its database). We build directly on top of them.

---

## Step 1 — Extend the database for returns

Part 2's database had everything an order needs *except* a way to know when a return is allowed and somewhere to record one. We add both: a `delivered_date` on each order (so we can enforce the 30-day window) and a `returns` table (the durable record of every request the agent files).

Open `db/init.sql` in the `orders-service` project and replace it with the version below. Two changes on top of part 2: the new `delivered_date` column (with two delivered seed orders to test against), and the new `returns` table.

```sql
-- Schema + seed data for VoltMart's order database.
-- Runs automatically the first time the Postgres container starts.

CREATE TABLE IF NOT EXISTS orders (
    order_number   TEXT PRIMARY KEY,
    account_email  TEXT NOT NULL,
    item           TEXT NOT NULL,
    -- processing | shipped | delivered
    status         TEXT NOT NULL DEFAULT 'processing',
    eta            TEXT NOT NULL,
    -- The day the order was delivered (NULL until it is). requestReturn uses this to enforce
    -- the 30-day window. Seeded RELATIVE to CURRENT_DATE so the eligibility checks behave the
    -- same whenever you run the tutorial, instead of rotting on a fixed calendar date.
    delivered_date DATE
);

INSERT INTO orders (order_number, account_email, item, status, eta, delivered_date) VALUES
    ('10432', 'jordan@example.com', 'AirWave Pro wireless headphones', 'shipped',    'arriving in 2-3 business days', NULL),
    ('10588', 'priya@example.com',  'SoundDock 2 Bluetooth speaker',   'processing', 'ships within 1 business day',    NULL),
    -- Delivered 9 days ago: inside the 30-day window, so it can be returned.
    ('10219', 'sam@example.com',    'VoltBook 14 laptop',              'delivered',  'delivered',                     CURRENT_DATE - 9),
    -- Delivered 48 days ago: past the window, so requestReturn rejects it.
    ('10350', 'alex@example.com',   'PowerCharge 65W USB-C adapter',   'delivered',  'delivered',                     CURRENT_DATE - 48)
ON CONFLICT (order_number) DO NOTHING;

-- Return requests filed through the requestReturn tool. The orders service INSERTs a row here,
-- then fires a webhook so the returns team is alerted in real time. This table is the durable
-- record; the team owns everything past 'requested'.
CREATE TABLE IF NOT EXISTS returns (
    id            SERIAL PRIMARY KEY,
    order_number  TEXT NOT NULL REFERENCES orders(order_number),
    account_email TEXT NOT NULL,
    item          TEXT NOT NULL,
    reason        TEXT NOT NULL,
    -- requested | approved | rejected
    status        TEXT NOT NULL DEFAULT 'requested',
    requested_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);
```

The init script only runs the **first time** the container starts, so recreate the database to pick up the new schema and seed data:

```bash
docker compose down -v   # stop and wipe the old volume
docker compose up -d     # start fresh — the new schema and seed rows are created
```

Confirm the two delivered orders are there, one inside the window and one outside:

```bash
docker exec -it voltmart-orders-db \
  psql -U voltmart -d voltmart_orders \
  -c "SELECT order_number, status, delivered_date, CURRENT_DATE - delivered_date AS days_ago FROM orders WHERE status = 'delivered';"
```

You'll see `10219` at ~9 days and `10350` at ~48 days. The database is ready.

> 💡 **Why a relative `delivered_date`?** A tutorial that hardcodes `2026-06-09` would silently fall out of its 30-day window over time, breaking the "eligible" demo for anyone who runs it later. Seeding with `CURRENT_DATE - 9` keeps the eligible/expired examples correct whenever you run it.

## Step 2 — Build the returns-team receiver (the subscriber)

We'll build the subscriber first, so there's something live for the webhook to call. This is a stand-in for whatever actually reaches the returns team — a ticketing system, a Slack channel, an ops dashboard. It's a plain HTTP service that listens for `return.requested` events.

1. In WSO2 Integrator, create a new integration. Set **Integration Name** to `VoltMartNotifications` and **Project Name** to `notifications-receiver`, then **Create Integration**.
2. Add the endpoint that receives webhooks. Select **+ Add Artifact** → **Service**, and configure it:
   - **Listener port:** `9091`.
   - **Base path:** `/notifications`.
   - Add a resource with **HTTP method** `POST` and **path** `return-requested` — so the full webhook URL is `http://localhost:9091/notifications/return-requested`.
   - **Payload:** accept the incoming JSON event (a return reference, order number, account email, item, and reason).
3. Select **Create**. WSO2 Integrator opens the resource's flow diagram.

[SCREENSHOT: The Service creation form with port 9091, base path /notifications, and the POST return-requested resource.]

Now build the flow that turns an event into a team alert.

**⚡ With WSO2 Integrator Copilot (fastest path).** Click **Generate with AI** and describe it — *"From the incoming return-requested payload, compose an alert for the returns team that includes the return reference, order number, item, customer email, and reason, log it as the alert the team received, and respond with 202 Accepted."* Review and **Keep**.

**Prefer to build it by hand?** On the flow line:
1. Click **+** → **Log** (Info) and write a message that includes the return reference, the order number, the customer's email, and the reason — e.g. *"New return request RMA-1: order #10219 (VoltBook 14 laptop) from sam@example.com — reason: 'arrived damaged'. Please review and email the customer their next steps."* In a real system this node would **open a ticket** or post to the team's channel instead of logging.
2. Click **+** → **Return** (or set the resource response) to reply **202 Accepted** — the conventional webhook acknowledgement that says *"I've received the event and taken responsibility for it."*

Run this project (**Run** button). It now waits on port `9091` for webhooks — nothing calls it yet, which we fix next.

> 💡 **Why 202, and why fire-and-forget?** The receiver returns quickly and the publisher never waits on a downstream ticket system. Coupling a database write to the availability of the team's inbox would be fragile — so we keep them independent.

## Step 3 — Add the webhook connection to the orders service

Switch back to the **orders-service** project from part 2. For the service to call *out* to the receiver, it needs an **HTTP connection** pointing at it.

1. In the design view, select **+ Add Artifact** → **Connection**.
2. In the connector store, search for **HTTP** and select it.
3. In the **Add New Connection** form, set the **Base URL** to `http://localhost:9091/notifications` and name the connection `notifier`.
4. Select **Create**.

[SCREENSHOT: The HTTP "Add New Connection" form pointing at the returns-team receiver.]

That's the outbound channel. The `requestReturn` tool we build next will use it to deliver the event.

## Step 4 — Add the `requestReturn` tool that fires the webhook

Now the centerpiece. Open the **VoltMart Orders MCP service** (the same one from part 2) and click **+ Add Tool** — exactly as you added the other three. This tool verifies the request, records it, and pushes the alert in the same flow.

**Add the tool.** Fill in the form:

1. **Name:** `requestReturn`.
2. **Description:** what the agent reads to decide when to use it — and the boundary it must respect:

   ```
   Start a return request for a delivered VoltMart order and alert the returns team. You MUST pass BOTH the order number AND the account email; a return is filed only when the email matches the order on file. Call this when a customer wants to return or send back an item they have received. This does NOT approve a refund or change the order — it files the request and notifies the VoltMart returns team, who decide the outcome. Returns ORDER_NOT_FOUND if no order matches, VERIFICATION_FAILED if the email does not match, NOT_ELIGIBLE if the order has not been delivered yet, or RETURN_WINDOW_CLOSED if it was delivered more than 30 days ago.
   ```
3. **Parameters:** three `string` parameters — `orderNumber`, `accountEmail`, and `reason` (*"The customer's reason for the return, in their own words."*).
4. **Return Type:** `string`.
5. Select **Save** to open the tool's flow diagram.

Now build the flow — it follows the same shape as every other tool in this service: **fetch, guard with explicit signals, then act.** Here "act" is two steps: record the request, then fire the webhook.

**⚡ With WSO2 Integrator Copilot (fastest path).** Click **Generate with AI** and describe it — *"Normalize `orderNumber` (strip a leading #). Look the order up in the `ordersDb` connection, also computing how many days ago it was delivered (`CURRENT_DATE - delivered_date`). If no row matches, return `\"ORDER_NOT_FOUND\"`. If the order's `account_email` doesn't match the `accountEmail` parameter, return `\"VERIFICATION_FAILED\"`. If the order isn't delivered, return `\"NOT_ELIGIBLE\"`. If it was delivered more than 30 days ago, return `\"RETURN_WINDOW_CLOSED\"`. Otherwise INSERT a row into the `returns` table (order number, email, item, reason) and capture its id; POST a return-requested event — a reference of `RMA-<id>`, order number, account email, item, and reason — to the `notifier` connection's `/return-requested` path; don't fail the tool if that POST fails; and return a confirmation that gives the RMA reference and makes clear no refund is approved yet."* Review and **Keep**.

**Prefer to place the nodes by hand?** On the flow line:

1. **Fetch the order with its delivery age.** Click **+** → **Connections** → `ordersDb` → the **query** action, selecting the order by `orderNumber` and also computing `(CURRENT_DATE - delivered_date) AS days_since_delivery`. Bind it to `order`. Add an **If** for the not-found case that **Returns** `"ORDER_NOT_FOUND: No VoltMart order matches that number."`
2. **Verify identity.** Click **+** → **If**, comparing `order.accountEmail` to the `accountEmail` parameter (case-insensitively). In the **else** branch, **Return** `"VERIFICATION_FAILED: That email does not match this order. No return was filed."` — the same identity rule the other tools enforce.
3. **Check eligibility.** Click **+** → **If** to confirm `order.status` is `delivered`; otherwise **Return** `"NOT_ELIGIBLE: This order hasn't been delivered yet, so it can't be returned."` Then **+** → **If** that `days_since_delivery` is `> 30`; if so, **Return** `"RETURN_WINDOW_CLOSED: This order was delivered more than 30 days ago, past the 30-day return window. The returns team can still review exceptions."`
4. **Record the request.** Click **+** → **Connections** → `ordersDb` → the **execute** action running an `INSERT` into the `returns` table (order number, account email, item, reason), returning the new `id`. Build a reference like `RMA-<id>` from it.
5. **Fire the webhook.** Click **+** → **Connections** → `notifier` → the **POST** action. Set the path to `/return-requested` and the body to a JSON event built from the request: the reference, order number, account email, item, and reason. This is the single node that turns a recorded request into a live team alert.
6. **Return a confirmation.** Click **+** → **Return** with a line like `Return request RMA-1 filed for order #10219 (VoltBook 14 laptop). Our returns team has been notified and will email you next steps within one business day. No refund has been approved yet — the team reviews every request.`

[SCREENSHOT: The requestReturn tool flow — query, identity and eligibility guards, the returns INSERT, the notifier POST node, and the Return.]

> **Keep delivery best-effort.** The request is recorded in the database *before* the webhook fires, and a failed POST should not fail the tool — the return really was filed. If you're building by hand, wrap the POST so a delivery error is logged and ignored rather than propagated. (The companion project does exactly this.)

> **Why this tool is safe to expose to customers.** Every other write in this service is guarded, but `requestReturn` is the one a customer most directly drives — so look at what it can and can't do. It verifies the caller owns the order (the same email check as `getStatus`), only acts on a *delivered, in-window* order, and writes nothing but a *request* row that a human still has to action. It cannot approve a refund, move money, or change the order. The worst a customer can do is ask to return their own eligible item — which is exactly what they're entitled to do. Contrast that with a tool that let a customer set their order's status to "delivered": that would be a privilege they should never hold. The rule is enforced in the backend, not just the prompt — never trust the prompt alone for a boundary that matters.

## Step 5 — Let the agent drive it

Here's the payoff from choosing MCP in part 2. The agent connects to the orders service through the **Use MCP Server** tool you added in part 2, and MCP discovers tools automatically. You just added `requestReturn` to that service — so the agent will pick it up with **no changes to its tool configuration at all**. (If the agent was running, restart it so it re-discovers the service's tools.)

The only thing to change is the agent's instructions, so it knows when the new tool is appropriate — and, just as importantly, where its authority ends. In the **voltmart-support** agent, click the **AI Agent** node, open the **Instructions** editor, and add one line to the **USING YOUR TOOLS** section:

```
- To RETURN an item the customer has received, call requestReturn with the order number, the account email, and the customer's reason (ask for any that are missing). This FILES the request and alerts our returns team — it does NOT approve a refund. Confirm the request and read back the return reference, but never promise a refund or outcome. If the tool returns NOT_ELIGIBLE or RETURN_WINDOW_CLOSED, explain that plainly and point the customer to the support team for any exception.
```

Then adjust the **WHEN YOU CAN'T HELP** section so a return now has a real path instead of a dead end, while a refund decision still doesn't:

```
- The customer disputes a charge, or asks for a refund, discount, or any exception to policy. (You may still file a return with requestReturn, but you cannot approve the refund itself.)
- The customer reports a damaged or defective item and wants money back rather than a return — file the return if they want one, but leave the refund decision to the team.
```

Select **Save**. The `GUARDRAILS` block from part 1 still holds — *never authorize refunds, discounts, or exceptions* — which is exactly the line `requestReturn` respects: it files, the team decides.

> **Who actually triggers this, and where the boundary lives.** Filing a return is one of the few writes a customer should be able to drive directly — so it's a good fit for the customer-facing agent. Anything that *decides* the outcome (refund, exception) stays with the team, enforced by the fact that no tool exposes it. For staff-only actions you'd go further and put auth in front of the MCP endpoint so privileged tools are reachable only by a staff client — see *Where to go next*.

---

## Take it for a spin

This time there are **four** things to run. Start them in order:

1. **The database:** `docker compose up -d` (from `orders-service`, after the Step 1 recreate).
2. **The returns-team receiver:** open the `notifications-receiver` project and click **Run** (comes up on port 9091).
3. **The orders MCP service:** **Run** the `orders-service` project (port 8290).
4. **The agent:** **Run** the `voltmart-support` project (port 9090).

Keep an eye on the **returns-team receiver's console** — that's where the live alert will appear.

#### Sample 1 — A return request pushes a live alert

Ask the agent to return a delivered, in-window order:

```bash
curl -X POST http://localhost:9090/voltMartAssistant/chat \
  -H "Content-Type: application/json" \
  -d '{
    "sessionId": "ret-1",
    "message": "I want to return order #10219, it arrived damaged. My email is sam@example.com."
  }'
```

**Agent output:**

```json
{
  "message": "Done — I've filed return request RMA-1 for order #10219 (VoltBook 14 laptop). Our returns team has been notified and will email you next steps within one business day. I can't approve a refund myself, but the team reviews every request."
}
```

And almost instantly, in the **returns-team receiver's console**, the live alert arrives:

```
time=... level=INFO module=voltmart/notifications_receiver message="Returns team alerted" reference=RMA-1 orderNumber=10219 from=sam@example.com alert="New return request RMA-1: order #10219 (VoltBook 14 laptop) from sam@example.com — reason: \"arrived damaged\". Please review and email the customer their next steps."
```

*Expected behavior:* the agent calls `requestReturn` over MCP → the orders service verifies identity and the window, records the request, and fires the webhook → the receiver composes the team's alert. That's the full push loop, end to end — and the agent never promised a refund.

#### Sample 2 — Confirm the request was actually recorded

The alert is nice, but the database is the source of truth. Verify the return was filed:

```bash
docker exec -it voltmart-orders-db \
  psql -U voltmart -d voltmart_orders \
  -c "SELECT id, order_number, reason, status FROM returns ORDER BY id;"
```

You'll see the new row with `status = requested` — the durable record the team will work from.

#### Sample 3 — An out-of-window return is declined cleanly

Order `10350` was delivered 48 days ago, so it's past the 30-day window:

```bash
curl -X POST http://localhost:9090/voltMartAssistant/chat \
  -H "Content-Type: application/json" \
  -d '{
    "sessionId": "ret-3",
    "message": "Please start a return for order #10350, email alex@example.com — I changed my mind."
  }'
```

**Agent output:**

```json
{
  "message": "I'm sorry, but order #10350 was delivered more than 30 days ago, so it's outside our 30-day return window and I can't file the return. Our VoltMart support team can review exceptions — they're available 8:00 AM – 8:00 PM ET, seven days a week."
}
```

*Expected behavior:* the tool returns `RETURN_WINDOW_CLOSED`, no row is written, no webhook fires, and the agent explains the limit without promising anything. (Try a wrong email for `VERIFICATION_FAILED`, or order `10588`, which is still `processing`, for `NOT_ELIGIBLE`.)

[SCREENSHOT: Two terminals side by side — the agent's "return filed" confirmation, and the alert appearing in the receiver's console.]

---

## You've built the whole loop

Look back at the series. You started with a blank machine and ended with an AI agent that:

- **answers** policy questions grounded in a knowledge base (part 1),
- **reads and writes** live order data in a real database over MCP (part 2), and
- **acts on a customer's request** — filing a return — and **pushes** a live alert to the team the instant it does (part 3).

And the architecture stayed clean the whole way: the knowledge base, the orders service, and the returns-team receiver are each independent integrations. The agent reaches the orders service through one MCP toolkit; the orders service reaches the team through one webhook. Each piece can be changed, scaled, or reused on its own — which is exactly what you want when this grows from a tutorial into a production system.

There's a bigger idea hiding in that last step, too. The agent didn't *do* the return — it raised an **event** that a human (or another system) acts on. That's how agentic systems stay safe as they grow: events carry awareness of what changed, while the authority to decide stays with whoever should hold it. The agent files; the team rules.

### Where to go next

- **Multiple subscribers.** A `return.requested` event rarely matters to just one team. Keep a list of webhook URLs and fan each event out — the returns desk, an inventory system that earmarks the restock, and an analytics pipeline, all at once, without the publisher knowing who's listening.
- **Reliable delivery.** Real webhooks need retries with backoff and a dead-letter queue for events that never get through. WSO2 Integrator's [reliable messaging patterns](https://wso2.com/integration-platform/docs/) fit naturally here.
- **Secure the webhook, and authorize the tools.** Sign each payload (HMAC) so the receiver can verify it really came from the orders service, and put auth in front of the MCP endpoint so privileged tools are reachable only by the right client. That's the proper backend boundary for anything more sensitive than filing a return — see the [tools documentation](https://wso2.com/integration-platform/docs/genai/develop/agents/tools).
- **Close the loop back to the customer.** When the team approves the return, emit an event the other way — a webhook to a customer channel ("your return is approved, here's your prepaid label"). The same publisher/subscriber pattern, pointed the other direction.

That completes the agent itself — knowledge, live data, and event-driven action: a toolkit for building agents that don't just talk, but act *within their bounds* and reach the right people the moment something happens. There's one step left to make it real. In **[part 4](deploy-and-observe-on-wso2-cloud.md)** we **deploy it to WSO2 Cloud and observe** it in production — switching to a production model provider and a managed database, then watching every tool call and decision through the agent trace viewer and the cloud's runtime logs, metrics, alerts, and traces. See you there.

---
