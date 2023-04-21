import { forResource, fp, registerServicePatches, removeResourceProperty } from './core';
import { Reason } from '../../patching';

const reason = Reason.sourceIssue('Remove (presumed wrongly included) autoscaling group attribute');

registerServicePatches(
  fp.removeFromReadOnlyProperties('AWS::AutoScaling::AutoScalingGroup', ['LaunchTemplateSpecification'], reason),
  forResource('AWS::AutoScaling::AutoScalingGroup', (lens) => {
    removeResourceProperty('LaunchTemplateSpecification', reason)(lens);
  }),
);
