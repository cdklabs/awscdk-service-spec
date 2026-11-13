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

* **Properties are added**: new properties are added into existing resources and type definitions. A resource, property,
  attribute or field that no source has any more is not in the database. The frozen Resource Spec still has most of those
  from before October 2023.
* **Property type information is added**: when a new type is found, the old type is moved to the `previousTypes` array.
  However, for backwards compatibility reasons, CDK will currently (only) render the oldest type it can find. Newer types can
  be also rendered in the future, but are not right now. In a model diff, type history is rendered with a `⇐` between them, in order
  from new to old. If you see `type1 ⇐ type2 ⇐ type3`, then `type3` is the oldest and is the one that will be used by CDK.
  Every build puts the type histories of the last released database first, see
  [Released database baseline](#released-database-baseline).
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
| Released Database | The database of an `@aws-cdk/aws-service-spec` release, whose L1 types every build keeps, and the [type mappings](packages/%40aws-cdk/aws-service-spec/build/type-mappings.json) that decide what the build cannot. See [Released database baseline](#released-database-baseline). | Manual, once per aws-cdk-lib release |
| GetAtt AllowList | A static list of attributes with the same name as properties | Manual |
| CloudFormation Docs | A JSON rendering of the AWS CloudFormation Resource Reference. | Weekly |
| Stateful Resources | An import of a single configuration file of [cfn-lint](https://github.com/aws-cloudformation/cfn-lint), containing resources that should be considered stateful | Weekly |
| Canned Metrics | An import of an inventory of metrics for various resource types, built by the AWS CloudWatch team for their console | Manual |
| Scrutinies | A classification of a number of resources and resource properties, indicating whether they contain IAM Policies or not | Manual |
| Augmentations | A manual declaration of a set of resource-related metrics, used in CDK code generation | Manual |

## Released database baseline

Every build starts from an empty database, so a type name stays in a type history only while a source still uses it.
To keep the L1 types that CDK released, the build reads the database of an `@aws-cdk/aws-service-spec` release,
`sources/ReleasedDatabase/db.json.gz`, and keeps its nested-type names and rendered types. The pin file
[`packages/@aws-cdk/aws-service-spec/build/released-database.json`](packages/%40aws-cdk/aws-service-spec/build/released-database.json)
holds its version, the npm integrity of its tarball and the sha256 of its `db.json.gz`. Every build refuses a
`db.json.gz` without the pinned sha256.

The build applies these rules after the sources that define types:

1. Each property, attribute and nested field that both the released database and the current sources have keeps the
   released type history first, so the L1 renders the released type. Where CloudFormation's type there equals the
   released newest type, the history stays as released, and the released type definitions it names are kept even
   where no current source describes them.
2. Where CloudFormation changed the type since the release, its type is added to the history. A released type
   definition that CloudFormation no longer has there is paired with the type at the same place in CloudFormation's
   type, if both types have the same lists, maps and unions: the one with the same name, or else the one that shares
   a field with it. Where CloudFormation put the type into a list or map, or took it out, the types inside are
   paired the same way, so a struct renamed and put into a list still pairs.
3. A kept type definition takes, at each position where the L1 renders it, the fields of CloudFormation's type there,
   plus its released fields that a current type at that position still has. Where CloudFormation put the type into
   a list or map, or took it out, the L1 keeps rendering the released type there, and it takes the fields of the
   struct inside, so CloudFormation's new fields are added and the fields it removed leave. Where CloudFormation's
   type there, inside any lists and maps, is not a type definition (for example a union or any JSON), it keeps
   exactly its released fields. A field is required if CloudFormation requires it at every position. A position where
   CloudFormation uses a current type of the released name that the released L1 lacks counts too, but only where the
   L1 renders it: not at or below a field its kept parent type does not keep, at any depth, such as one below a
   position CloudFormation turned into a union.
4. Resources, properties, attributes and fields that no current source has leave the L1.
5. The existing rules for `json` to `string` and `date-time` to `string` changes stay.

Merged and split types follow CloudFormation once they gain a field. A merge is several released types that
CloudFormation continues as one type; a split is one released type whose positions CloudFormation now gives more than
one type. While none of CloudFormation's types there has a field the released type lacks, and its positions need the
same fields, the released names stay. Once one has, or once the positions need different fields (for example a field
CloudFormation removed at one position only), the L1 renders CloudFormation's type wherever it has another name: for
a merge, at the positions of every merged released type together, and for a split, at each position where
CloudFormation renamed the type, while a position where CloudFormation kept the released name keeps it. The build
does this by itself, without a mapping entry, and the gate and the L1 change report list each switch as a type break.
A field CloudFormation removed at every position does not switch a type.

### Type history gate

Where the rules cannot decide, a person must. The `build` job fails on pull requests and in the merge queue when
`npx projen type-gate` (in `packages/@aws-cdk/aws-service-spec`) finds one of these cases:

* **No pair**: at a position where CloudFormation changed the type, no type shares a field with the released one.
* **Ambiguous candidates**: at such a position, more than one type does.
* **Diverging shared type**: the positions where the released type keeps its name need different fields, for example
  where CloudFormation's type at one of them is any JSON and at another a type with other fields.
* **Interdependent types**: whether a merged or split type follows CloudFormation depends on whether another type
  does, which depends on it in turn, so the rule gives no single result.

For each case it prints the resource, the positions and the released type, and one entry per kind that decides it.
The step also writes these entries to the `type-mapping-entries` build artifact. Settled renames, merges and splits,
merged and split types that follow CloudFormation, and the changes to the L1 since the released database, are printed
but do not fail the gate.

Among the settled renames, merges and splits, the gate also lists as weak matches each current type that shares fewer
than half of the released type's fields, by name, and each one paired with a released type without fields (as 0 of
0), since only its position paired them. Each line gives the resource, both types, the positions and the shared and
total counts, so a person can check the pair; weak matches do not fail the gate. Pairs a mapping entry decides are
not listed, and neither are merged and split types that follow CloudFormation, since the L1 renders CloudFormation's
own type there.

### Type mappings

[`packages/@aws-cdk/aws-service-spec/build/type-mappings.json`](packages/%40aws-cdk/aws-service-spec/build/type-mappings.json)
holds the decisions, and every build applies them. Each entry names the `resource` (the CloudFormation type), the
released `oldType`, the current `newTypes`, the `kind`, the `reason` and the `pr` that adds it. The kinds are:

| Kind | Effect on the L1 |
|------|------------------|
| `rename` | The released type continues as the named current type wherever that type stands at its positions, and takes that type's fields at all its positions |
| `merge` | As `rename`, for one of several released types that continue as one current type; one entry each |
| `split` | The released type stays where CloudFormation's type has its fields. Where CloudFormation uses one of the named types with other fields, the L1 renders that type |
| `replace` | Where the named current type stands at the positions of the released type, the L1 renders it |
| `keep-old` | The released type stays at all its positions, with its released fields plus those carried from each |
| `follow-cloudformation` | At the positions of the released type, the L1 renders CloudFormation's type |

`split`, `replace` and `follow-cloudformation` change the type at some positions, which breaks code that uses the
released type there. An entry wins over the rule for merged and split types, so `merge` or `keep-old` keeps a
released name on purpose. It keeps only the type it names: the other types of a merge still switch when the merged
type has a field one of them lacks. A malformed entry fails the build, naming the entry. An entry for a resource or type that the
sources do not have yet applies nowhere and is only reported, so it can merge before the source update that needs it.

When the gate fails on a source update pull request:

1. Pick the printed entry that is right, fill in its `reason` and `pr`, and open a pull request to `main` that adds it
   to `type-mappings.json`.
2. Once that pull request merges, the next source update passes the gate.

### Moving the baseline

Move the baseline once per aws-cdk-lib release, to the `@aws-cdk/aws-service-spec` version that release was built from
(`npm view aws-cdk-lib@<version> devDependencies`), in a pull request of its own. See
[`sources/ReleasedDatabase/README.md`](sources/ReleasedDatabase/README.md) for the steps. On such a pull request the
`build` job also checks that `db.json.gz` and `VERSION` are those of that version on npm, that the version is not lower
than the base branch's, and that the gate passes against the base branch's released database too.

### L1 change report

To see how the L1 that CDK renders differs between two databases:

```sh
packages/@aws-cdk/service-spec-importers/bin/diff-db --l1-changes sources/ReleasedDatabase/db.json.gz packages/@aws-cdk/aws-service-spec/db.json.gz
```

It lists renamed and merged structs, removed resources, properties, attributes, fields and structs, requiredness
changes, type changes, and the fields added to structs that keep their names. The database diff comment on pull
requests includes it.

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
