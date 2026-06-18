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
