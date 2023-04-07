# CloudWatch Console Service Directory

This source of AWS metrics is kindly provided to us by the CloudWatch Explorer team (and used in their console).

## Source

The source file is generated using the `update-service-directory.sh` script.

## Instructions

Only `metricTemplates` are currently used.

The CW Model is certainly very exhaustive, but it's not complete.
We currently have metrics methods we would lose if we were to switch over completely.

### Backwards compatibility of default statistics

Since the CloudWatch Explorer team uses these metrics as templates, they are free to change them at any time.
For example, when they decide that a `defaultStatistic` of `Average` should have been `Sum`.
On the other hand, we have a fixed statistic contract.
Once a metric object emits under a particular statistic, we can never change it or we will break downstream users.
