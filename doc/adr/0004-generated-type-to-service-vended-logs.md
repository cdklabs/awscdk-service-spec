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
`vendedLogs` is effectively an array of log types for each resource. The `VendedLogs` interface is arranged so that all of the properties directly related to delivery sources and the delivery are nested directly under `VendedLogs`, however anything related to the delivery destinations is nested under `DeliveryDestinations`. This follows the pattern of how vended logs is implemented more generally, where the delivery and the delivery source are closely related and the delivery destination is necessary to set up the delivery but otherwise is not as closely linked to the delivery as the source is. 
The information that is necessary to setting up a delivery connection with vended logs is the log type and the destination type, permissions version is also important but only to S3 destinations. This is why properties related to those fields are the only ones that are mandatory for each resource that implements `vendedLogs` to have. 
`OutputFormats` and `RecordFields` are not required to set up vendedLogs and not every destination or logSource has them. Supported `outputFormats` are different for each destination and certain logTypes exclude some `outputFormats` from certain destinations. `RecordFields` has been split into 2 different arrays to make implementation easier, the `mandatoryFields` and the `optionalFields`.
`RecordFields` are either mandatory or not, we want to know which `RecordFields` are mandatory so we can send them straight to the `CfnDelivery` object that is created in the `VendedLogsMixin` and users don't have the opportunity to accidentally exclude a mandatory field. 

## Consequences

We cannot easily have log types from the same resource share the same information without having it be duplicated across each `VendedLogs` object for that resource. 
