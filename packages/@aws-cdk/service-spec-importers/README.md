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

  // Import various model enhancements
  .importCloudFormationDocs('data/CloudFormationDocumentation.json')
  .importStatefulResources('data/StatefulResources/StatefulResources.json')
  .importCannedMetrics('data/CloudWatchConsoleServiceDirectory.json'),
  .importScrutinies()
  .importAugmentations()

  // Apply the imports to the database
  .build();
```

### CLI

```console
Usage: import-db [options] [db]

Import service specification sources into a service model database

Arguments:
  db                         The database file (default: "db.json")

Options:
  -i, --input <db-file>      Load an existing database as base, imported sources are additive.
  -c, --gzip                 Compress the database file using gzip
  -f, --force                Force overwriting an existing file (default: false)
  -d, --debug                Print additional debug output during import (default: false)
  -r, --report <report-dir>  Create a detailed build report in the specified directory
  -h, --help                 display help for command
````
