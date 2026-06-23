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

// One pooled client for the whole service. The order resources below all share it.
// This is the live order system the API sits in front of.
final postgresql:Client ordersDb = check new (
    host = dbHost,
    port = dbPort,
    username = dbUser,
    password = dbPassword,
    database = dbName
);

// Fetch a single order by its number. Returns sql:NoRowsError when nothing matches —
// the resource turns that into a 404.
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

// Customers say "#10432" and "10432" interchangeably; the database stores the bare number.
isolated function normalize(string orderNumber) returns string {
    string trimmed = orderNumber.trim();
    return trimmed.startsWith("#") ? trimmed.substring(1) : trimmed;
}
