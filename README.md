# AWS CDK Service Specification

Source of truth for CDK code generation.

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
  For backwards compatibility, CDK renders the oldest type it can find, so a property keeps its L1 type when a later
  source changes it, for example from `json` to a struct or a union, from `integer` to `number`, or from a struct to `json`.
  In a model diff, type history is rendered with a `⇐` between them, in order from new to old. If you see
  `type1 ⇐ type2 ⇐ type3`, then `type3` is the oldest and is the one that will be used by CDK.
* **Renamed and merged structs are replaced**: when a later source gives a property or a field another struct (type
  definition) than the one it has, also as the element of the same list or map, the source has renamed that struct or
  merged it with another one. The new struct replaces the old one instead of being added to the type history, so CDK
  renders the struct that CloudFormation uses now, with its current fields, and no longer renders the old struct when
  nothing else uses it. Code that names the old struct needs the new name. When regions disagree, the struct of the region
  imported last wins, like the overwritten attributes below.
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

## L1 changes in pull requests

The `diff-db` job of every pull request compares the L1 code that CDK renders from the database of the base branch with
the L1 code it renders from the database of the pull request, and adds the result to its pull request comment: renamed and
merged structs with their field differences, removed fields, requiredness changes and other changes. The report does not
fail the job. To run it locally:

```sh
packages/@aws-cdk/service-spec-importers/bin/diff-db --l1-changes <base db.json.gz> <new db.json.gz>
```

The `build` job fails when the L1 misses a field that a current CloudFormation schema accepts as input, on pull
requests and in the merge queue, and its log lists the missing fields. When the build passes, the `diff-db` job adds
the result of the same check to its comment. Fields in the schema's `readOnlyProperties` are not input unless they are
also in `createOnlyProperties`, and where the L1 type is `json` it accepts every field. A missing field usually means
that the L1 renders an older type of the property, for example while regions disagree on a renamed struct. The check
also fails when it finds no schema. To run it locally after a build:

```sh
cd packages/@aws-cdk/aws-service-spec
npx projen check-input-fields [<db.json.gz>]
```

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
