// A single VoltMart order in our mock "order management system".
type Order record {|
    string orderNumber;
    // The email on the account — used for identity verification before sharing details.
    string accountEmail;
    string item;
    // processing | shipped | delivered
    string status;
    string eta;
|};
