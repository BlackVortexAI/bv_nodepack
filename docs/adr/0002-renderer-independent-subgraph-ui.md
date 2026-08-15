# ADR 0002: Keep Subgraph UI state independent of the renderer

- Status: Accepted
- Date: 2026-08-14

## Context

Subgraph presentation previously depended on rebuilt widget arrays and their current indices. Removing and re-adding an exposed input could therefore move headings, spacers, dividers, or selectors after a reload.

## Decision

Subgraph UI identity and layout order are serialized as stable node properties and never derived from widget indices or labels. Frontend hooks are scoped to the owning node classes and use public node/widget operations. Legacy Canvas rendering remains specialized; Nodes 2.0 may fall back to standard widgets where it does not expose the same presentation hook.

## Consequences

Identity and saved order survive label changes, duplication, and workflow reload independently of the renderer. Exact Nodes 2.0 presentation and authoritative outer Subgraph ordering still require live verification against its evolving public API.
