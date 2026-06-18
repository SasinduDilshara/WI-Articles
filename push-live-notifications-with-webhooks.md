# Push Live Notifications from Your AI Agent with Webhooks on WSO2 Integrator

## Introduction

Across this series your VoltMart Support Assistant has grown up fast. In [part 1](build-first-ai-integration.md) it learned to answer policy questions from a knowledge base. In [part 2](connect-live-data-with-mcp.md) it gained a live orders backend over **MCP**, so it can look up, create, and cancel real orders in a PostgreSQL database.

But notice that everything the agent does is still **reactive**: the customer has to start the conversation. *"Where's my order?"* — the agent answers. The customer is doing the chasing. Yet the most reassuring moment in any online order is the one nobody asks for: *"Your order has shipped."* That message arrives on its own, the instant something changes.

That's what this final part adds: **push**. We'll give the orders service the ability to **change an order's status** and, the moment it does, fire a **webhook** that delivers a live notification to the customer — no question required. Then, because the agent connects over MCP, it picks up the new capability automatically and can drive these status changes itself.

If you've followed parts 1 and 2, you have everything you need. Let's close the loop.

---

## What is a webhook, and why here?

A **webhook** is a reverse API call. Instead of a client repeatedly asking *"anything new yet?"* (polling), the system that *has* the news makes an HTTP call **out** to a URL you registered, the moment the event happens. It's the difference between refreshing a tracking page every hour and getting a text the second your package ships.

For VoltMart this is exactly the right tool. Order status changes are **events** — discrete, timed, and worth knowing about immediately. Polling the database for changes would be wasteful and slow; a webhook delivers the notification at the instant of the change, to whatever channel actually reaches the customer (email, SMS, push, their app).

So we add two things:

- A **publisher** — the orders service gains a status-change tool that updates the database and then POSTs a notification event.
- A **subscriber** — a small notifications service that receives those events and turns them into customer-facing messages.

And because the publisher is just another MCP tool, the agent gains the ability to advance an order's status with zero new wiring — the same automatic discovery you saw in part 2.

---

## What we are going to build

Building on the part-2 project, we'll add:

1. **An `updateStatus` MCP tool** on the orders service. It moves an order through `processing → shipped → delivered`, writes the change to PostgreSQL, and **fires a webhook**.
2. **A notifications receiver** — a standalone webhook subscriber that receives the event and composes the message the customer would actually get.
3. **The agent, unchanged in wiring** — it discovers `updateStatus` automatically over MCP; we only update its instructions so it knows when to use it.

### Architecture

![VoltMart webhook architecture: the agent calls updateStatus over MCP on the orders service; the orders service writes the new status to PostgreSQL and fires a webhook to the notifications receiver, which sends the customer their live notification.](voltmart-orders-webhook/architecture.png)

The flow reads left to right and then *pushes* right to left: the agent (or any MCP client) calls `updateStatus`; the orders service updates **PostgreSQL** and immediately POSTs a status-change event to the **notifications receiver**; the receiver delivers the customer's notification. The webhook is fire-and-forget — the status change succeeds regardless of whether notification delivery does.

> **Companion code.** You'll build everything below in the low-code editor. The finished projects — the part-2 orders service with the webhook added, plus the new notifications receiver — are in the [`voltmart-orders-webhook`](voltmart-orders-webhook) folder if you'd rather read or run the result.

---

## Prerequisites

