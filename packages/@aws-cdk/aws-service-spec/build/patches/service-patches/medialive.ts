import { forResource, registerServicePatches, splitDefinition } from './core';
import { patching } from '@aws-cdk/service-spec-importers';

registerServicePatches(
  forResource('AWS::MediaLive::Channel', (lens) => {
    const reason = patching.Reason.upstreamTypeNameChange(
      'The schema merged H264FilterSettings and H265FilterSettings into H264H265FilterSettings, and BurnInDestinationSettings and DvbSubDestinationSettings into BurnInDvbSubDestinationSettings. CDK keeps the original type of each property, so without this the original types lose BandwidthReductionFilterSettings and SubtitleRows.',
    );

    splitDefinition(
      'H264H265FilterSettings',
      {
        '/definitions/H264Settings/properties/FilterSettings': 'H264FilterSettings',
        '/definitions/H265Settings/properties/FilterSettings': 'H265FilterSettings',
      },
      reason,
    )(lens);

    splitDefinition(
      'BurnInDvbSubDestinationSettings',
      {
        '/definitions/CaptionDestinationSettings/properties/BurnInDestinationSettings': 'BurnInDestinationSettings',
        '/definitions/CaptionDestinationSettings/properties/DvbSubDestinationSettings': 'DvbSubDestinationSettings',
      },
      reason,
    )(lens);
  }),
);
