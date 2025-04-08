# AWS Service Spec

This package contains a definition of the AWS Resources available in CloudFormation.

# Patching

Sometimes it is necessary to patch in certain aspects of the CloudFormation schema, as they are not always
properly configured for our use cases. As such, we'll need to create a patch.

You can create a patch by following these steps:
1. Create a new patch file under `build/patches/service-patches/my-module.ts` (or use one of the existing patch files if it is for
the same module).
2. If you created a new file, add it to `build/patches/service-patches/index.ts`.
3. Enter in the exact properties, attributes, resources, etc. that you wish to patch. You can refer to the existing patches for example,
or the example down below:

```ts
import { forResource, fp, registerServicePatches, replaceDefinitionProperty } from './core';
import { patching } from '@aws-cdk/service-spec-importers';

const reason = patching.Reason.sourceIssue('Something in source was wrong');  // many root causes under `patching.Reason`

registerServicePatches(
  forResource('AWS::Service::Construct', (lens) => {
    replaceDefinitionProperty('SomeDefinition', 'SomeProperty', { type: 'integer' }, reason)(lens);
    replaceDefinition(
      'SomeDefinition',
      {
        type: 'string',
        properties : {
          X : {...},
          Y : {...},
          Z : {...},
        },
      },
      reason,
    )(lens);
    addDefinitions({newDefinition: "something something"}, reason)(lens);
    fp.removeFromReadOnlyProperties('AWS::Service::Construct', ['NotAReadOnlyProperty'], reason),
  }),
);
```

If you do not see your patching changes reflected, double check that there is not an existing [legacy patch](https://github.com/cdklabs/awscdk-service-spec/blob/main/sources/CloudFormationResourceSpecification/README.md)
that may be overwriting your changes.
