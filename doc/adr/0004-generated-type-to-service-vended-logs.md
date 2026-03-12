# 4. Generated type to service Vended Logs

Date: 2025-12-15

## Status

Accepted

## Context

Support for configuring Vended Logs in resources that support it was added as a part of the release of Mixins in the [aws cdk repository](https://github.com/aws/aws-cdk). A part of the effort to get this mixin to implement Vended Logs supported was getting information about which resources supported Vended Logs, what log types did they support, what destination resources did each log type for each resource support, and what version of permissions did each log type support. This necessitated collecting information from a new source and adding an additional optional property to resources in the database that could be populated with information from that source. This document describes decisions that were made about the type related to Vended Logs that has been added to resources. 

## Decision

We will implement an optional property on Cloudformation Resources used by CDK which stores information we got from a new data source that comes from Ingestion Hub. Ingestion Hub manages which AWS services have onboarded onto [Vended Logs](https://docs.aws.amazon.com/AmazonCloudWatch/latest/logs/AWS-logs-and-resource-policy.html) and maintains information relevant to configuring Vended Logs for those services. The new property will be called `vendedLogs` and have the following structure: 
```
interface Resource extends Entity {
    ...
    vendedLogs?: VendedLogs[];
    ...
}

...

export interface VendedLogs {
    readonly permissionsVersion: string;
    readonly logType: string;
    readonly destinations: DeliveryDestination[];
    mandatoryFields?: string[];
    optionalFields?: string[];
}

export DeliveryDestinations {
    readonly destinationType: string;
    readonly outputFormats?: string[];
}
```
`vendedLogs` is an array of log types for each resource. It is organized so information specific to each logType of each resource lives under the `VendedLogs` interface. Information specific to each destination that a log type can deliver to is housed under the `DeliveryDestinations` interface. 

### VendedLogs Interface

The minimum information needed to set up a vended logs delivery is `logType` and `destinationType`. `permissionsVersion` is also required but only for S3 destinations and it does not vary based on destination. These are the only mandatory properties.

`mandatoryFields` and `optionalFields` together represent `RecordFields`. They are split so that `mandatoryFields` can be sent directly to the `CfnDelivery` object in the `VendedLogsMixin` — this prevents users from accidentally omitting a required field. Both are optional on the interface because not every log type has them.

### DeliveryDestinations

Destination-related information is separated into its own `DeliveryDestinations` interface because a single log type can deliver to multiple destinations, and each destination has its own properties. Specifically, `outputFormats` vary per destination AND per log type — certain log types exclude some output formats from certain destinations — so `outputFormats` must live on the destination, not the log type.

We rejected having a unique interface per logType-destination pair. That would require a unique identifier for each pair and would be harder to consume in aws-cdk.

## Consequences

Resources now include an optional `vendedLogs` property, removing guesswork about which resources support Vended Logs and what log types, destinations, and fields they require. This directly enables the `VendedLogsMixin` in aws-cdk.

Known trade-offs:
- If `RecordFields` ever vary per destination (there is some evidence this could happen), the structure would need updating across at least 3 PRs in aws-cdk and awscdk-service-spec — a consequence of tight coupling between the `VendedLogsMixin` and the `vendedLogs` property shape.
- Log types on the same resource that share information will have it duplicated across each `VendedLogs` entry.
