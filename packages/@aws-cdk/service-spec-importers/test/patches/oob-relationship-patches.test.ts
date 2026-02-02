import { removeRelationship, removeAllRelationships } from '../../src/patches/oob-relationship-patches';
import { patchObject } from '../utils';

describe('removeRelationshipsToService', () => {
  test('removes relationship', () => {
    const obj = {
      'AWS::Service1::Resource1': {
        relationships: {
          Property1: [
            {
              cloudformationType: 'AWS::Service1::Resource2',
              propertyPath: '/properties/Property1',
            },
          ],
          Property2: [
            {
              cloudformationType: 'AWS::Service2::Resource1',
              propertyPath: '/properties/prop1',
            },
            {
              cloudformationType: 'AWS::Service2::Resource2',
              propertyPath: '/properties/prop1',
            },
          ],
        },
      },
    };

    const patchedObj = patchObject(
      obj,
      removeRelationship({
        resource: 'AWS::Service1::Resource1',
        propertyPath: 'Property2',
        targetResource: 'AWS::Service2::Resource1',
        targetProperty: '/properties/prop1',
        reason: 'test',
      }),
    );

    expect(patchedObj).toEqual({
      'AWS::Service1::Resource1': {
        relationships: {
          Property1: [
            {
              cloudformationType: 'AWS::Service1::Resource2',
              propertyPath: '/properties/Property1',
            },
          ],
          Property2: [
            {
              cloudformationType: 'AWS::Service2::Resource2',
              propertyPath: '/properties/prop1',
            },
          ],
        },
      },
    });
  });

  test('does not remove other relationship', () => {
    const obj = {
      'AWS::Service3::Resource1': {
        relationships: {
          Property1: [
            {
              cloudformationType: 'AWS::Service2::Resource1',
              propertyPath: '/properties/Property1',
            },
          ],
        },
      },
    };

    const patchedObj = patchObject(
      obj,
      removeRelationship({
        resource: 'AWS::Service1::Resource1',
        propertyPath: 'Property2',
        targetResource: 'AWS::Service1::Resource2',
        targetProperty: '/properties/prop1',
        reason: 'test',
      }),
    );

    expect(patchedObj).toEqual(obj);
  });

  test('does not break when relationship keys contain slashes', () => {
    const obj = {
      'X::ServiceA::Thing': {
        relationships: {
          'Config/Sub/Path': [{ cloudformationType: 'X::ServiceB::Resource', propertyPath: '/properties/Arn' }],
          'Other/Config': [{ cloudformationType: 'X::ServiceC::Resource', propertyPath: '/properties/Arn' }],
        },
      },
    };

    const patchedObj = patchObject(
      obj,
      removeRelationship({
        resource: 'X::ServiceA::Thing',
        propertyPath: 'Config/Sub/Path',
        targetResource: 'X::ServiceB::Resource',
        targetProperty: '/properties/Arn',
        reason: 'breaks on slashes',
      }),
    );

    expect(patchedObj).toEqual({
      'X::ServiceA::Thing': {
        relationships: {
          'Config/Sub/Path': [],
          'Other/Config': [{ cloudformationType: 'X::ServiceC::Resource', propertyPath: '/properties/Arn' }],
        },
      },
    });
  });
});

describe('removeAllRelationships', () => {
  test('removes all relationships from a property', () => {
    const obj = {
      'AWS::CloudWatch::Alarm': {
        relationships: {
          'Dimensions/Value': [
            { cloudformationType: 'AWS::Lambda::Function', propertyPath: '/properties/FunctionName' },
            { cloudformationType: 'AWS::SQS::Queue', propertyPath: '/properties/QueueName' },
            { cloudformationType: 'AWS::SNS::Topic', propertyPath: '/properties/TopicName' },
          ],
          OtherProperty: [{ cloudformationType: 'AWS::IAM::Role', propertyPath: '/properties/Arn' }],
        },
      },
    };

    const patchedObj = patchObject(
      obj,
      removeAllRelationships({
        resource: 'AWS::CloudWatch::Alarm',
        propertyPath: 'Dimensions/Value',
        reason: 'Dimension Value is too generic',
      }),
    );

    expect(patchedObj).toEqual({
      'AWS::CloudWatch::Alarm': {
        relationships: {
          'Dimensions/Value': [],
          OtherProperty: [{ cloudformationType: 'AWS::IAM::Role', propertyPath: '/properties/Arn' }],
        },
      },
    });
  });

  test('does not affect other resources', () => {
    const obj = {
      'AWS::Other::Resource': {
        relationships: {
          'Dimensions/Value': [{ cloudformationType: 'AWS::Lambda::Function', propertyPath: '/properties/Arn' }],
        },
      },
    };

    const patchedObj = patchObject(
      obj,
      removeAllRelationships({
        resource: 'AWS::CloudWatch::Alarm',
        propertyPath: 'Dimensions/Value',
        reason: 'test',
      }),
    );

    expect(patchedObj).toEqual(obj);
  });
});
