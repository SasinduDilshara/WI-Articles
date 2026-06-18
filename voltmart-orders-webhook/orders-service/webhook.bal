import ballerina/http;
import ballerina/log;

// ----- Webhook publisher: live return-request alerts (Part 3) -----
//
// When a customer files a return through the agent, the orders service POSTs an alert to a
// subscriber — here, the VoltMart returns team's inbox (a stand-in for a real ticketing system,
// a Slack channel, or an ops dashboard). This is the "push" half of the system: the team is told
// the instant a request comes in, instead of polling a queue. The target URL is configuration,
// so subscribers can change without touching code.
configurable string webhookUrl = "http://localhost:9091/notifications/return-requested";

// A separate HTTP client just for delivering webhooks.
final http:Client webhookClient = check new (webhookUrl);

// The alert payload. The receiver decodes exactly this shape.
public type ReturnRequestedEvent record {|
    string event;
    string reference;
    string orderNumber;
    string accountEmail;
    string item;
    string reason;
|};

// Fire the alert. We never let a webhook failure break the filed request — the return is already
// recorded in the database; delivery is best-effort, so we log and move on rather than propagating
// the error back to the caller.
isolated function notifyReturnRequested(ReturnRequestedEvent event) {
    http:Response|error response = webhookClient->post("", event);
    if response is error {
        log:printWarn("Return-request webhook delivery failed",
                reference = event.reference, 'error = response);
        return;
    }
    log:printInfo("Return-request webhook delivered",
            reference = event.reference, orderNumber = event.orderNumber);
}