Everything from [part 2](connect-live-data-with-mcp.md#prerequisites) — WSO2 Integrator, Docker, and the part-2 projects (the agent and the orders MCP service with its database). We build directly on top of them.

---

## Step 1 — Build the notifications receiver (the subscriber)

We'll build the subscriber first, so there's something live for the webhook to call. This is a stand-in for whatever channel actually reaches the customer — an email service, an SMS gateway, a push provider. It's a plain HTTP service that listens for status-change events.

1. In WSO2 Integrator, create a new integration. Set **Integration Name** to `VoltMartNotifications` and **Project Name** to `notifications-receiver`, then **Create Integration**.
2. Add the endpoint that receives webhooks. Select **+ Add Artifact** → **Service**, and configure it:
   - **Listener port:** `9091`.
   - **Base path:** `/notifications`.
   - Add a resource with **HTTP method** `POST` and **path** `order-status` — so the full webhook URL is `http://localhost:9091/notifications/order-status`.
   - **Payload:** accept the incoming JSON event (order number, account email, item, previous status, new status, ETA).
3. Select **Create**. WSO2 Integrator opens the resource's flow diagram.

[SCREENSHOT: The Service creation form with port 9091, base path /notifications, and the POST order-status resource.]

Now build the flow that turns an event into a customer message.

**⚡ With WSO2 Integrator Copilot (fastest path).** Click **Generate with AI** and describe it — *"From the incoming status-change payload, compose a friendly customer message based on the new status (shipped → 'has shipped', delivered → 'was delivered', otherwise a generic update), log it as the notification sent to the customer's email, and respond with 202 Accepted."* Review and **Keep**.

**Prefer to build it by hand?** On the flow line:
1. Click **+** → **Log** (Info) and write a message that includes the customer's email and a line composed from the event — e.g. *"Good news! Your VoltMart order #10588 (SoundDock 2 Bluetooth speaker) has shipped."* In a real system this node would be an **email/SMS connector** action instead of a log.
2. Click **+** → **Return** (or set the resource response) to reply **202 Accepted** — the conventional webhook acknowledgement that says *"I've received the event and taken responsibility for it."*

Run this project (**Run** button). It now waits on port `9091` for webhooks — nothing calls it yet, which we fix next.

> 💡 **Why 202, and why fire-and-forget?** The receiver returns quickly and the publisher never waits on a downstream email send. Coupling a database change to the availability of a notification channel would be fragile — so we keep them independent.

## Step 2 — Add the webhook connection to the orders service

Switch back to the **orders-service** project from part 2. For the service to call *out* to the receiver, it needs an **HTTP connection** pointing at it.

1. In the design view, select **+ Add Artifact** → **Connection**.
2. In the connector store, search for **HTTP** and select it.
3. In the **Add New Connection** form, set the **Base URL** to `http://localhost:9091/notifications` and name the connection `notifier`.
4. Select **Create**.

[SCREENSHOT: The HTTP "Add New Connection" form pointing at the notifications receiver.]

That's the outbound channel. The status-change tool we build next will use it to deliver the event.

## Step 3 — Add the `updateStatus` tool that fires the webhook

Now the centerpiece. Open the **VoltMart Orders MCP service** (the same one from part 2) and click **+ Add Tool** — exactly as you added the other three. This tool moves an order forward and pushes a notification in the same flow.

**Add the tool.** Fill in the form:

1. **Name:** `updateStatus`.
2. **Description:** what the agent reads to decide when to use it:

   ```
   Update the status of a VoltMart order and send the customer a live notification. Call this when an order moves forward in fulfillment, e.g. from "processing" to "shipped" or from "shipped" to "delivered". The new status MUST be one of: processing, shipped, delivered. On success the customer is notified automatically. Returns ORDER_NOT_FOUND if no order matches the number, or INVALID_STATUS if the status is not one of the allowed values.
   ```
3. **Parameters:** two `string` parameters — `orderNumber` and `newStatus` (*"The new status: processing, shipped, or delivered."*).
4. **Return Type:** `string`.
5. Select **Save** to open the tool's flow diagram.

Now build the flow — it does three things in order: validate, update the database, fire the webhook.

**⚡ With WSO2 Integrator Copilot (fastest path).** Click **Generate with AI** and describe it — *"If `newStatus` isn't one of processing/shipped/delivered, return `\"INVALID_STATUS\"`. Look the order up in the `ordersDb` connection; if it's missing, return `\"ORDER_NOT_FOUND\"`. Otherwise update the order's status (and a matching ETA line) in `ordersDb`, then POST a status-change event — order number, account email, item, previous status, new status, ETA — to the `notifier` HTTP connection's `/order-status` path. Don't fail the tool if the POST fails; just carry on. Return a confirmation line."* Review and **Keep**.

**Prefer to place the nodes by hand?** On the flow line:

1. **Validate the status.** Click **+** → **If**, checking that `newStatus` is one of `processing`, `shipped`, `delivered`. In the **else** branch (when it isn't), **Return** `"INVALID_STATUS: Status must be one of processing, shipped, or delivered."`
2. **Fetch the order.** Click **+** → **Connections** → `ordersDb` → the **query** action, selecting the order by `orderNumber`. Bind it to `order`. Add an **If** for the not-found case that **Returns** `"ORDER_NOT_FOUND: No VoltMart order matches that number."`
3. **Update the database.** Click **+** → **Connections** → `ordersDb` → the **execute** action running an `UPDATE` that sets the new status (and a friendly ETA line — e.g. *"on its way, arriving in 2-3 business days"* for shipped).
4. **Fire the webhook.** Click **+** → **Connections** → `notifier` → the **POST** action. Set the path to `/order-status` and the body to a JSON event built from the order: order number, account email, item, the **previous** status, the new status, and the ETA. This is the single node that turns a database change into a live customer notification.
5. **Return a confirmation.** Click **+** → **Return** with a line like `Order #10588 (SoundDock 2 Bluetooth speaker) is now "shipped". The customer has been notified.`

[SCREENSHOT: The updateStatus tool flow — validate, query, update, the notifier POST node, and the Return.]

> **Keep delivery best-effort.** The order status changes in the database *before* the webhook fires, and a failed POST should not fail the tool — the order really did move. If you're building by hand, wrap the POST so a delivery error is logged and ignored rather than propagated. (The companion project does exactly this.)

## Step 4 — Let the agent drive it

Here's the payoff from choosing MCP in part 2. The agent connects to the orders service through the **Use MCP Server** tool you added in part 2, and MCP discovers tools automatically. You just added `updateStatus` to that service — so the agent will pick it up with **no changes to its tool configuration at all**. (If the agent was running, restart it so it re-discovers the service's tools.)

The only thing to change is the agent's instructions, so it knows when the new tool is appropriate. In the **voltmart-support** agent, click the **AI Agent** node, open the **Instructions** editor, and add one line to the **USING YOUR TOOLS** section:

```
- To advance an order's status (processing → shipped → delivered), call updateStatus with the order number and the new status. The customer is automatically notified of the change, so do not separately promise to "let them know" — just confirm the new status.
```

Select **Save**. That's it — the agent can now move an order forward, and the customer gets pinged automatically.

> **Who actually triggers this?** In a real shop, a status change usually comes from a warehouse system, not a chat. The webhook fires no matter what calls `updateStatus` — the agent is just one possible trigger. Exposing it as an agent tool is handy for staff-facing assistants ("mark #10588 as shipped") and makes the end-to-end flow easy to demo, which is exactly what we'll do next.

---

## Take it for a spin

This time there are **four** things to run. Start them in order:

1. **The database:** `docker compose up -d` (from `orders-service`).
2. **The notifications receiver:** open the `notifications-receiver` project and click **Run** (comes up on port 9091).
3. **The orders MCP service:** **Run** the `orders-service` project (port 8290).
4. **The agent:** **Run** the `voltmart-support` project (port 9090).

Keep an eye on the **notifications receiver's console** — that's where the live notification will appear.

#### Sample 1 — A status change pushes a live notification

Tell the agent to ship an order:

```bash
curl -X POST http://localhost:9090/voltMartAssistant/chat \
  -H "Content-Type: application/json" \
  -d '{
    "sessionId": "wh-1",
    "message": "Mark order #10588 as shipped."
  }'
```

**Agent output:**

```json
{
  "message": "Done — order #10588 (SoundDock 2 Bluetooth speaker) is now shipped, and we've let the customer know it's on its way, arriving in 2-3 business days."
}
```

And almost instantly, in the **notifications receiver's console**, the live notification arrives:

```
time=... level=INFO module=voltmart/notifications_receiver message="Customer notification sent" to=priya@example.com orderNumber=10588 body="Good news! Your VoltMart order #10588 (SoundDock 2 Bluetooth speaker) has shipped — on its way, arriving in 2-3 business days."
```

*Expected behavior:* the agent calls `updateStatus` over MCP → the orders service updates PostgreSQL and fires the webhook → the receiver composes and "sends" the customer's message. That's the full push loop, end to end.

#### Sample 2 — Confirm the change actually stuck

The notification is nice, but the database is the source of truth. Verify the status really moved:

```bash
docker exec -it voltmart-orders-db \
  psql -U voltmart -d voltmart_orders -c "SELECT order_number, status, eta FROM orders WHERE order_number = '10588';"
```

You'll see `10588` now reads `shipped`. A follow-up `getStatus` from the agent (with `priya@example.com`) will report the new status too — the same live data, read back.

#### Sample 3 — A bad status is rejected cleanly

```bash
curl -X POST http://localhost:9090/voltMartAssistant/chat \
  -H "Content-Type: application/json" \
  -d '{
    "sessionId": "wh-3",
    "message": "Set order #10219 to gift-wrapped."
  }'
```

**Agent output:**

```json
{
  "message": "I can only move an order to processing, shipped, or delivered — \"gift-wrapped\" isn'\''t a status I can set. Want me to mark it as one of those instead?"
}
```

*Expected behavior:* the tool returns `INVALID_STATUS`, no webhook fires, and the database is untouched.

[SCREENSHOT: Two terminals side by side — the agent's shipped confirmation, and the notification appearing in the receiver's console.]

---

## You've built the whole loop

Look back at the series. You started with a blank machine and ended with an AI agent that:

- **answers** policy questions grounded in a knowledge base (part 1),
- **reads and writes** live order data in a real database over MCP (part 2), and
- **pushes** live notifications to customers the instant an order changes (part 3).

And the architecture stayed clean the whole way: the knowledge base, the orders service, and the notifications receiver are each independent integrations. The agent reaches the orders service through one MCP toolkit; the orders service reaches the customer through one webhook. Each piece can be changed, scaled, or reused on its own — which is exactly what you want when this grows from a tutorial into a production system.

### Where to go next

- **Multiple subscribers.** Keep a list of webhook URLs (in the database) and fan each event out to all of them — email, SMS, and an internal dashboard at once.
- **Reliable delivery.** Real webhooks need retries with backoff and a dead-letter queue for events that never get through. WSO2 Integrator's [reliable messaging patterns](https://wso2.com/integration-platform/docs/) fit naturally here.
- **Secure the webhook.** Sign each payload (HMAC) so the receiver can verify it really came from the orders service, and put auth in front of the MCP endpoint.
- **Trigger from the real world.** Wire `updateStatus` to an actual warehouse/shipping connector so status changes — and notifications — happen automatically as packages move.

That's the series. You now have the full toolkit — knowledge, live data, and live notifications — to build agents that don't just talk, but act and reach back out. Go build your own.

---
