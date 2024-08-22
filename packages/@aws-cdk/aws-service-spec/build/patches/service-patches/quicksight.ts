import { patching } from '@aws-cdk/service-spec-importers';
import { forResource, registerServicePatches, replaceDefinition } from './core';

registerServicePatches(
  forResource('AWS::QuickSight::DataSet', (lens) => {
    const reason = patching.Reason.sourceIssue(
      'RefreshConfiguration property is marked as optional unintentionally.',
    );
    replaceDefinition(
      'DataSetRefreshProperties',
      {
        "type" : "object",
        "description" : "<p>The refresh properties of a dataset.</p>",
        "properties" : {
          "RefreshConfiguration" : {
            "$ref" : "#/definitions/RefreshConfiguration"
          }
        },
        "required" : [ "RefreshConfiguration" ],
        "additionalProperties" : false
      },
      reason,
    )(lens);
  })
);
