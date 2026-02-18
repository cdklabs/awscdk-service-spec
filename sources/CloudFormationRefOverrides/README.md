# Summary

This directory contains overrides for what the `{ Ref }` function returns in CloudFormation, if that disagrees
with the primary identifier from the schema.

The schema describes the behavior of CloudControl API, which is the same as the
behavior of CloudFormation, except when it isn't.

These are all validated by hand because there is no other automated source of truth for this information.

# Motivation

Since CDK is primarily built on top of CloudFormation, we need to know what CloudFormation actually does.