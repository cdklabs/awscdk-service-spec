# AWS CDK Service Specification

Source of truth for CDK code generation.

## Packages

- `@cdklabs/tskb` - a typed database; contains build tools, query tools, validation mechanism
- `@cdklabs/typewriter` - a code generator with support for types

- `@aws-cdk/service-spec-importers` - import spec from data sources, transform into the db format
- `@aws-cdk/service-spec-types` - loading, saving, querying and diffing a db
- `@aws-cdk/aws-service-spec` - the actual db file

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
