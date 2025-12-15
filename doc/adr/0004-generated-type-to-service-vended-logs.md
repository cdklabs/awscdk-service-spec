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
}

export DeliveryDestinations {
    readonly destinationType: string;
}
```
`vendedLogs` is effectively an array of log types for each resource. Each log type has their own set of destination resources they can deliver to and those destinations share the same version of permissions. Log types are arranged like this because not all of them within the same resource share the same destination resource, most notably, the log type `TRACES` can only deliver to `XRAY` resources and nothing else, while most other log types can delivery to anything but `XRAY`s. 

## Consequences

We cannot easily have log types from the same resource share the same information without having it be duplicated across each `VendedLogs` object for that resource. 
