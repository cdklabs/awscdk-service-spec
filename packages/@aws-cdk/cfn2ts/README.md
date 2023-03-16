# Drop-in replacement for cfn2ts

## Use as cfn2ts replacement

You can use this packages as a drop-in replacement for `cfn2ts`.

- In `awscdk-service-spec`:
  - `yarn build` to do a complete build
  - `cd packages/@aws-cdk/cfn2ts`
  - `yarn link` to register the local package with yarn
- In your copy of `aws/aws-cdk`:
  - `yarn link "@aws-cdk/cfn2ts"` at the repository root to use our drop-in replacement
  - `yarn install` to update dependencies with our replacement
- Done! Now any `cfn2ts` command will run your local copy of `@aws-cdk/cfn-resources` instead
