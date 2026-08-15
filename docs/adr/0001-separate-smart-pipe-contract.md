# ADR 0001: Introduce Smart Pipe as a separate contract

- Status: Accepted
- Date: 2026-08-14

## Context

The legacy `BV_PIPE` contract exposes 100 positional inputs and outputs and depends on a separate configuration node. Incremental schemas, branches, and deleted producers cannot be represented safely by array position.

## Decision

`BV Smart Pipe` uses a new `BV_SMART_PIPE` contract. Slots have stable IDs and physical ordinals, schemas grow locally along a chain, and missing inherited slots remain explicit tombstones. The legacy Pipe nodes remain registered only for existing workflows and are marked deprecated; no converter or interoperability layer is provided.

## Consequences

New workflows gain compact, independently configurable pipes without positional substitution. Existing legacy workflows still load, but the old Pipe implementation receives no new features.
