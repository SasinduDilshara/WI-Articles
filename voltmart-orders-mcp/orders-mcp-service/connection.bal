import orders_mcp_service.ordersapi as api;

// ----- The HTTP client to the order management system (Part B) -----
//
// `api:Client` is the typed client WSO2 Integrator generated from the order API's OpenAPI
// contract (the "Connect Via API Specification" connection). Its remote methods — getOrder,
// createOrder, removeOrder — map one-to-one to the operations the Part A service publishes, and
// it speaks plain HTTP/JSON to that service. The MCP tools below call these methods instead of
// touching the database directly; the order system stays the single owner of the data.
configurable string ordersApiUrl = "http://localhost:8080/orders";

final api:Client ordersApi = check new (serviceUrl = ordersApiUrl);
