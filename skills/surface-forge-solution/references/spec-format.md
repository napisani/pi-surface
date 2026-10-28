# Tech Spec Format

A tech spec is a **typed call-stack architecture handoff**: code-shaped contracts plus execution flows. Prefer TypeScript pseudocode over prose wherever precision matters.

## Required outline

Use this shape unless the task is tiny enough to compress without losing contracts or call stacks:

```md
# <Title>

## Summary

## Context / Current State

## Goals

## Non-Goals

## Invariants

## Design Constraints

## Alternatives Considered

### Option 1: <name>

### Option 2: <name>

## Recommendation

## Proposed Design

## Domain Model and Types

## Types, Interfaces, and APIs

## Seams, Boundaries, Adapters, and Implementations

## Call Stacks and Data Flow

### Current / Old Flow

### Proposed / New Flow

### Failure Flow

### Retry / Cancellation / Idempotency Flow

### Observability Flow

## Files to Add / Change / Delete

## RGR TDD Test Plan

## Risks and Open Questions
```

Omit sections that truly do not apply, but do not omit typed contracts, seams, call stacks, or tests merely because they are hard to specify.

## What each core section must contain

**Typed contracts** — outline every new, changed, or deleted: domain value, branded/refined type, state machine variant, input/output type, request/response shape, function signature, class or module interface, expected-failure/custom-error type, adapter interface, protocol DTO, persistence DTO/projection, runtime-boundary codec, public API. Name seams, adapters, implementations, and ownership boundaries; state what each layer may know and what must not leak across the seam. Every new or changed boundary gets a concrete type/interface/API sketch, or an explicit reason no new contract is needed.

**Call stacks and data flow** — for every new, changed, or deleted behavior, show the call stack from entrypoint to side effects and response, with type/data flow:

```txt
raw input
  -> boundary DTO / unknown
  -> parser
  -> canonical domain/application input
  -> service/module interface
  -> adapter call
  -> typed result/error
  -> projection
  -> serialized output
```

Include current vs proposed flow when changing existing behavior. Include failure, retry, cancellation, transactionality, idempotency, observability, authorization, and runtime-hop flow when reachable.

**Files and modules** — list files/modules to add, change, and delete, plus test files and config/migration/runtime files. For each, state the contract, code path, boundary, adapter, domain concept, or test responsibility it owns. Every contract and call-stack step maps to a file/module or an open question.

**RGR TDD test plan** — plan vertical Red-Green-Refactor slices: one failing behavior test, minimal implementation, repeat. Do not write a horizontal "all tests first, all code later" plan. Favor behavior through public interfaces and real seams over implementation-coupled mocks. Cover proportionately: happy paths; failure paths; parser rejection and accepted shapes; domain invariants and state transitions; adapter contracts; persistence/runtime semantics; cancellation/retry/idempotency paths; observability where relevant; end-to-end flows for high-consequence behavior. Every public behavior, invariant, important failure path, changed boundary, and changed seam gets a red test slice or an explicit reason not to test it.

## Writing rules

- Code first: TypeScript pseudocode defines contracts, APIs, and data flow.
- Prose explains why; types and call stacks define what changes.
- Use the project's existing vocabulary, module layout, error patterns, adapters, and test style — do not introduce a pattern, library, schema style, or test strategy before checking local precedent.
- Prefer precise domain values over strings, booleans, nullable bags, and loosely shaped objects.
- Keep seams real: adapters translate framework, persistence, network, time, randomness, telemetry, runtime, or platform boundaries.
- Avoid speculative abstraction; every seam earns its existence through invariants, locality, leverage, testing, or a real boundary.
- Keep a single source of truth; do not restate the same rule in multiple sections unless one section points to the other.
- Unknowns stay open questions. Do not invent product requirements, domain rules, APIs, or call stacks to make the spec feel complete.
