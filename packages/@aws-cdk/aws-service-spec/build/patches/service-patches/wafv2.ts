import { forResource, registerServicePatches, renameDefinition } from './core';
import { patching } from '@aws-cdk/service-spec-importers';

registerServicePatches(
  forResource('AWS::WAFv2::RuleGroup', (lens) => {
    const reason = patching.Reason.other(
      'Reverting property type names from FooAction to Foo, which were introduced as part of this PR: https://github.com/aws/aws-cdk/pull/23984',
    );

    renameDefinition('AllowAction', 'Allow', reason)(lens);
    renameDefinition('BlockAction', 'Block', reason)(lens);
    renameDefinition('CaptchaAction', 'Captcha', reason)(lens);
    renameDefinition('ChallengeAction', 'Challenge', reason)(lens);
    renameDefinition('CountAction', 'Count', reason)(lens);
  }),
);
