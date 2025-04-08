# CloudFormation Resource Specification

The AWS CloudFormation resource specification is a JSON-formatted text file that defines the resources and properties that AWS CloudFormation supports.

> [!NOTE]
> This spec is not being updated anymore. It has been frozen in place to record the types
> as they were at a particular point in time. This allows us to detect incompatible changes
> to the types between the legcy spec and the registry schema, without introducing another
> history-keeping mechanism just yet.

## Source

<https://docs.aws.amazon.com/AWSCloudFormation/latest/UserGuide/cfn-resource-specification.html>

## Instructions

This is the legacy format to describe CloudFormation resources.
We use this data source to supplement information not yet available in the [CloudFormation Schema](../CloudFormationSchema)

# Patching

Sometimes it is necessary to patch in certain things directly into this source as opposed to others.
This form of patching should only be used for the legacy schema. To patch the modern version, please refer
to the instructions in [that README.md](https://github.com/cdklabs/awscdk-service-spec/blob/main/packages/%40aws-cdk/aws-service-spec/README.md) file.

In cases where you must use the legacy patch, the following steps should be taken:
1. Create a new patch file in `us-east-1/000_cloudformation`. Make sure the file is titled with some number (the order it will be processed)
followed by a brief description, and suffixed with `_patch.json`.
2. Following the format of existing patches, format the JSON to point to the resource you would like to alter, followed by "patch".
Provide a "description" of what the patch is for, and "operations" that you wish to perform. See below for an example:
```json
{
    "PropertyTypes": {
        "AWS::Service::Resource": {
            "patch": {
                "description": "This is a resource patch",
                "operations": [
                    {
                        "op": "add",
                        "path": "/Path/To/NewThing",
                        "value": {
                            "Documentation": "...",
                            "Properties": {
                                "X": "...",
                                "Y": "...",
                                "Z": "..."
                            }
                        }
                    },
                    {
                        "op": "remove",
                        "path": "Path/To/Another.Attribute"
                    },
                    {
                        "op": "replace",
                        "path": "Path/To/Yet.Another",
                        "value": "List"
                    }
                ]
            }
        }
    }
}
```

Keep in mind that, if you are still not seeing your patch changes reflected, there may already be another patch
in place, either here or in the modern patching, that is preventing it from being applied correctly.
