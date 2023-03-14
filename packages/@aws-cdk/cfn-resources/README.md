# Generated sources

Make sure the database is up-to-date:

```
(cd ../service-spec-build && yarn compile && yarn build:db)
```

Run as follows:

```
yarn compile # (or npx tsc -b)
node lib/cli/main
```
