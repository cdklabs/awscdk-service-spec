# Stateful Resources

This directory contains an entire JSON schema for a CloudFormation template, including SAM Serverless resources.

## Source

<https://raw.githubusercontent.com/aws-cloudformation/cfn-lint/main/src/cfnlint/data/AdditionalSpecs/StatefulResources.json>

## Instructions

Used to identify resources that should be considered stateful.
When used as part of a L2 Construct, these resources will have a default deletion policy of `RETAIN`.
This creates a contract with users that a stateful resource will not be automatically deleted.
Therefor a stateful resource can never be made stateless.
However a stateless resource might ve marked stateful retrospectively.
