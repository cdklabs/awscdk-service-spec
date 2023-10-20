# Service Spec Importers

Imports various service specification sources into a service database.

## Usage

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
