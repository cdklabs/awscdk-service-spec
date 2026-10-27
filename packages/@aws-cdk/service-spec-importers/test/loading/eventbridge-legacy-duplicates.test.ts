import { withoutLegacyDuplicates } from '../../src/loaders/load-eventbridge-schema';

test('drops a legacy file when its dashed copy is present', () => {
  expect(
    withoutLegacyDuplicates([
      'us-east-1/aws.autoscaling@EC2InstanceLaunchLifecycleAction.json',
      'us-east-1/aws.autoscaling@EC2Instance-launchLifecycleAction.json',
      'us-east-1/aws.xray@AWSXRayInsightUpdate.json',
      'us-east-1/aws.xray@AWSX-RayInsightUpdate.json',
    ]),
  ).toEqual([
    'us-east-1/aws.autoscaling@EC2Instance-launchLifecycleAction.json',
    'us-east-1/aws.xray@AWSX-RayInsightUpdate.json',
  ]);
});

test('keeps a legacy file that has no dashed copy', () => {
  expect(
    withoutLegacyDuplicates([
      'us-east-1/aws.codedeploy@CodeDeployDeploymentStateChangeNotification.json',
      'us-east-1/aws.kinesis@AWSAPICallviaCloudTrail.json',
    ]),
  ).toEqual([
    'us-east-1/aws.codedeploy@CodeDeployDeploymentStateChangeNotification.json',
    'us-east-1/aws.kinesis@AWSAPICallviaCloudTrail.json',
  ]);
});

test('keeps files whose names differ only in letter case', () => {
  expect(
    withoutLegacyDuplicates([
      'us-east-1/aws.s3@AWSAPICallViaCloudTrail.json',
      'us-east-1/aws.s3@AWSAPICallviaCloudTrail.json',
    ]),
  ).toEqual(['us-east-1/aws.s3@AWSAPICallViaCloudTrail.json', 'us-east-1/aws.s3@AWSAPICallviaCloudTrail.json']);
});
