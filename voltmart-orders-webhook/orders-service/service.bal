import ballerina/log;
import ballerina/mcp;
import ballerina/sql;

// The MCP server listens on its own port, separate from the agent. Anything that speaks
// MCP — the WSO2 agent we build later, Claude Desktop, or any other MCP client — can connect.
listener mcp:Listener ordersMcpListener = check new (8290);

// One MCP service exposes the order tools to any connected client. WSO2 Integrator turns each
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

    # Start a return request for a delivered VoltMart order and alert the returns team. You MUST
    # pass BOTH the order number AND the account email; a return is filed only when the email
    # matches the order on file. Call this when a customer wants to return or send back an item
    # they have received. This does NOT approve a refund or change the order — it files the request
    # and notifies the VoltMart returns team, who decide the outcome. Returns ORDER_NOT_FOUND if no
    # order matches, VERIFICATION_FAILED if the email does not match, NOT_ELIGIBLE if the order has
    # not been delivered yet, or RETURN_WINDOW_CLOSED if it was delivered more than 30 days ago.
    #
    # + orderNumber - The order number being returned, e.g. "10219" (a leading '#' is fine)
    # + accountEmail - The email on the customer's VoltMart account, used to verify identity
    # + reason - The customer's reason for the return, in their own words
    # + return - A confirmation line with a return reference, or an ORDER_NOT_FOUND / VERIFICATION_FAILED / NOT_ELIGIBLE / RETURN_WINDOW_CLOSED signal
    remote isolated function requestReturn(string orderNumber, string accountEmail, string reason)
            returns string|error {
        string number = normalize(orderNumber);
        ReturnCandidate|sql:Error candidate = fetchReturnCandidate(number);
        if candidate is sql:NoRowsError {
            return "ORDER_NOT_FOUND: No VoltMart order matches that number.";
        }
        if candidate is sql:Error {
            return error("Could not reach the VoltMart order database.", candidate);
        }
        if candidate.accountEmail.toLowerAscii() != accountEmail.trim().toLowerAscii() {
            return "VERIFICATION_FAILED: That email does not match this order. No return was filed.";
        }
        if candidate.status != "delivered" {
            return "NOT_ELIGIBLE: This order hasn't been delivered yet, so it can't be returned.";
        }
        int? daysSinceDelivery = candidate.daysSinceDelivery;
        if daysSinceDelivery is () || daysSinceDelivery > 30 {
            return "RETURN_WINDOW_CLOSED: This order was delivered more than 30 days ago, "
                + "past the 30-day return window. The returns team can still review exceptions.";
        }

        // Record the request first — the `returns` table is the durable source of truth.
        int id = check insertReturn({
            orderNumber: number,
            accountEmail: candidate.accountEmail,
            item: candidate.item,
            reason: reason.trim()
        });
        string reference = string `RMA-${id}`;

        // Then alert the returns team. Best-effort: a delivery failure never unfiles the request.
        notifyReturnRequested({
            event: "return.requested",
            reference,
            orderNumber: number,
            accountEmail: candidate.accountEmail,
            item: candidate.item,
            reason: reason.trim()
        });

        log:printInfo("Return requested", reference = reference, orderNumber = number);
        return string `Return request ${reference} filed for order #${number} (${candidate.item}). `
            + "Our returns team has been notified and will email you next steps within one business day. "
            + "No refund has been approved yet — the team reviews every request.";
    }
}

// Customers say "#10432" and "10432" interchangeably; the database stores the bare number.
isolated function normalize(string orderNumber) returns string {
    string trimmed = orderNumber.trim();
    return trimmed.startsWith("#") ? trimmed.substring(1) : trimmed;
}
