# 3. Generate Code from a specialized AST

Date: 2023-02-13

## Status

Accepted

## Context

A goal of the `awscdk-service-spec` project is to generate code from the service specification model,
that will allow consumers to describe model resources in any jsii language.
The generated code must be well-typed and jsii compatible and human readable.

Writing formatted code blocks is a solved problem. [^code-block-writer] [^codemaker] [^json2jsii]\
Existing code generation projects within the AWS CDK context mix specification parsing and analysis with code writing and do not generally distinguish between the two.
This design has proven itself challenging in regards of extensibility.
 [^cdk-cloudformation] [^cfn2ts]

We need to decided how we are structuring the code generation process for `awscdk-service-spec`.

## Decision

We will implement code generation from an Abstract Syntax Tree (AST).

This splits the generation process into two distinct steps:

- Composing an AST for a given specification model
- Printing out source code represented by the AST

We will design the AST to be jsii compatible.

## Consequences

Using an AST will make it possible to implement features that require knowledge of the complete tree.

Designing a generic AST could have a very large scope.
We intend to implement this on an as-needed basis, while keeping extensibility in mind.

A jsii compatible AST is not general purpose in regards to other TypeScript applications.
It will however make it easier to compose ASTs, as concerns of jsii compatibility are abstracted away from the user.
This also enables a possible extension to direct code generation to other jsii languages.

[^code-block-writer]: https://github.com/dsherret/code-block-writer
[^codemaker]: https://github.com/aws/jsii/tree/main/packages/codemaker
[^json2jsii]: https://github.com/cdklabs/json2jsii
[^cfn2ts]: https://github.com/aws/aws-cdk/tree/main/tools/%40aws-cdk/cfn2ts
[^cdk-cloudformation]: https://github.com/cdklabs/cdk-cloudformation
