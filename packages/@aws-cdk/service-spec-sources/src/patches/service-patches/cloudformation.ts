import { forResource, registerServicePatches, removeResourceProperty } from './core';
import { Reason } from '../../patching';

const reason = Reason.sourceIssue('Property is only supported by the CCAPI');

registerServicePatches(
  forResource('AWS::CloudFormation::Stack', (lens) => {
    const ccapiOnlyProps = [
      'Capabilities',
      'Description',
      'DisableRollback',
      'EnableTerminationProtection',
      'RoleARN',
      'StackName',
      'StackPolicyBody',
      'StackPolicyURL',
      'StackStatusReason',
      'TemplateBody',
    ];

    for (const prop of ccapiOnlyProps) {
      removeResourceProperty(prop, reason)(lens);
    }
  }),
);
