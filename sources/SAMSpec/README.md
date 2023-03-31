This directory contains an entire JSON schema for a CloudFormation template, obtained from:

https://github.com/awslabs/goformation/blob/master/schema/sam.schema.json

We have our own source of truth for the non-SAM resources, so we ignore everything except the
resources with the `AWS::Serverless:*` types.
