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
