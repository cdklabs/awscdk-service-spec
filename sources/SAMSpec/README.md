# SAM Specification

This directory contains an entire JSON schema for a CloudFormation template, including SAM Serverless resources.

## Source

<https://raw.githubusercontent.com/aws/serverless-application-model/develop/schema_source/sam.schema.json>

## Instructions

We have our own source of truth for the non-SAM resources, so we ignore everything except the
resources with the `AWS::Serverless:*` types.
