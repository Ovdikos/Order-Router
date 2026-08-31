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
