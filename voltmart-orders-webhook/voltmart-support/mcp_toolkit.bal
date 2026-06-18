import ballerina/ai;

// ----- MCP toolkit: the bridge from the agent to the orders MCP service (Part 2) -----
//
// `ai:McpToolKit` connects to an MCP server, discovers every tool it publishes at startup,
// and presents them to the agent as native tools — no per-tool wiring. Point it at the orders
// MCP service and the agent gains getStatus, createOrder, removeOrder — and, as of Part 3,
// updateStatus — all at once. New tools on the service are picked up automatically, with no
// change here.
configurable string ordersMcpUrl = "http://localhost:8290/mcp";

final ai:McpToolKit ordersToolKit = check new (ordersMcpUrl,
    info = {name: "VoltMart Orders Client", version: "1.0.0"}
);
