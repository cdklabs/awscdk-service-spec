# Summary

This directory contains properties that are `{ Fn::GetAtt }`able in CloudFormation, in addition to the
`readOnlyProperties` indicated by the CloudFormation Registry Schema (CloudFormation also calls these "attributes").

All of the properties in this exception list are both configurable as well as retrievable via `GetAtt`; it would not be
correct to classify them as `readOnlyProperties`, hence we have an additional list of attributes that have the same
name as configurable properties.

# Motivation

The CloudFormation Registry Schema is intended as a generic Control Plane protocol, usable by any orchestration engine
(CloudFormation, Terraform, ...); exactly which properties are `GetAtt`able *in addition* to the `readOnlyProperties` is
a CloudFormation-the-orchestrator-specific detail, and hence is not encoded into the Registry Schema files.

That is why we need a separate list for full fidelity.

CloudFormation is currently not accepting new resources where `GetAtt`-able attributes have the same name as properties;
this list is only for backwards compatibility with non-registry resources. It is therefore unlikely to change often, if
ever, so we feel safe committing it here.
