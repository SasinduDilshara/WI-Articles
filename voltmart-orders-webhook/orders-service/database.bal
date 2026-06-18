import ballerina/sql;
import ballerinax/postgresql;
// The `as _` import wires in the JDBC driver without exposing any symbols.
import ballerinax/postgresql.driver as _;

// Read from Config.toml (or environment variables in production).
configurable string dbHost = "localhost";
configurable int dbPort = 5432;
configurable string dbUser = "voltmart";
configurable string dbPassword = "voltmart";
configurable string dbName = "voltmart_orders";

// One pooled client for the whole service. The order tools below all share it.
// This is the "live backend" the agent could never reach from the knowledge base.
final postgresql:Client ordersDb = check new (
    host = dbHost,
    port = dbPort,
    username = dbUser,
    password = dbPassword,
    database = dbName
);

// Fetch a single order by its number. Returns sql:NoRowsError when nothing matches —
// the callers turn that into the friendly ORDER_NOT_FOUND signal.
isolated function fetchOrder(string orderNumber) returns Order|sql:Error {
    return ordersDb->queryRow(`SELECT order_number  AS "orderNumber",
                                      account_email AS "accountEmail",
                                      item, status, eta
                                 FROM orders
                                WHERE order_number = ${orderNumber}`);
}

// Insert a brand-new order.
isolated function insertOrder(Order ord) returns sql:Error? {
    _ = check ordersDb->execute(`INSERT INTO orders
            (order_number, account_email, item, status, eta)
        VALUES (${ord.orderNumber}, ${ord.accountEmail}, ${ord.item}, ${ord.status}, ${ord.eta})`);
}

// Delete an order by its number.
isolated function deleteOrder(string orderNumber) returns sql:Error? {
    _ = check ordersDb->execute(`DELETE FROM orders WHERE order_number = ${orderNumber}`);
}

// Fetch just what the return path needs, including how many days ago the order was delivered.
// `daysSinceDelivery` is NULL for orders that have not been delivered yet. Postgres returns the
// difference of two dates as an integer number of days. Used by requestReturn in Part 3.
isolated function fetchReturnCandidate(string orderNumber) returns ReturnCandidate|sql:Error {
    return ordersDb->queryRow(`SELECT order_number  AS "orderNumber",
                                      account_email AS "accountEmail",
                                      item, status,
                                      (CURRENT_DATE - delivered_date) AS "daysSinceDelivery"
                                 FROM orders
                                WHERE order_number = ${orderNumber}`);
}

// Record a filed return request and return the new row's id, so the tool can build a reference
// number (RMA-<id>) for the customer and the webhook. The `returns` table — not the chat — is
// the durable record of the request.
isolated function insertReturn(ReturnRequest req) returns int|sql:Error {
    return ordersDb->queryRow(`INSERT INTO returns (order_number, account_email, item, reason)
                               VALUES (${req.orderNumber}, ${req.accountEmail}, ${req.item}, ${req.reason})
                               RETURNING id`);
}
