# 2. Use plain TypeScript and JSON to store model data

Date: 2023-01-31

## Status

Accepted

## Context

We have to pick a formalism to store our model in. The formalism should support recording
the facts that we need, type and integrity checking, and flexible querying.

## Decision

Evaluated candidates were RDF, Datalog, and plain JSON.

Ultimately we settled on representing our model in plain old TypeScript with a JSON layer for persistence. The reasons
for this are familiarity and type checking capabilities.

## Consequences

We'll have to build querying and reasoning capabilities ourselves.
