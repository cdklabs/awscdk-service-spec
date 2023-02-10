# Service Spec Build

Read the `service-spec-sources` and convert them into our service database.

Not sure about the long-term organization of this code, but this will do for now.

## How to exercise

```
$ npx tsc -b
$ node -r source-map-support/register lib/cli/build
```

