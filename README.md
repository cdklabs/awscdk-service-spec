# AWS CDK Service Specification

Source of truth for CDK code generation.asdasd

## Packages

- `@cdklabs/tskb` - a typed database; contains build tools, query tools, validation mechanism
- `@cdklabs/typewriter` - a code generator with support for types

- `@aws-cdk/service-spec-importers` - import spec from data sources, transform into the db format
- `@aws-cdk/service-spec-types` - loading, saving, querying and diffing a db
- `@aws-cdk/aws-service-spec` - the actual db file

## Data Sources

The data is read iteratively from various sources. Information from later sources adds on to, or replaces, information
from older sources.

* **Properties are added**: new properties are added into existing resources and type definitions. Existing properties (and attributes)
  will never be removed.
* **Property type information is added**: when a new type is found, the old type is moved to the `previousTypes` array.
  However, for backwards compatibility reasons, CDK will currently (only) render the oldest type it can find. Newer types can
  be also rendered in the future, but are not right now. In a model diff, type history is rendered with a `⇐` between them, in order
  from new to old. If you see `type1 ⇐ type2 ⇐ type3`, then `type3` is the oldest and is the one that will be used by CDK.
* **Other property attributes are overwritten**: things like documentation, optionality, etc. are overwritten, so newer specifications
  fully overwrite the information from older specifications.

Sources are read in this order:

| What | Description | Updates |
|------|-------------|--------------------
| Resource Spec | This is the original [CloudFormation Resource Specification](https://docs.aws.amazon.com/AWSCloudFormation/latest/UserGuide/cfn-resource-specification.html), which is being replaced by the Registry Schema. Imported in order from `us-east-1`, `us-west-2`. | Frozen at version `144.0.0` (Oct 13, 2023). |
| SAM Resource Spec | This is the unofficial SAM resource spec as voluntarily maintained by the [GoFormation](https://github.com/awslabs/goformation) project | Daily |
| Patches | Handwritten [patches](https://github.com/cdklabs/awscdk-service-spec/tree/main/sources/CloudFormationResourceSpecification/us-east-1/000_cloudformation) are applied to these data sources to correct historical data quality issues with the vended specification | Manual |
| Registry Schema | This is the new [CloudFormation Resource Provider Schema](https://docs.aws.amazon.com/AWSCloudFormation/latest/UserGuide/resource-type-schemas.html), replacing the old Resource Spec. It is more expressive than the old spec. Imported in order: `us-east-1`, `us-east-2`, `us-west-2`. | Daily |
| SAM JSON Schema | This is the newer version of the unofficial [GoFormation](https://github.com/awslabs/goformation) SAM specification, expressed in JSON Schema. | Daily |
| Patches | Coded [patches](https://github.com/cdklabs/awscdk-service-spec/tree/main/packages/%40aws-cdk/service-spec-importers/src/patches) are applied to the JSON Schemas to correct for schema inconsistencies | Manual |
| GetAtt AllowList | A static list of attributes with the same name as properties | Manual |
| CloudFormation Docs | A JSON rendering of the AWS CloudFormation Resource Reference. | Weekly |
| Stateful Resources | An import of a single configuration file of [cfn-lint](https://github.com/aws-cloudformation/cfn-lint), containing resources that should be considered stateful | Weekly |
| Canned Metrics | An import of an inventory of metrics for various resource types, built by the AWS CloudWatch team for their console | Manual |
| Scrutinies | A classification of a number of resources and resource properties, indicating whether they contain IAM Policies or not | Manual |
| Augmentations | A manual declaration of a set of resource-related metrics, used in CDK code generation | Manual |

## Contributing

This repository uses [Git LFS](https://git-lfs.com/). Before you clone this repository, run the following commands
*once*:

```sh
brew install git-lfs   # Or equivalent, see the website above
git lfs install        # Need to run this once per repo
```

If you end up with the files not being downloaded from LFS
(these are called [LFS pointer files](https://github.com/git-lfs/git-lfs/wiki/Tutorial#lfs-pointer-files-advanced)),
the following command will download them for you:

```sh
git lfs pull
```
