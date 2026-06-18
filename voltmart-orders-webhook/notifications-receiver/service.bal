import ballerina/http;
import ballerina/log;

// ----- Returns-team inbox: the webhook subscriber (Part 3) -----
//
// A stand-in for whatever actually reaches the VoltMart returns team — a ticketing system, a
// Slack channel, or an ops dashboard. The orders service POSTs a return-requested event here the
// moment a customer files a return through the agent; in a real system this handler would open a
// ticket and assign it. Here we log it as the alert the team would receive, so you can watch the
// live notification arrive end to end.

// Must match orders-service/webhook.bal `ReturnRequestedEvent`.
type ReturnRequestedEvent record {|
    string event;
    string reference;
    string orderNumber;
    string accountEmail;
    string item;
    string reason;
|};

service /notifications on new http:Listener(9091) {

    // The orders service delivers return-request webhooks here.
    resource function post 'return\-requested(@http:Payload ReturnRequestedEvent event)
            returns http:Accepted {
        string alert = composeAlert(event);
        // In production: open a ticket / post to the team's channel and assign an owner.
        log:printInfo("Returns team alerted",
                reference = event.reference,
                orderNumber = event.orderNumber,
                'from = event.accountEmail,
                alert = alert);
        // 202 Accepted: we've taken responsibility for handling the request.
        return http:ACCEPTED;
    }
}

// Turn a raw return-requested event into the alert the returns team would actually see.
isolated function composeAlert(ReturnRequestedEvent event) returns string {
    return string `New return request ${event.reference}: order #${event.orderNumber} `
        + string `(${event.item}) from ${event.accountEmail} — reason: "${event.reason}". `
        + "Please review and email the customer their next steps.";
}
