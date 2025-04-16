import { fp, registerServicePatches } from './core';
import { patching } from '@aws-cdk/service-spec-importers';

registerServicePatches(
  fp.addReadOnlyProperties(
    'AWS::RDS::DBCluster',
    ['ReadEndpoint'],
    patching.Reason.sourceIssue('ReadEndpoint should be listed in readOnlyProperties.'),
  ),
  fp.addReadOnlyProperties(
    'AWS::RDS::DBInstance',
    ['CertificateDetails', 'Endpoint'],
    patching.Reason.sourceIssue('CertificateDetails and Endpoint should be listed in readOnlyProperties. Pending service team confirmation that the removal of these properties is intentional.'),
  ),
);
