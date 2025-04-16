import { forResource, fp, registerServicePatches, replaceResourceProperty } from './core';
import { patching } from '@aws-cdk/service-spec-importers';

registerServicePatches(
  fp.addReadOnlyProperties(
    'AWS::RDS::DBCluster',
    ['ReadEndpoint'],
    patching.Reason.sourceIssue('ReadEndpoint should be listed in readOnlyProperties.'),
  ),
  forResource('AWS::RDS::DBInstance', (lens) => {
    replaceResourceProperty(
      'CertificateDetails',
      {
        $ref : "#/definitions/CertificateDetails",
        description : "The details of the DB instance’s server certificate."
      },
      patching.Reason.sourceIssue('Missing description caused property to be removed in L1 update.'),
    )(lens);

    replaceResourceProperty(
      'Endpoint',
      {
        $ref : "#/definitions/Endpoint",
        description : "This data type represents the information you need to connect to an Amazon RDS DB instance."
      },
      patching.Reason.sourceIssue('Missing description caused property to be removed in L1 update.'),
    )(lens);
  })


);
