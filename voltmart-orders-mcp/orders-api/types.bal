import ballerina/http;

// A single VoltMart order, as stored in the PostgreSQL `orders` table and returned by the API.
// The SELECT queries in database.bal alias the snake_case columns (order_number, account_email)
// onto these camelCase fields.
public type Order record {|
    string orderNumber;
    // The email on the account — used for the ownership check before details are shared.
    string accountEmail;
    string item;
    // processing | shipped | delivered
    string status;
    string eta;
|};

// The request body for creating an order. The status and ETA are set by the service, not the caller.
public type NewOrder record {|
    string orderNumber;
    string accountEmail;
    string item;
|};

// A small, consistent error body returned with 404 / 403 / 409 responses.
public type ErrorMessage record {|
    string message;
|};

// 201 — the order was created; the body carries the stored order.
public type OrderCreated record {|
    *http:Created;
    Order body;
|};

// 404 — no order matches the given number.
public type OrderNotFound record {|
    *http:NotFound;
    ErrorMessage body;
|};

// 403 — the supplied email does not own the order (the ownership check).
public type OrderForbidden record {|
    *http:Forbidden;
    ErrorMessage body;
|};

// 409 — an order with that number already exists.
public type OrderConflict record {|
    *http:Conflict;
    ErrorMessage body;
|};
