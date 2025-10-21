import { fp, registerServicePatches } from './core';
import { patching } from '@aws-cdk/service-spec-importers';

const reason = patching.Reason.sourceIssue('Remove wrong relationship');

registerServicePatches(
    fp.removeRelationshipfromProperty({
        resource: 'AWS::Redshift::Cluster',
        propertyPath: '/properties/VpcSecurityGroupIds',
        targetResource: 'AWS::EC2::VPC',
        targetProperty: '/properties/VpcId',
        reason
    }),
);