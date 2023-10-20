Questions to answer

REGIONS

- Closed world regions <-
- All resources in all regions
- Regions a resource is definitely in
- Regions a resource is definitely not in
- Union of all properties in all regions
  - Validate that definitions in all regions are all the same, or calculate the superset of them

Warn for resources that are not available in a region we know the resource list of, if the stack is region-aware.

HISTORY

- Need to remember that fields used to be typed as 'Json' at a particular point
- Validation: once set, this field can never be turned off

> Need state, with validation on evolution

PATCHING

- Arbitrary parts of model may need to be overridden
  - Pokey poke with JavaScript?

CONNECTIONS

- Queries like:
  - property named 'bucketArn' -> search for resource named "bucket"
