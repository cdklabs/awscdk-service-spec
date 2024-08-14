import { patching } from '@aws-cdk/service-spec-importers';
import { forResource, registerServicePatches, replaceDefinition } from './core';

registerServicePatches(
  forResource('AWS::SecurityLake::Subscriber', (lens) => {
    const reason = patching.Reason.sourceIssue(
      'Sources array on AWS::SecruityLake::Subscriber is being dropped from final service spec db due to error producing Source type',
    );
    replaceDefinition(
      'Source',
      {
        type: 'object',
        properties : {
          AwsLogSource : {
            $ref : "#/definitions/AwsLogSource"
          },
          CustomLogSource : {
            $ref : "#/definitions/CustomLogSource"
          },
        },
        additionalProperties : false,
      },
      reason,
    )(lens);
  })
);
