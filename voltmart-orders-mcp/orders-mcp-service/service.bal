import ballerina/log;
import ballerina/mcp;

import orders_mcp_service.ordersapi as api;

// The MCP server listens on its own port, separate from both the order API and the agent. Anything
// that speaks MCP — the WSO2 agent we wire up later, Claude Desktop, or any other MCP client — can
// connect. This service holds no data of its own: every tool calls the order management HTTP service
// through the generated `ordersApi` client and translates the result into a signal the agent reads.
listener mcp:Listener ordersMcpListener = check new (8290);

// One MCP service exposes three tools to any connected client. WSO2 Integrator turns each
// `remote function` into a named, typed MCP tool automatically: the function name becomes the tool
// name, the doc comment becomes the description the client's LLM reads to decide when to call it,
// and the parameters become the tool's input schema. `sessionMode: AUTO` lets the transport decide
// whether to track sessions.
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

    # Create a new VoltMart order in the order system. Call this only when the customer has given
    # you the account email and the item to order. The new order always starts in the "processing"
    # status. Returns ORDER_EXISTS if an order with that number already exists.
    #
    # + orderNumber - The order number to create, e.g. "10644"
    # + accountEmail - The email on the customer's VoltMart account
    # + item - The product being ordered, e.g. "AirWave Pro wireless headphones"
    # + return - A confirmation line, or an ORDER_EXISTS signal
    remote isolated function createOrder(string orderNumber, string accountEmail, string item)
            returns string|error {
        api:NewOrder newOrder = {orderNumber, accountEmail, item};
        api:OrderCreated|api:ErrorMessageConflict|api:ErrorPayloadInternalServerError|api:ErrorPayloadBadRequest|error result =
            ordersApi->createOrder(newOrder);
        if result is api:OrderCreated {
            api:Order ord = result.body;
            log:printInfo("Created order", orderNumber = ord.orderNumber, item = ord.item);
            return string `Order #${ord.orderNumber} created for ${ord.item}. Status: ${ord.status}, ${ord.eta}.`;
        }
        if result is api:ErrorMessageConflict {
            return "ORDER_EXISTS: An order with that number already exists. Pick a different number.";
        }
        return error("Could not reach the VoltMart order service.");
    }

    # Remove a VoltMart order from the order system. Call this to cancel an order the customer asks
    # to remove. You MUST pass BOTH the order number AND the account email; the order is only removed
    # when the email matches the order on file. Returns VERIFICATION_FAILED if it does not, or
    # ORDER_NOT_FOUND if no order matches the number.
    #
    # + orderNumber - The order number to remove
    # + accountEmail - The email on the customer's VoltMart account, used to verify identity
    # + return - A confirmation line, or a VERIFICATION_FAILED / ORDER_NOT_FOUND signal
    remote isolated function removeOrder(string orderNumber, string accountEmail) returns string|error {
        api:OrderOk|api:ErrorMessageForbidden|api:ErrorMessageNotFound|api:ErrorPayloadInternalServerError|api:ErrorPayloadBadRequest|error result =
            ordersApi->removeOrder(orderNumber, email = accountEmail);
        if result is api:OrderOk {
            api:Order ord = result.body;
            log:printInfo("Removed order", orderNumber = ord.orderNumber);
            return string `Order #${ord.orderNumber} has been removed.`;
        }
        if result is api:ErrorMessageNotFound {
            return "ORDER_NOT_FOUND: No VoltMart order matches that number.";
        }
        if result is api:ErrorMessageForbidden {
            return "VERIFICATION_FAILED: That email does not match this order. The order was not removed.";
        }
        return error("Could not reach the VoltMart order service.");
    }
}
