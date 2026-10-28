# Released Database

The database (`db.json.gz`) of the `@aws-cdk/aws-service-spec` release that aws-cdk-lib currently generates its L1s from.

## Source

<https://www.npmjs.com/package/@aws-cdk/aws-service-spec>, the version set as `RELEASED_SERVICE_SPEC_VERSION` in
`.projenrc.ts`. Projen writes that version to `VERSION`, where the build and pull request checks read it.

## Instructions

The build uses the type history of this database, so the L1 types CDK released survive schema renames, and compares
the new database with it to find lost type history. See "Released type history" in the main README.

Update it after each L1 update in aws-cdk, and bump `RELEASED_SERVICE_SPEC_VERSION`, `RELEASED_SERVICE_SPEC_INTEGRITY`
and `RELEASED_SERVICE_SPEC_SHA256` together: change the version and the integrity, run `npx projen` and
`npx projen update-source:released-database`, then set the sha256 to that of the new `db.json.gz` and run
`npx projen` again. The build job fails if `db.json.gz` does not have the pinned sha256.
