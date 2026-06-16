// Mock order data so the order-status tool is fully self-contained — no real backend.
// In production this map would be a database or an order-management connector.
// Keyed by order number (without the leading '#').
final map<Order> & readonly mockOrders = {
    "10432": {
        orderNumber: "10432",
        accountEmail: "jordan@example.com",
        item: "AirWave Pro wireless headphones",
        status: "shipped",
        eta: "arriving Thursday, 18 June 2026"
    },
    "10588": {
        orderNumber: "10588",
        accountEmail: "priya@example.com",
        item: "SoundDock 2 Bluetooth speaker",
        status: "processing",
        eta: "ships within 1 business day"
    },
    "10219": {
        orderNumber: "10219",
        accountEmail: "sam@example.com",
        item: "VoltBook 14 laptop",
        status: "delivered",
        eta: "delivered on 9 June 2026"
    }
};
