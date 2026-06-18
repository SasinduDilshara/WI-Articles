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

1. **A `updateStatus` MCP tool** on the orders service. It moves an order through `processing → shipped → delivered`, writes the change to PostgreSQL, and **fires a webhook**.
2. **A notifications receiver** — a standalone webhook subscriber that receives the event and composes the message the customer would actually get.
3. **The agent, unchanged in wiring** — it discovers `updateStatus` automatically over MCP; we only update its instructions so it knows when to use it.

### Architecture

![VoltMart webhook architecture: the agent calls updateStatus over MCP on the orders service; the orders service writes the new status to PostgreSQL and fires a webhook to the notifications receiver, which sends the customer their live notification.](voltmart-orders-webhook/architecture.png)

The flow reads left to right and then *pushes* right to left: the agent (or any MCP client) calls `updateStatus`; the orders service updates **PostgreSQL** and immediately POSTs a status-change event to the **notifications receiver**; the receiver delivers the customer's notification. The webhook is fire-and-forget — the status change succeeds regardless of whether notification delivery does.

> **Companion code.** Everything is in the [`voltmart-orders-webhook`](voltmart-orders-webhook) folder: it's the part-2 project carried forward, with the webhook publisher added to `orders-service/` and a new `notifications-receiver/` project for the subscriber.

---

## Prerequisites

Everything from [part 2](connect-live-data-with-mcp.md#prerequisites) — WSO2 Integrator, Docker, and the part-2 projects (the agent and the orders MCP service with its database). We build directly on top of them.

---

## Step 1 — Add a status-change query to the data layer

The webhook is only worth firing when something real changed, so we start at the database. Open `database.bal` in the `orders-service` project and add one more query function alongside the part-2 ones:

```ballerina
// Move an order to a new status (and refresh its ETA text). Used by the status-change
// tool that drives live notifications in Part 3.
isolated function updateOrderStatus(string orderNumber, string status, string eta) returns sql:Error? {
    _ = check ordersDb->execute(`UPDATE orders
                                    SET status = ${status}, eta = ${eta}
                                  WHERE order_number = ${orderNumber}`);
}
```

Same parameterized-query style as before — nothing new to learn, we're just adding an `UPDATE`.

## Step 2 — Build the webhook publisher

Now the new piece. When a status changes, the orders service needs to call **out** to a subscriber. Create `webhook.bal` in the `orders-service` project:

```ballerina
import ballerina/http;
import ballerina/log;

// ----- Webhook publisher: live order-status notifications (Part 3) -----
//
// When an order changes status, the orders service POSTs a notification to a subscriber
// (the notifications receiver, or any real channel — email/SMS gateway, customer app).
// This is the "push" half of the system: the customer is told the moment something changes,
// instead of having to ask. The target URL is configuration, so subscribers can change
// without touching code.
configurable string webhookUrl = "http://localhost:9091/notifications/order-status";

// A separate HTTP client just for delivering webhooks.
final http:Client webhookClient = check new (webhookUrl);

// The notification payload. The receiver decodes exactly this shape.
public type StatusChangedEvent record {|
    string event;
    string orderNumber;
    string accountEmail;
    string item;
    string previousStatus;
    string newStatus;
    string eta;
|};

// Fire the notification. We never let a webhook failure break the status update itself —
// the order has already changed in the database; delivery is best-effort, so we log and
// move on rather than propagating the error back to the caller.
isolated function notifyStatusChange(StatusChangedEvent event) {
    http:Response|error response = webhookClient->post("", event);
    if response is error {
        log:printWarn("Order-status webhook delivery failed",
                orderNumber = event.orderNumber, 'error = response);
        return;
    }
    log:printInfo("Order-status webhook delivered",
            orderNumber = event.orderNumber, newStatus = event.newStatus);
}
```

Two design choices worth understanding, because they're what separates a toy webhook from a real one:

- **The target is configuration, not code.** `webhookUrl` is `configurable`, so a subscriber can be repointed (or swapped for a real email gateway) without recompiling. Real systems often keep a *list* of subscribers in a database; this is the single-subscriber version of the same idea.
- **Delivery is best-effort and never blocks the business action.** The order status has *already* changed in the database. If the notification fails to send, we log a warning and carry on — we do not fail the status update or propagate the error. Coupling a database write to the availability of a notification channel would be fragile; decoupling them is the whole point of an event.

## Step 3 — Add the `updateStatus` MCP tool

Now wire the database update and the webhook together into a new MCP tool. In `service.bal`, add one more `remote function` to the orders service — right alongside `getStatus`, `createOrder`, and `removeOrder`:

```ballerina
    # Update the status of a VoltMart order and send the customer a live notification. Call this
    # when an order moves forward in fulfillment, e.g. from "processing" to "shipped" or from
    # "shipped" to "delivered". The new status MUST be one of: processing, shipped, delivered.
    # On success the customer is notified automatically via webhook. Returns ORDER_NOT_FOUND if
    # no order matches the number, or INVALID_STATUS if the status is not one of the allowed values.
    #
    # + orderNumber - The order number whose status is changing
    # + newStatus - The new status: "processing", "shipped", or "delivered"
    # + return - A confirmation line, or an ORDER_NOT_FOUND / INVALID_STATUS signal
    remote isolated function updateStatus(string orderNumber, string newStatus) returns string|error {
        string number = normalize(orderNumber);
        string status = newStatus.trim().toLowerAscii();
        if status != "processing" && status != "shipped" && status != "delivered" {
            return "INVALID_STATUS: Status must be one of processing, shipped, or delivered.";
        }
        Order|sql:Error existing = fetchOrder(number);
        if existing is sql:NoRowsError {
            return "ORDER_NOT_FOUND: No VoltMart order matches that number.";
        }
        if existing is sql:Error {
            return error("Could not reach the VoltMart order database.", existing);
        }

        // A friendly ETA line that matches the new status.
        string eta = etaFor(status);
        check updateOrderStatus(number, status, eta);

        // Push the live notification. Delivery is best-effort and never blocks the update.
        notifyStatusChange({
            event: "order.status.changed",
            orderNumber: number,
            accountEmail: existing.accountEmail,
            item: existing.item,
            previousStatus: existing.status,
            newStatus: status,
            eta: eta
        });

        log:printInfo("Updated order status", orderNumber = number,
                previousStatus = existing.status, newStatus = status);
        return string `Order #${number} (${existing.item}) is now "${status}". The customer has been notified — ${eta}.`;
    }
