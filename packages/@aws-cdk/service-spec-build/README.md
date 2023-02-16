# Service Spec Build

Read the `service-spec-sources` and convert them into our service database.

Not sure about the long-term organization of this code, but this will do for now.

## How to exercise

```console
npx projen build
```

Or individually:

```console
npx projen compile
npx projen build:db
```
