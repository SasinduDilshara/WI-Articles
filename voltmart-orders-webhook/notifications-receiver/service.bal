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
