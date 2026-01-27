# Implementation Plan: AWS Regions Data Source

## Overview

This implementation plan breaks down the AWS Regions Data Source feature into discrete coding tasks. Each task builds on previous tasks and ends with integrated, working code.

## Tasks

- [-] 1. Set up data source directory and projen configuration
  - [x] 1.1 Create `sources/AwsPartitions/README.md` with documentation
    - Document the source URL, purpose, and data structure
    - _Requirements: 1.1, 1.3, 2.7, 3.1_
  - [x] 1.2 Add `SingleSource` configuration to `.projenrc.ts`
    - Configure the download task for the partitions.json URL
    - No AWS authentication required (public GitHub URL)
    - _Requirements: 2.1, 2.2, 2.3, 2.4, 2.6_
  - [x] 1.3 Run `npx projen` to generate workflow and download initial data
    - Verify `update-source-aws-partitions.yml` workflow is generated
    - Verify `partitions.json` is downloaded to `sources/AwsPartitions/`
    - _Requirements: 1.4, 2.5_

- [x] 2. Checkpoint - Verify data source setup
  - Ensure projen generates the workflow correctly
  - Ensure the partitions.json file is downloaded
  - Ask the user if questions arise

- [x] 3. Define source schema types in service-spec-importers
  - [x] 3.1 Create `packages/@aws-cdk/service-spec-importers/src/types/aws-partitions/AwsPartitionsSource.ts`
    - Define `AwsPartitionsSource`, `AwsPartitionData`, `AwsRegionData`, `AwsPartitionOutputs` interfaces
    - Match the structure of the AWS SDK JS v3 partitions.json
    - _Requirements: 3.2, 3.3_
  - [x] 3.2 Export types from `packages/@aws-cdk/service-spec-importers/src/types/index.ts`
    - Add export for the new aws-partitions types
    - _Requirements: 4.3_
  - [x] 3.3 Add `AwsPartitionsSource` to the schema generation task in `.projenrc.ts`
    - Add to the `gen-schemas` task step list
    - _Requirements: 5.4_

- [x] 4. Extend Partition entity in service-spec-types
  - [x] 4.1 Update `packages/@aws-cdk/service-spec-types/src/types/resource.ts`
    - Extend `Partition` interface with `dnsSuffix`, `dualStackDnsSuffix`, `regionRegex`, `supportsFIPS`, `supportsDualStack` fields
    - _Requirements: 4.1, 4.2_
  - [x] 4.2 Update `packages/@aws-cdk/service-spec-types/src/types/database.ts`
    - Add `partition` entity collection with index on `partition` field
    - Add `hasRegion` relationship between `partition` and `region`
    - _Requirements: 4.2_

- [x] 5. Checkpoint - Verify types compile
  - Run `yarn build` in service-spec-types package
  - Ensure no TypeScript errors
  - Ask the user if questions arise

- [ ] 6. Implement loader in service-spec-importers
  - [ ] 6.1 Create `packages/@aws-cdk/service-spec-importers/src/loaders/load-aws-partitions.ts`
    - Implement `loadAwsPartitions` function following the pattern of `load-stateful-resources.ts`
    - Use `Loader.fromSchemaFile` with the generated schema
    - _Requirements: 5.1, 5.2, 5.3_
  - [ ] 6.2 Export loader from `packages/@aws-cdk/service-spec-importers/src/loaders/index.ts`
    - Add export for `loadAwsPartitions`
    - _Requirements: 5.5_
  - [ ] 6.3 Write unit tests for loader
    - Test loading valid partitions.json succeeds
    - Test loading invalid JSON fails appropriately
    - **Property 1: Schema Validation**
    - **Property 4: Loader Rejects Invalid Data**
    - **Validates: Requirements 3.3, 3.4, 5.2**

- [ ] 7. Implement importer in service-spec-importers
  - [ ] 7.1 Create `packages/@aws-cdk/service-spec-importers/src/importers/import-aws-partitions.ts`
    - Implement `importAwsPartitions` function following the pattern of `import-stateful-resources.ts`
    - Create Partition entities with all metadata fields
    - Create/reuse Region entities and link to partitions
    - _Requirements: 6.1, 6.2, 6.3_
  - [ ] 7.2 Add `importAwsPartitions` method to `packages/@aws-cdk/service-spec-importers/src/db-builder.ts`
    - Follow the pattern of `importStatefulResources`
    - _Requirements: 6.4_
  - [ ] 7.3 Write unit tests for importer
    - Test importing creates Partition entities
    - Test importing creates Region entities
    - Test importing creates hasRegion relationships
    - **Property 2: Import Creates Entities**
    - **Property 3: Import Round-Trip Consistency**
    - **Validates: Requirements 4.2, 6.2, 7.2**

- [ ] 8. Checkpoint - Verify loader and importer work
  - Run tests in service-spec-importers package
  - Ensure all tests pass
  - Ask the user if questions arise

- [ ] 9. Integrate into aws-service-spec build
  - [ ] 9.1 Update `packages/@aws-cdk/aws-service-spec/build/full-database.ts`
    - Add `importAwsPartitions` call with path to partitions.json
    - _Requirements: 7.1_
  - [ ] 9.2 Run full database build to verify integration
    - Execute `yarn build` in aws-service-spec package
    - Verify no build errors
    - _Requirements: 7.2_

- [ ] 10. Final checkpoint - Verify complete integration
  - Ensure all tests pass across all packages
  - Verify the generated database includes partition data
  - Ask the user if questions arise

## Notes

- Each task references specific requirements for traceability
- Checkpoints ensure incremental validation
- Property tests validate universal correctness properties
- The implementation follows existing patterns (StatefulResources, SAMSpec) for consistency
