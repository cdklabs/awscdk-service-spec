import { forResource, registerServicePatches, replaceResourceProperty } from './core';
import { patching } from '@aws-cdk/service-spec-importers';

/**
 * Fix the AWS::IoTFleetWise::DecoderManifest schema. The uploaded schema does not match the CFN docs
 * where property NetworkInterfaces definition refers to the non-exist CustomDecodingNetworkInterface type
 * and property SignalDecoders definition refers to the non-exist CustomDecodingSignalDecoder type.
 * This patch should be removed once the schema got updated.
 */
registerServicePatches(
  forResource('AWS::IoTFleetWise::DecoderManifest', (lens) => {
    replaceResourceProperty(
      'SignalDecoders',
      {
        type: 'array',
        minItems: 1,
        maxItems: 500,
        insertionOrder: false,
        items: {
          oneOf: [
            {
              $ref: '#/definitions/CanSignalDecoder',
            },
            {
              $ref: '#/definitions/ObdSignalDecoder',
            },
          ],
        },
      },
      patching.Reason.sourceIssue('Remove the wrong reference to the existing definition CustomDecodingSignalDecoder'),
    )(lens);

    replaceResourceProperty(
      'NetworkInterfaces',
      {
        type: 'array',
        minItems: 1,
        maxItems: 500,
        insertionOrder: false,
        items: {
          oneOf: [
            {
              $ref: '#/definitions/CanNetworkInterface',
            },
            {
              $ref: '#/definitions/ObdNetworkInterface',
            },
          ],
        },
      },
      patching.Reason.sourceIssue(
        'Remove the wrong reference to the existing definition CustomDecodingNetworkInterface',
      ),
    )(lens);
  }),
);
