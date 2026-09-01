# Order Router

A high-throughput, fault-tolerant order routing microservice built with **NestJS**, **BullMQ**, and **Redis**. It accepts incoming orders via HTTP, validates them against live routing rules, enforces per-client anti-spam limits, and reliably delivers payloads to external webhook endpoints through a persistent async queue.

---

## Table of Contents

- [Overview](#overview)
- [Getting Started](#getting-started)
- [How to Run & Test](#how-to-run--test)
- [Manual Testing Guide](#manual-testing-guide)
- [API Reference](#api-reference)
- [Architectural Decisions & Trade-offs](#architectural-decisions--trade-offs)

---

## Overview

Order Router acts as a **pass-through ingestion node** between a client-facing API and downstream payment/processing providers. Its responsibilities are:

1. **Validate** incoming orders (UUID v7 format, client ID format, amount limits per currency).
2. **Enforce anti-spam rules** — track per-client acceptance/rejection ratios in Redis and automatically block clients that exceed the threshold.
3. **Route** accepted orders to the correct webhook URL based on currency, using a hot-reloadable YAML config.
4. **Guarantee delivery** via a BullMQ queue with exponential-backoff retries and a Dead Letter Queue (DLQ) for failed jobs.

---

## Getting Started

### 1. Clone the repository

```bash
git clone https://github.com/Ovdikos/Order-Router.git
cd Order-Router
```

### 2. Configure the webhook

Open `config/routing-rules.yaml` and replace the placeholder URLs with your real endpoints.
The easiest option is [webhook.site](https://webhook.site) — open the site, copy your unique URL, and paste it:

```yaml
currencies:
  ARS:
    min: 2000
    max: 10000000
  INR:
    min: 200
    max: 100000

webhooks:
  ARS: 'https://webhook.site/<your-token>'
  INR: 'https://webhook.site/<your-token>'
```

### 3. Start the stack

```bash
docker-compose up --build
```

That's it. No `npm install` needed — the Docker image handles dependencies.
Wait until you see:

```
[Bootstrap] Application is running on port 3001
```

---

## How to Run & Test

### Prerequisites

- [Docker](https://www.docker.com/) and Docker Compose

### Start the stack

```bash
docker-compose up --build
```

This starts two containers:
- `redis` — Redis 7 with AOF persistence enabled (`appendfsync everysec`)
- `order-router` — NestJS application on port `3001`

The service performs a **fail-fast config load** on startup: if `config/routing-rules.yaml` is missing or malformed, the process exits immediately with a descriptive error.

### Send a test order

```bash
curl -X POST http://localhost:3001/orders \
  -H "Content-Type: application/json" \
  -d '{
    "order_id": "018d3b5c-1234-7abc-8def-000000000001",
    "client_id": "cl_demo",
    "currency": "ARS",
    "amount": 50000
  }'
```

> **Note:** `order_id` must be a valid **UUID v7**. You can generate one at [uuidgenerator.net](https://www.uuidgenerator.net/version7).

### Check webhook delivery

Open [webhook.site](https://webhook.site) and set the ARS webhook URL in `config/routing-rules.yaml`:

```yaml
webhooks:
  ARS: 'https://webhook.site/<your-token>'
```

The config is **hot-reloaded every 10 seconds** — no restart required.

### Run unit tests

```bash
npm test
```

```
✓ test/unit/blocking.service.spec.ts        (5 tests)
✓ test/unit/routing-config.service.spec.ts  (6 tests)
✓ test/unit/route-order.handler.spec.ts     (9 tests)
```

### Monitor the queue

BullMQ dashboard is available at:

```
http://localhost:3001/queues
```

---

## Manual Testing Guide

All commands below assume the service is running on `localhost:3001`.
For generating valid UUID v7 values use [uuidgenerator.net/version7](https://www.uuidgenerator.net/version7) — generate a fresh one before each request that must be unique.

> **Tip:** In Postman, create a Collection Variable `{{base_url}}` = `http://localhost:3001` and a `{{uuid_v7}}` variable that you paste a fresh UUID into before each run.

---

### Case 1 — Happy path (202 Accepted)

```bash
curl -s -X POST http://localhost:3001/orders \
  -H "Content-Type: application/json" \
  -d '{
    "order_id": "<fresh-uuid-v7>",
    "client_id": "cl_demo",
    "currency": "ARS",
    "amount": 50000
  }'
```

**Expected response:**
```json
{ "status": "accepted", "order_id": "<your-uuid>" }
```

Check [webhook.site](https://webhook.site) — within a few seconds you should see the payload arrive:
```json
{
  "order_id": "...",
  "client_id": "cl_demo",
  "currency": "ARS",
  "amount": 50000,
  "created_at": "2026-..."
}
```

---

### Case 2 — Idempotency (resend the same order_id)

Send the **exact same request** a second time (same `order_id`).

**Expected response:** `202` again — no duplicate in the queue, no change in counters.

Verify in Redis that only one seen-key exists:
```bash
docker exec -it orderrouter-redis-1 redis-cli GET "order:seen:<your-uuid>"
# → "1"
```

---

### Case 3 — DTO validation error (400)

Missing required field or wrong format:

```bash
curl -s -X POST http://localhost:3001/orders \
  -H "Content-Type: application/json" \
  -d '{
    "order_id": "not-a-uuid",
    "client_id": "cl_demo",
    "currency": "ARS",
    "amount": 50000
  }'
```

**Expected response:**
```json
{
  "error": "VALIDATION_FAILED",
  "details": [{ "field": "order_id", "reason": "must be a valid UUID v7" }]
}
```

---

### Case 4 — Unknown currency (422)

```bash
curl -s -X POST http://localhost:3001/orders \
  -H "Content-Type: application/json" \
  -d '{
    "order_id": "<fresh-uuid-v7>",
    "client_id": "cl_demo",
    "currency": "USD",
    "amount": 100
  }'
```

**Expected response:**
```json
{ "error": "ROUTING_REJECTED", "reason": "UNKNOWN_CURRENCY", "currency": "USD" }
```

---

### Case 5 — Amount out of range (422)

```bash
curl -s -X POST http://localhost:3001/orders \
  -H "Content-Type: application/json" \
  -d '{
    "order_id": "<fresh-uuid-v7>",
    "client_id": "cl_demo",
    "currency": "ARS",
    "amount": 1
  }'
```

**Expected response:**
```json
{
  "error": "ROUTING_REJECTED",
  "reason": "AMOUNT_OUT_OF_RANGE",
  "currency": "ARS",
  "allowed_range": { "min": 2000, "max": 10000000 }
}
```

---

### Case 6 — Trigger client blocking (403)

The blocking rule: **≥100 total orders, >30% rejected**.

The quickest way to trigger it is to send many rejections for one client. Run this loop in your terminal (sends 100 requests with an invalid currency, each increments `total` and `rejected`):

```bash
for i in $(seq 1 100); do
  curl -s -X POST http://localhost:3001/orders \
    -H "Content-Type: application/json" \
    -d "{\"order_id\":\"$(uuidgen)\",\"client_id\":\"cl_spammer\",\"currency\":\"BAD\",\"amount\":100}" \
    > /dev/null
done
```

> **Windows PowerShell alternative:**
> ```powershell
> 1..100 | ForEach-Object {
>   $uuid = [System.Guid]::NewGuid().ToString()
>   Invoke-RestMethod -Method Post -Uri http://localhost:3001/orders `
>     -ContentType "application/json" `
>     -Body "{`"order_id`":`"$uuid`",`"client_id`":`"cl_spammer`",`"currency`":`"BAD`",`"amount`":100}"
> }
> ```

After the loop, send one more request from the same client with valid data:

```bash
curl -s -X POST http://localhost:3001/orders \
  -H "Content-Type: application/json" \
  -d '{
    "order_id": "<fresh-uuid-v7>",
    "client_id": "cl_spammer",
    "currency": "ARS",
    "amount": 50000
  }'
```

**Expected response:**
```json
{ "error": "CLIENT_BLOCKED", "client_id": "cl_spammer" }
```

---

### Inspecting Redis state

Open an interactive Redis CLI session:

```bash
docker exec -it orderrouter-redis-1 redis-cli
```

| Goal | Command |
|---|---|
| List all blocked clients | `SMEMBERS blocked_clients` |
| Check total orders for a client | `GET client:total:cl_spammer` |
| Check rejected orders for a client | `GET client:rejected:cl_spammer` |
| Check idempotency key for an order | `GET order:seen:<uuid>` |
| See remaining TTL on a counter | `TTL client:total:cl_spammer` |
| Manually unblock a client | `SREM blocked_clients cl_spammer` |
| Reset counters for a client | `DEL client:total:cl_spammer client:rejected:cl_spammer` |
| List all keys (debug only) | `KEYS *` |

**Example session after running Case 6:**
```
127.0.0.1:6379> SMEMBERS blocked_clients
1) "cl_spammer"

127.0.0.1:6379> GET client:total:cl_spammer
"101"

127.0.0.1:6379> GET client:rejected:cl_spammer
"100"
```

---

### Hot-reload config (no restart needed)

1. Edit `config/routing-rules.yaml` — for example, add a new currency or change a limit.
2. Wait up to **10 seconds**.
3. Watch the Docker logs — you'll see:
   ```
   [RoutingConfigService] Config reloaded: ARS, INR, EUR
   ```
4. Send a request with the new currency — it should be accepted immediately.

---

## API Reference

### `POST /orders`

Accepts a new order for routing.

#### Request body

| Field      | Type     | Description                                                                  |
|------------|----------|------------------------------------------------------------------------------|
| `order_id` | `string` | UUID v7. The embedded timestamp is validated (≥ 2020, ≤ now + 24h).         |
| `client_id`| `string` | Must match `cl_<alphanum>` (e.g. `cl_acme123`).                              |
| `currency` | `string` | Currency code. Existence in config is checked in the handler, not the DTO.   |
| `amount`   | `number` | Positive number, max 2 decimal places.                                       |

#### Response codes

| Code  | Body `error` field      | Meaning                                                      |
|-------|-------------------------|--------------------------------------------------------------|
| `202` | —                       | Order accepted and queued for delivery.                      |
| `400` | `VALIDATION_FAILED`     | DTO validation failed (wrong format, missing fields, etc.).  |
| `403` | `CLIENT_BLOCKED`        | Client has been automatically blocked due to high rejection ratio. |
| `422` | `ROUTING_REJECTED`      | Unknown currency or amount out of configured min/max range.  |
| `422` | `ROUTING_REJECTED`      | `reason: INVALID_ORDER_DATE` — UUID v7 timestamp out of bounds. |
| `503` | `SERVICE_UNAVAILABLE`   | BullMQ enqueue failed (Redis temporarily unavailable).       |

#### Example responses

```jsonc
// 202 Accepted
{ "status": "accepted", "order_id": "018d3b5c-..." }

// 400 Bad Request
{ "error": "VALIDATION_FAILED", "details": [{ "field": "amount", "reason": "must be a positive number with at most 2 decimal places" }] }

// 403 Forbidden
{ "error": "CLIENT_BLOCKED", "client_id": "cl_acme123" }

// 422 Unprocessable Entity
{ "error": "ROUTING_REJECTED", "reason": "AMOUNT_OUT_OF_RANGE", "currency": "ARS", "allowed_range": { "min": 2000, "max": 10000000 } }

// 503 Service Unavailable
{ "error": "SERVICE_UNAVAILABLE", "message": "Delivery queue temporarily unavailable. Please retry.", "order_id": "018d3b5c-..." }
```

---

## Architectural Decisions & Trade-offs

### CQRS for a Single Endpoint

The service uses `@nestjs/cqrs` with a `CommandBus` even though there is currently only one command (`RouteOrderCommand`). This is a deliberate choice, not over-engineering:

- **Separation of concerns.** The HTTP layer (`OrdersController`) is responsible exclusively for parsing the request, validating the DTO format, and returning an HTTP response. All business logic - currency validation, blocking, routing, enqueuing - lives in `RouteOrderHandler`. Neither layer knows the internals of the other.
- **Testability.** `RouteOrderHandler` can be tested as a plain class with mocked dependencies, with no HTTP context involved. The nine unit tests in `route-order.handler.spec.ts` demonstrate this: they test every business branch without spinning up an HTTP server.
- **Scalability signal.** Adopting CQRS from the start means adding a second command (`CancelOrderCommand`), an event (`OrderRoutedEvent`), or a saga requires zero refactoring of existing code. The architecture is ready to grow without rewrites.

---

### Distributed State & Consistency

The service is designed to run behind a load balancer with **multiple instances**. This means any local in-memory state (e.g. a plain `Map` for counters) would be invisible to other instances, leading to incorrect blocking decisions.

All mutable state — rejection/acceptance counters, the blocked-clients set, and the BullMQ job queue — lives exclusively in **Redis**. Redis's `INCR` command is **atomic at the server level**, which eliminates race conditions when multiple instances process requests for the same client simultaneously. No distributed locks or coordination protocols are needed.

A single ioredis connection is shared between the blocking service and BullMQ via `RedisService.getClient()`, avoiding duplicate TCP connection pools.

---

### HTTP Idempotency

Before any business logic runs, `execute` performs:

```
SET order:seen:{order_id} 1 EX 86400 NX
```

If the key already exists (`NX` fails), the handler returns `{ status: 'accepted' }` immediately without touching counters or the queue. This makes the endpoint safe to retry on network errors: a client that receives no response can re-send the same `order_id` and is guaranteed not to double-count or double-enqueue.

---

### Pass-through Node vs. Persistence (AOF)

The service is not a primary database — it holds no business records of its own. However, two things must survive a container restart:

1. **Anti-spam counters** — losing them would allow a blocked client to reset their ratio by triggering a restart.
2. **Queued jobs** — in-flight orders must not be silently dropped.

Both are handled by a single mechanism: **Redis AOF** (`appendonly yes`, `appendfsync everysec`). This provides a ≤1 second durability window with minimal write amplification, which is an acceptable trade-off for an ingestion node at this scale.

---

### Spam Counting Window: Fixed TTL vs. Sliding Window

The counters use a **fixed 30-day TTL** (`INCR` + `EXPIRE`) rather than a sliding window (e.g. a Redis Sorted Set with score = timestamp).

**Why not a sliding window?**

A sliding window requires storing one entry per event — memory complexity is **O(N)** per client, where N is the number of events in the window. For a high-volume service this can grow unboundedly, creating a memory leak risk.

Since Order Router is a pass-through node, not an analytics platform, the **O(1) per-client** footprint of `INCR` + `EXPIRE` is the correct trade-off. The 30-day window is long enough to catch sustained abuse while guaranteeing automatic cleanup.

---

### In-flight Orders During Blocking

When a client crosses the blocking threshold mid-session, orders already enqueued are **delivered normally**. Blocking operates exclusively at the **ingestion layer** — new `POST /orders` requests from that client are rejected with `403`, but the worker does not inspect the block list before delivering a job.

This is intentional. At the time those orders were accepted, the client still had the system's trust. Retracting already-accepted orders from the queue would require scanning BullMQ jobs (expensive), and would violate the contract implied by the `202 Accepted` response already sent to the caller.

---

### Unblocking Procedure *(Out of scope — design note)*

To unblock a client, an operator would call an internal admin endpoint:

```
DELETE /internal/clients/:clientId/block
```

The handler would execute two Redis commands:

```
SREM blocked_clients <clientId>
DEL  client:total:<clientId>
DEL  client:rejected:<clientId>
```

Removing the counters alongside the block is important: if only the block flag is cleared, the client would be immediately re-blocked on their next rejection because the historical ratio is still above the threshold.

---

### High Load (100–200 RPS) & Slow Webhooks

**The HTTP layer and the delivery layer are fully decoupled.**

When a webhook provider responds slowly (up to 10 seconds per request):

- `POST /orders` still responds in **< 10 ms** — it only writes a job to Redis and returns `202`.
- Workers process jobs at a fixed **concurrency of 25**. Even if all 25 slots are blocked waiting on a slow webhook, the ingestion layer continues accepting new orders into the queue uninterrupted.
- The `AbortSignal.timeout(10_000)` hard-caps each webhook attempt, preventing indefinite slot occupation.

**Bottleneck:** If the webhook provider goes down entirely, jobs accumulate in Redis. The queue will grow at the rate of incoming orders. The only hard limit is the **available RAM on the Redis host**. This is acceptable for a pass-through node — it is operationally equivalent to a message broker backlog, which is a known and manageable failure mode.

---

### Operations & Dead Letter Queue (DLQ)

Each job is configured with:

```ts
attempts: 15,
backoff: { type: 'exponential', delay: 3000 }   // 3s → 6s → 12s → ... → ~27 hours total
removeOnFail: false
```

After 15 failed attempts, the job moves to the **`failed`** state in BullMQ. It is **not deleted** (`removeOnFail: false`), making it the effective Dead Letter Queue.

**Recovery options for operators:**

- **BullMQ Dashboard** — available at `http://localhost:3001/queues` for visual retry/discard.
- **Bulk retry via script:**
  ```ts
  const failedJobs = await queue.getFailed();
  await Promise.all(failedJobs.map(job => job.retry()));
  ```
- **Programmatic discard** if the provider has changed and old jobs are no longer relevant:
  ```ts
  await queue.clean(0, 1000, 'failed');
  ```

The `jobId: payload.order_id` field ensures **idempotency** at the queue level - BullMQ will not add a duplicate job while one with the same ID is already active or waiting. Combined with the HTTP-layer `SET NX` guard, this creates two independent idempotency barriers.