```

And the small helper it uses, placed next to `normalize`:

```ballerina
// A human-readable ETA line for each status, so the notification reads naturally.
isolated function etaFor(string status) returns string {
    match status {
        "shipped" => {
            return "on its way, arriving in 2-3 business days";
        }
        "delivered" => {
            return "delivered today";
        }
        _ => {
            return "ships within 1 business day";
        }
    }
}
```

The shape mirrors the part-2 tools exactly: validate the input, look the order up, return a clean signal if something's off, otherwise do the work. The one new beat is the line after the database write — `notifyStatusChange(...)`. That single call is the bridge from a database update to a live customer notification.

## Step 4 — Build the notifications receiver (the subscriber)

The publisher is calling out to `http://localhost:9091/notifications/order-status` — now we build the thing that listens there. This stands in for whatever actually reaches the customer (an email service, SMS gateway, push provider). It's a separate project so the boundary is real, just like the orders service is separate from the agent.

Create a new integration named `notifications-receiver`, then add `service.bal`:

```ballerina
import ballerina/http;
import ballerina/log;

// ----- Notifications receiver: the webhook subscriber (Part 3) -----
//
// A stand-in for whatever channel actually reaches the customer — an email service, an SMS
// gateway, a push-notification provider, or the customer's app. The orders service POSTs an
// order-status event here the moment an order changes; in a real system this handler would
// format and send the message. Here we log it and craft the customer-facing copy so you can
// see the live notification arrive end to end.

// Must match orders-service/webhook.bal `StatusChangedEvent`.
type StatusChangedEvent record {|
    string event;
    string orderNumber;
    string accountEmail;
    string item;
    string previousStatus;
    string newStatus;
    string eta;
|};

service /notifications on new http:Listener(9091) {

    // The orders service delivers status-change webhooks here.
    resource function post 'order\-status(@http:Payload StatusChangedEvent event)
            returns http:Accepted {
        string message = composeMessage(event);
        // In production: send `message` to the customer via email/SMS/push.
        log:printInfo("Customer notification sent",
                to = event.accountEmail,
                orderNumber = event.orderNumber,
                body = message);
        // 202 Accepted: we've taken responsibility for delivering the notification.
        return http:ACCEPTED;
    }
}

// Turn a raw status-change event into the message a customer would actually receive.
isolated function composeMessage(StatusChangedEvent event) returns string {
    match event.newStatus {
        "shipped" => {
            return string `Good news! Your VoltMart order #${event.orderNumber} (${event.item}) `
                + string `has shipped — ${event.eta}.`;
        }
        "delivered" => {
            return string `Your VoltMart order #${event.orderNumber} (${event.item}) was `
                + string `${event.eta}. Enjoy!`;
        }
        _ => {
            return string `Update on your VoltMart order #${event.orderNumber} (${event.item}): `
                + string `it's now ${event.newStatus}.`;
        }
    }
}
```

A few things to note:

- The `StatusChangedEvent` record matches the publisher's payload field-for-field — that shared shape *is* the webhook contract between the two services.
- The resource path `'order\-status` is just the Ballerina way of writing a path segment with a hyphen in it (`/notifications/order-status`).
- It returns **202 Accepted**, the conventional webhook response: *"I've received the event and taken responsibility for it."* Returning quickly matters — the publisher shouldn't wait on your downstream email send.

## Step 5 — Let the agent drive it

Here's the payoff from choosing MCP in part 2. The agent connects to the orders service through the **MCP toolkit**, which discovers tools automatically. We added `updateStatus` to the service — so the agent *already* has it. The `tools` list in `agents.bal` doesn't change at all:

```ballerina
    // The policy RAG tool from Part 1, plus EVERY tool the orders MCP service publishes
    // (getStatus, createOrder, removeOrder, and now updateStatus) — added as a single toolkit.
    // The new updateStatus tool is picked up automatically; the tools list never changed.
    tools = [searchVoltMartPolicies, ordersToolKit]
```

The only thing we *do* change is the agent's instructions, so it knows when this new tool is appropriate. Add one line to the **USING YOUR TOOLS** section of the system prompt:

```
- To advance an order's status (processing → shipped → delivered), call updateStatus with the order number and the new status. The customer is automatically notified of the change, so do not separately promise to "let them know" — just confirm the new status.
```

That's it. The agent can now move an order forward, and the customer gets pinged automatically.

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
