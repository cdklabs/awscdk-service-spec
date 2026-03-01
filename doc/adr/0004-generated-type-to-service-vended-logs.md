# 4. Generated type to service Vended Logs

Date: 2025-12-15

## Status

Accepted

## Context

Support for configuring Vended Logs in resources that support it was added as a part of the release of Mixins in the [aws cdk repository](https://github.com/aws/aws-cdk). A part of the effort to get this mixin to implement Vended Logs supported was getting information about which resources supported Vended Logs, what log types did they support, what destination resources did each log type for each resource support, and what version of permissions did each log type support. This necessitated collecting information from a new source and adding an additional optional property to resources in the database that could be populated with information from that source. This document describes decisions that were made about the type related to Vended Logs that has been added to resources. 

## Decision

We will implement an optional property on Cloudformation Resources used by CDK which stores information we got from a new data source that comes from Ingestion Hub. Ingestion Hub manages which AWS services have onboarded onto Vended Logs and maintains information relevant to configuring Vended Logs for those services. The new property will be called `vendedLogs` and have the following structure: 
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
    readonly outputFormats?: string[]
}
```
`vendedLogs` is effectively an array of log types for each resource. The `VendedLogs` interface is arranged so that all of the properties directly related to delivery sources and the delivery are nested directly under `VendedLogs`, however anything related to the delivery destinations is nested under `DeliveryDestinations`. 
This mirrors what we see coming from the Vended Logs data source where information about how a resource's logs are set up are grouped by log type. Each log type knows what destinations it can deliver to, what `RecordFields` (`mandatoryFields` and `optionalFields`) are involved in the delivery, and what permissions version is used. Each destination knows what output formats it can use, which can be dictated by the log type (certain logTypes exclude some `outputFormats` from certain destinations).
The information that is necessary to setting up a delivery connection with vended logs is the log type and the destination type, permissions version is also important but only to S3 destinations. This is why properties related to those fields are the only ones that are mandatory for each resource that implements `vendedLogs` to have. 
`OutputFormats` and `RecordFields` are not required to set up vendedLogs and not every destination or log type has them. `RecordFields` has been split into 2 different arrays to make implementation easier, the `mandatoryFields` and the `optionalFields`.
`RecordFields` are either mandatory or not, we want to know which `RecordFields` are mandatory so we can send them straight to the `CfnDelivery` object that is created in the `VendedLogsMixin` and users don't have the opportunity to accidentally exclude a mandatory field. 

## Consequences

Resources now include an optional `vendedLogs` property which holds information about the logs a resource can vend using the Vended Logs infrastructure. This makes doing things in the `aws-cdk` repo related to Vended Logs like implementing the `Vended Logs Mixin` much easier and removes a lot of the guess work as to what logs and what destinations are supported by each resrouce. 
If in the future we find that `RecordFields` can vary per destination this structure will be somewhat annoying to update - would require at least 3 PRs across `aws-cdk` and the `awscdk-service-spec`. I have not seen evidence that supports `RecordFields` varying per destination now, however there is some evidence in the log source that it could happen in the future.
This 3 PRs to change the structure of `vendedLogs` is a broader consquence of the tight coupling of the implementation of the `Vended Logs Mixin` and the `vendedLogs` property on resources. 
We cannot easily have log types from the same resource share the same information without having it be duplicated across each `VendedLogs` object for that resource. 
