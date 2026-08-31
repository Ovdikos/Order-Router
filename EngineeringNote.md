# Engineering Notes: Order Router

This document contains my notes and thought process while building the Order Router service. 

Instead of just delivering the final code, I wanted to capture the "why" behind it. Here, I document the reasoning behind my architectural choices, the trade-offs I considered, and how the solution evolved as I worked through the requirements.

The notes are structured chronologically and map directly to the project's commit history, giving you a clear view of how I approach problem-solving step by step.

## Stage 1: Base Infrastructure and Configuration
**Branch:** `feature/init-and-config`

I decided to keep the infrastructure simple by using a single `docker-compose` setup that spins up both the NestJS app and Redis. Redis will serve a dual purpose later (BullMQ broker and storage for blocking counters), which keeps the deployment lightweight.

For the routing rules, the specification strictly requires that adding currencies or changing limits shouldn't require code changes. I chose a YAML configuration file parsed via `js-yaml`. 

Initially, I considered using a file watcher like `chokidar` for hot-reloading. However, from past experience, file system events (like `inotify`) are notoriously flaky across Docker volume mounts, especially on Windows or macOS. Instead, I implemented a robust polling mechanism using `setInterval` and `fs.readFileSync` to check the config every 10 seconds. It has zero external dependencies and is bulletproof. I also added a strict validation step during `onModuleInit` to prevent the application from starting if the initial config is malformed.

## Stage 2: Domain Errors and Validation
**Branch:** `feature/domain-and-validation`

The specification is very strict about separating structural validation errors (HTTP 400) from business routing errors (HTTP 422). To handle this cleanly, I built custom decorators like `@IsUuidV7` and `@IsClientId`. 

For extracting the `created_at` timestamp from the UUIDv7, I skipped complex bitwise operations and just parsed the first 12 hex characters. It’s easier to read, maintain, and perfectly valid according to RFC 9562. I also added a critical sanity check to the extracted date: if the timestamp is before 2020 or strangely far in the future, it throws an error. Passing absurd dates (like 1970) to the provider would ruin their reconciliation reports.

Architecture-wise, I decided to keep the HTTP context completely out of the business logic. Drawing from my experience with CQRS patterns (like MediatR in C#), the core handlers should only throw domain-specific exceptions (e.g., `ClientBlockedException`, `RoutingRejectedException`). I created a `DomainExceptionFilter` in NestJS to globally catch these domain errors and map them to the correct HTTP status codes (403, 422). This keeps the domain layer clean and highly testable.

## Stage 3: Business Logic & Anti-Spam (CQRS)
**Branch:** `feature/cqrs-and-blocking`

For the core routing logic, I chose `@nestjs/cqrs`. Coming from a C# background where MediatR is the standard, this pattern feels very natural. The controller remains extremely thin—it just dispatches a `RouteOrderCommand` and steps back. All the heavy lifting (validating rules, checking bans, interacting with the queue) is isolated inside the `RouteOrderHandler`.

For the anti-spam blocking mechanism (triggering at >= 100 orders and > 30% rejected), I needed a solution that works across multiple instances. Redis is the obvious choice. Initially, I thought about using a Lua script to prevent race conditions when reading and writing the counters. However, I realized that taking advantage of the return value of the Redis `INCR` command accomplishes the same goal with much less complexity. `INCR` is atomic and returns the incremented value, completely eliminating the read-modify-write race condition. 

I also added a 30-day TTL (`EXPIRE`) to these counters. Without this, the Redis memory would grow infinitely, which violates the architectural constraint that we are a "pass-through node", not a permanent storage.

## Stage 4: Queueing and Async Delivery (BullMQ)
**Branch:** `feature/queue-delivery`

Decoupling ingestion from delivery is critical for handling traffic spikes (100 - 200 RPS) without blocking the HTTP event loop. I chose BullMQ because it runs on top of Redis - which we are already using for counters and provides native retry mechanisms and concurrency control.

To ensure idempotency out of the box, I configured the producer to use the `order_id` as the BullMQ `jobId`. If a client retries a request due to a network glitch, BullMQ will recognize that a job with this ID already exists and will safely ignore the duplicate. 

For the worker (`DeliveryProcessor`), I set `concurrency: 25`. This allows us to process up to 25 webhooks in parallel, preventing the queue from growing boundlessly during high traffic while protecting the application from being bottlenecked by a slow external provider.
