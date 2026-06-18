// A single VoltMart order, as stored in the PostgreSQL `orders` table.
// The SELECT queries in database.bal alias the snake_case columns
// (order_number, account_email) onto these camelCase fields.
public type Order record {|
    string orderNumber;
    // The email on the account — used for identity verification before sharing details.
    string accountEmail;
    string item;
    // processing | shipped | delivered
    string status;
    string eta;
|};

// Just what requestReturn needs to judge a return: who owns the order, whether it was
// delivered, and how many days ago — so we can enforce the 30-day return window.
// `daysSinceDelivery` is NULL for orders that have not been delivered.
public type ReturnCandidate record {|
    string orderNumber;
    string accountEmail;
    string item;
    string status;
    int? daysSinceDelivery;
|};

// A return request, as written to the `returns` table.
public type ReturnRequest record {|
    string orderNumber;
    string accountEmail;
    string item;
    string reason;
|};
