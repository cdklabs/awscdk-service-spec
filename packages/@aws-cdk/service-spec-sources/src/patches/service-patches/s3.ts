import { forResource, registerServicePatches, replaceDefinitionProperty } from './core';
import { Reason } from '../../patching';

const reason = Reason.sourceIssue('Integer property incorrectly defined as string that only allows number characters');

registerServicePatches(
  forResource('AWS::S3::Bucket', (lens) => {
    replaceDefinitionProperty('Rule', 'ObjectSizeGreaterThan', { type: 'integer' }, reason)(lens);
    replaceDefinitionProperty('Rule', 'ObjectSizeLessThan', { type: 'integer' }, reason)(lens);
  }),
);
