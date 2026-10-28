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
  However, for backwards compatibility reasons, CDK will currently (only) render the oldest type it can find. Newer types can
  be also rendered in the future, but are not right now. In a model diff, type history is rendered with a `⇐` between them, in order
  from new to old. If you see `type1 ⇐ type2 ⇐ type3`, then `type3` is the oldest and is the one that will be used by CDK.
  The type history of the last released database is kept across builds, see [Released type history](#released-type-history).
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
| Released Type History | The type history of the `@aws-cdk/aws-service-spec` release that aws-cdk-lib currently generates its L1s from. Its types stay the oldest types where CloudFormation renamed or merged them, see [Released type history](#released-type-history). | Manual, after each L1 update in aws-cdk |
| GetAtt AllowList | A static list of attributes with the same name as properties | Manual |
| CloudFormation Docs | A JSON rendering of the AWS CloudFormation Resource Reference. | Weekly |
| Stateful Resources | An import of a single configuration file of [cfn-lint](https://github.com/aws-cloudformation/cfn-lint), containing resources that should be considered stateful | Weekly |
| Canned Metrics | An import of an inventory of metrics for various resource types, built by the AWS CloudWatch team for their console | Manual |
| Scrutinies | A classification of a number of resources and resource properties, indicating whether they contain IAM Policies or not | Manual |
| Augmentations | A manual declaration of a set of resource-related metrics, used in CDK code generation | Manual |

## Released type history

Every build starts from an empty database, so a type name only stays in a type history while a source still uses it.
When CloudFormation renames the type definitions of a resource, the L1 types that CDK already released would disappear.
To prevent this, the build reads the database of the `@aws-cdk/aws-service-spec` release that aws-cdk-lib currently
uses (`sources/ReleasedDatabase/db.json.gz`) and puts its types first in the type histories of resource properties,
attributes and nested fields, so CDK keeps rendering the released types:

* A released type stays where CloudFormation renamed or merged it: a current type at the same position has the same
  lists, maps and unions, around type definitions that have the same name as the released ones or share a field with
  them. Any other type change comes from CloudFormation, and the L1 follows it. Examples are a list of JSON values
  that became a list of strings, a single value that became a list, and a renamed type that also became part of a
  union.
* Released resources and properties that CloudFormation removed are not recreated.
* A released type keeps only the fields that still exist in a current type at any position where the released type
  was used. If the type was used at several positions, the L1 renders such a field at all of them. The build log and
  the build report list each position whose current types lack the field. The L1 compatibility check and the
  database diff comment on pull requests do not show it, whether the current type at that position has the released
  name or another one.

The released version is `RELEASED_SERVICE_SPEC_VERSION` in [`.projenrc.ts`](.projenrc.ts). Beside it,
`RELEASED_SERVICE_SPEC_INTEGRITY` is the `dist.integrity` of that npm package, and `RELEASED_SERVICE_SPEC_SHA256` is
the sha256 of its `db.json.gz`. Bump all three together. After each L1 update in aws-cdk, set the version to the
`@aws-cdk/aws-service-spec` version in aws-cdk's `packages/aws-cdk-lib/package.json` and the integrity to its value
in aws-cdk's `yarn.lock` (or `npm view @aws-cdk/aws-service-spec@<version> dist.integrity`), and run:

```sh
npx projen
npx projen update-source:released-database
```

The download fails if the package has another integrity. Set the sha256 to the output of
`sha256sum sources/ReleasedDatabase/db.json.gz`, run `npx projen` again, and open a pull request with the changes.
The build job fails if the checked-in database does not have the pinned sha256.

### L1 compatibility check

The check compares the L1 code CDK would render from the new database with the code it renders from the released
database:

```sh
packages/@aws-cdk/service-spec-importers/bin/diff-db --l1-compat sources/ReleasedDatabase/db.json.gz packages/@aws-cdk/aws-service-spec/db.json.gz
```

Each change is one of:

* **Rename or merge loss**: a released type or field is gone, but CloudFormation still has it in a current type at the
  same position. The build lost type history, and the check fails. Fix the cause, for example with a patch, before
  merging.
* **CloudFormation change**: CloudFormation removed something from every current type, or changed a type or whether
  a field is required. The L1 follows CloudFormation. These changes are listed for review, but do not fail the check.
* **Addition**: anything new. Only counted.

The build job runs the check on pull requests and in the merge queue, and fails on a loss. When a change replaces the
released database, the build job also compares the new database with the released database of the base branch,
prints the version and sha256 of both, and fails on a loss. The report is also in the build report and in the
database diff comment on pull requests.

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
