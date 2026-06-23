import ballerina/http;
import ballerina/log;
import ballerina/sql;

// The order management system's REST API. In a real company this service already exists in front
// of the order system; here it sits in front of the Dockerized PostgreSQL database from the
// docker-compose setup. It knows nothing about AI or MCP — it is a plain HTTP service that any
// client (the MCP service we build next, a mobile app, a back-office tool) can call.
configurable int port = 8080;

service /orders on new http:Listener(port) {

    # Look up an order by its number. The caller must supply the account email; the order is
    # returned only when the email matches the one on file — the ownership check that keeps one
    # customer from reading another's order.
    #
    # + orderNumber - The order number, e.g. "10432" (a leading '#' is accepted)
    # + email - The email on the customer's VoltMart account
    # + return - The order on a match, 404 if the number is unknown, 403 if the email does not match
    resource function get [string orderNumber](string email)
            returns Order|OrderNotFound|OrderForbidden|error {
        string number = normalize(orderNumber);
        Order|sql:Error result = fetchOrder(number);
        if result is sql:NoRowsError {
            return <OrderNotFound>{body: {message: "No order matches that number."}};
        }
        if result is sql:Error {
            return result;
        }
        if result.accountEmail.toLowerAscii() != email.trim().toLowerAscii() {
            return <OrderForbidden>{body: {message: "Email does not match this order."}};
        }
        return result;
    }

    # Create a new order. The new order always starts in the "processing" status. Returns 409 if an
    # order with the same number already exists.
    #
    # + newOrder - The order number, account email, and item to order
    # + return - The created order (201), or 409 if the number is already taken
    resource function post .(@http:Payload NewOrder newOrder)
            returns OrderCreated|OrderConflict|error {
        string number = normalize(newOrder.orderNumber);
        Order|sql:Error existing = fetchOrder(number);
        if existing is Order {
            return <OrderConflict>{body: {message: "An order with that number already exists."}};
        }
        if existing !is sql:NoRowsError {
            return existing;
        }
        Order created = {
            orderNumber: number,
            accountEmail: newOrder.accountEmail.trim(),
            item: newOrder.item,
            status: "processing",
            eta: "ships within 1 business day"
        };
        check insertOrder(created);
        log:printInfo("Created order", orderNumber = number, item = created.item);
        return <OrderCreated>{body: created};
    }

    # Remove an order. As with the lookup, the caller must supply the account email; the order is
    # only removed when it matches the one on file.
    #
    # + orderNumber - The order number to remove
    # + email - The email on the customer's VoltMart account, used to verify ownership
    # + return - The removed order on success, 404 if the number is unknown, 403 if the email does not match
    resource function delete [string orderNumber](string email)
            returns Order|OrderNotFound|OrderForbidden|error {
        string number = normalize(orderNumber);
        Order|sql:Error existing = fetchOrder(number);
        if existing is sql:NoRowsError {
            return <OrderNotFound>{body: {message: "No order matches that number."}};
        }
        if existing is sql:Error {
            return existing;
        }
        if existing.accountEmail.toLowerAscii() != email.trim().toLowerAscii() {
            return <OrderForbidden>{body: {message: "Email does not match this order."}};
        }
        check deleteOrder(number);
        log:printInfo("Removed order", orderNumber = number);
        return existing;
    }
}
