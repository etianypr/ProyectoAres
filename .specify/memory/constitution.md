<!--
Sync Impact Report
- Version change: template -> 1.0.0
- Modified principles: replaced all template placeholders with ARES project principles
- Added sections: Product Constraints, Development Workflow
- Removed sections: none
- Deferred items: none
-->

# ARES Encomiendas Constitution

## Core Principles

### I. Conductor-First Experience
The conductor's phone workflow MUST minimize typing, taps, and attention away from
the road. Every delivery action MUST be clear, reversible where practical, and
usable on a small screen. Office workflows MAY be denser, but they MUST support the
same operational truth as the conductor workflow.

### II. Delivery Truth Over Convenience
The system MUST preserve the distinction between availability responses and actual
delivery results. It MUST distinguish delivered, person not found, no response,
and rejection. A rejection MUST NOT be silently reintroduced into a future route.
Summaries used for payment MUST be derived from recorded delivery outcomes.

### III. Test Critical Operations
Changes to route generation, address resolution, WhatsApp responses, delivery
states, payment inputs, or privacy boundaries MUST include focused tests for the
affected behavior. A user scenario MUST be testable independently before it is
considered complete.

### IV. Resilient External Services
Map and messaging providers MUST be treated as fallible dependencies. Address
resolution MUST expose ambiguity instead of silently selecting an unsafe location,
and provider failure MUST leave the conductor with an actionable recovery path.
Provider-specific behavior MUST NOT redefine the delivery states or business rules.

### V. Minimum Necessary Data
The application MUST limit collection, storage, access, and transmission of
recipient data to what is necessary for the current delivery operation and its
required result. Any new external integration that receives recipient data MUST
document the data exchanged, retention, and access boundary before implementation.

## Product Constraints

The product is focused on encomiendas. Detailed trip history, expenses, permanent
GPS tracking, accounting, and general logistics operations are out of scope unless
a later specification explicitly adds them. The mobile conductor app and desktop
office panel are separate experiences. Orange is the primary visual direction, but
status communication MUST remain accessible without relying on color alone.

## Development Workflow

Each feature MUST have a specification with user scenarios, testable functional
requirements, measurable success criteria, assumptions, and edge cases before
planning implementation. Plans MUST identify affected boundaries and external
dependencies. Implementation is complete only after focused validation and the
existing test suite or an explicit documented exception.

## Governance
<!-- Example: Constitution supersedes all other practices; Amendments require documentation, approval, migration plan -->

This constitution is the governing product and engineering guidance for ARES
Encomiendas. Amendments MUST be made through a documented change, include a version
bump, and explain their effect on existing specifications. Reviews MUST verify the
principles relevant to the changed behavior. A new exception MUST name its scope,
rationale, and removal condition.

**Version**: 1.0.0 | **Ratified**: 2026-08-20 | **Last Amended**: 2026-08-20
<!-- Example: Version: 2.1.1 | Ratified: 2025-06-13 | Last Amended: 2025-07-16 -->
