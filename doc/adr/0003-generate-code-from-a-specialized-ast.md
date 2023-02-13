# 3. Generate Code from a specialized AST

Date: 2023-02-13

## Status

Accepted

## Context

A goal of this project is the generate code from the service specification model,
that will allow consumers to describe model resources in any jsii language.
The generated code must be well-typed and jsii compatible, but not necessarily human readable.

Writing formatted code blocks is a solved problem. [^code-block-writer], [^codemaker], [^json2jsii]

Prior art of code generation for the AWS CDK has a achieved different levels of separation of concerns, but generally mixes spec parsing and analysis with code writing.
 [^json2jsii] [^cfn2ts]

## Decision

We will implement code generation from an Abstract Syntax Tree (AST).

This splits the generation process into two distinct steps:

- Building an AST for a given specification model
- Rendering an AST to TypeScript code

We will design the AST to be jsii compatible.

## Consequences

Designing a generic AST is a larger scope than generating code for a well-known set of specification models.

However with model sources being defined in the effectively unconstrained JSON Schema, any scope gains are likely to be front loaded.
Anticipating increased usage of complex JSON Schema features by first (AWS) and third party (via CloudFormation Registry) model providers, a general purpose design appears more effective.

Making the AST jsii compatible will limit the general purposefulness in regards to other TypeScript applications.
It should however improve the process of building an AST since any concerns of jsii compatibility are delegated to the AST.
Additionally this enables a possible future extension of direct code generation to other jsii languages.

[^code-block-writer]: https://github.com/dsherret/code-block-writer
[^codemaker]: https://github.com/aws/jsii/tree/main/packages/codemaker
[^json2jsii]: https://github.com/cdklabs/json2jsii
[^cfn2ts]: https://github.com/aws/aws-cdk/tree/main/tools/%40aws-cdk/cfn2ts
