# VoltMart Order Management Service

The HTTP service that stands in for VoltMart's real order management system. It exposes a small REST
API over `/orders`, backed by a PostgreSQL database, and enforces an **ownership check** so an order
is only revealed — or removed — when the caller supplies the email the order belongs to.

This is the backend the MCP service (and, through it, the AI agent) ultimately acts on. It knows
nothing about AI or MCP: it's a plain HTTP service that any client can call.

## What's inside

| File | Purpose |
|------|---------|
| `service.bal` | The `/orders` REST API — `GET`, `POST`, `DELETE`, plus the ownership check. |
| `database.bal` | The pooled PostgreSQL client and the query/insert/delete helpers. |
| `types.bal` | The `Order` record and the typed `200`/`403`/`404`/`409` responses. |
| `docker-compose.yml` | A throwaway PostgreSQL instance for the order data. |
| `db/init.sql` | Schema + seed orders, run automatically the first time the DB container starts. |
| `orders_openapi.yaml` | The OpenAPI contract — what the MCP service generates its typed client from. |

## The API

The service listens on `http://localhost:8080/orders` and exposes three operations:

- **`GET /orders/{orderNumber}?email=…`** — look up an order. Returns `200` with the order, `404` if
  no order matches the number, or `403` if the email doesn't match the account it belongs to.
- **`POST /orders`** — create an order from `{ orderNumber, accountEmail, item }`. Returns `201` with
  the new order, or `409` if that number is already taken. New orders start in `processing`.
- **`DELETE /orders/{orderNumber}?email=…`** — remove an order after the same ownership check.
  Returns `200`, `404`, or `403`.

The ownership check (the email must match the order, compared case-insensitively) lives here, in the
system that owns the data — not in any client.

## Prerequisites

- **Docker Desktop** (or any Docker engine with Compose). Confirm with `docker compose version`.
- **Ballerina** — use the distribution that ships with your WSO2 Integrator install
  (`distribution = "2201.12.0"` in `Ballerina.toml`). Confirm with `bal version`.

## Run it locally

1. **Start the database.** From this directory, bring up the PostgreSQL container. `db/init.sql`
   creates the `orders` table and seeds it the first time it starts.

   ```bash
   docker compose up -d
   ```

   Wait until it's healthy (`docker compose ps` shows `healthy`).

2. **Start the API.** The service reads its DB connection settings from `Config.toml`, which already
   matches the Docker credentials.

   ```bash
   bal run
   ```

   The API comes up on **`http://localhost:8080/orders`**.

## Verify it's working

A quick check from the command line — no agent, no MCP, just HTTP — confirms it's live and that the
ownership check works:

```bash
# A real order, with the matching email → 200 and the order
curl -s "http://localhost:8080/orders/10432?email=jordan@example.com"

# The wrong email → 403, no details leak
curl -s -o /dev/null -w "%{http_code}\n" "http://localhost:8080/orders/10432?email=wrong@example.com"
```

The first call returns order `10432` as JSON; the second prints `403`.

Create and then remove an order to exercise the write paths:

```bash
# Create a new order → 201
curl -s -X POST http://localhost:8080/orders \
  -H "Content-Type: application/json" \
  -d '{"orderNumber":"10644","accountEmail":"dana@example.com","item":"VoltBuds Mini"}'

# Remove it with the matching email → 200
curl -s -X DELETE "http://localhost:8080/orders/10644?email=dana@example.com"
```

## Seeded orders

The database starts with three orders to work with:

| Order number | Account email | Item | Status |
|--------------|---------------|------|--------|
| `10432` | `jordan@example.com` | AirWave Pro wireless headphones | shipped |
| `10588` | `priya@example.com` | SoundDock 2 Bluetooth speaker | processing |
| `10219` | `sam@example.com` | VoltBook 14 laptop | delivered |

## Stop and clean up

```bash
docker compose down -v   # stop the database and wipe its data
```

The next `docker compose up -d` re-seeds from `db/init.sql`.

## Configuration

`Config.toml` holds the port and DB connection settings, which match `docker-compose.yml`:

```toml
port = 8080
dbHost = "localhost"
dbPort = 5432
dbUser = "voltmart"
dbPassword = "voltmart"
dbName = "voltmart_orders"
```

In production, keep real secrets out of source control and inject them as environment variables
instead.
