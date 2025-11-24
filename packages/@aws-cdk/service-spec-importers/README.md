# Service Spec Importers

Imports various service specification sources into a service database.

## Usage

### Programmatic

```ts
declare const db: SpecDatabase;

new DatabaseBuilder(db, options)
  // Import (modern) CloudFormation Registry Resources from a directory structure: <region>/<resource>.json
  .importCloudFormationRegistryResources('data/CloudFormationSchema/')

  // Import the (modern) JSON schema spec from SAM
  .importSamJsonSchema('data/sam.schema.json')

  // Import (legacy) CloudFormation Resource Specification from a directory structure containing a patch set: <region>/000_cloudformation/*.json
  .importCloudFormationResourceSpec('data/CloudFormationResourceSpecification/')

  // Import (legacy) SAM Resource Specification from a directory structure containing a patch set: *.json
  .importSamResourceSpec('data/SAMResourceSpecification/')

  // Import GetAtt'able attributes with the same name as properties
  .importGetAttAllowList('data/GetAttAllowlist/GetAttAllowlist.json')

  // Import various model enhancements
  .importCloudFormationDocs('data/CloudFormationDocumentation.json')
  .importStatefulResources('data/StatefulResources/StatefulResources.json')
  .importCannedMetrics('data/CloudWatchConsoleServiceDirectory.json'),

  // Apply the imports to the database
  .build();
```

### CLI

```console
Usage: import-db [options] [database]

Import service specification sources into a service model database

Arguments:
  database                         The database file (default: "db.json")

Options:
  -s, --source <definition...>     Import sources into the database. Use the format <source>:<path> to define sources.
  -l, --load <database>            Load an existing database as base, imported sources become additive
  -c, --gzip                       Compress the database file using gzip
  -f, --force                      Force overwriting an existing file (default: false)
  -d, --debug                      Print additional debug output during import (default: false)
  -r, --report <report-directory>  Create a detailed build report in the specified directory
  -v, --validate                   Validate imported sources and fail if any data is invalid (default: false)
  -h, --help                       display help for command
```

## Sources

| CLI source name     | DatabaseBuilder method                  | Path parameter                                                                  |
| ------------------- | --------------------------------------- | ------------------------------------------------------------------------------- |
| `cfnSchemaDir`      | `importCloudFormationRegistryResources` | Directory of structure `<region>/<resource>.json`                               |
| `samSchema`         | `importSamJsonSchema`                   | SAM Registry Schema file                                                        |
| `cfnSpecDir`        | `importCloudFormationResourceSpec`      | Directory structure containing a patch set `<region>/000_cloudformation/*.json` |
| `samSpec`           | `importSamResourceSpec`                 | SAM Resource Specification file file                                            |
| `cfnDocs`           | `importCloudFormationDocs`              | CloudFormation Documentation file file                                          |
| `statefulResources` | `importStatefulResources`               | Stateful Resources file                                                         |
| `cannedMetrics`     | `importCannedMetrics`                   | CloudWatch Console Service Directory file                                       |

### CloudFormation Registry Schema

CLI: `cfnSchemaDir`\
Code: `importCloudFormationRegistryResources(schemaDir: string)`

Import (modern) CloudFormation Registry Resources from a directory structure.
The directory MUST contain a directory for per region, each containing a registry schema file per resource.

```txt
CloudFormationSchema/
├─ us-east-1/
│  ├─ aws-s3-bucket.json
├─ eu-west-1/
│  ├─ aws-s3-bucket.json
```

### SAM Registry Schema

CLI: `samSchema`\
Code: `importSamJsonSchema(filePath: string)`

Import the (modern) JSON Schema Spec from SAM.
Path to a single file containing a SAM Registry Schema.
