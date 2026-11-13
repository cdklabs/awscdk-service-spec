# Released Database

The database (`db.json.gz`) of an `@aws-cdk/aws-service-spec` release, stored with Git LFS. Every build keeps the L1
types of this database: see "Released database baseline" in the main README.

## Source

<https://www.npmjs.com/package/@aws-cdk/aws-service-spec>, at the version that
`packages/@aws-cdk/aws-service-spec/build/released-database.json` pins together with the npm integrity of its tarball
and the sha256 of its `db.json.gz`. `VERSION` holds the version of the downloaded database.

## Instructions

Move the baseline once per aws-cdk-lib release, to the `@aws-cdk/aws-service-spec` version that release was built
from (`npm view aws-cdk-lib@<version> devDependencies`), in a pull request of its own:

1. Set `version`, `integrity` (`npm view @aws-cdk/aws-service-spec@<version> dist.integrity`) and `sha256` (of the
   `db.json.gz` in that tarball) in `packages/@aws-cdk/aws-service-spec/build/released-database.json`.
2. Run `npx projen` and then `npx projen update-source:released-database`, which downloads the tarball, refuses it
   unless it has the pinned integrity, and writes `db.json.gz` and `VERSION`.

Every build refuses a `db.json.gz` without the pinned sha256. On a pull request that changes the baseline, the `build`
job also checks that `db.json.gz` and `VERSION` match the npm release, that the version is not lower than the base
branch's, and that the type history gate passes against the base branch's baseline too.
