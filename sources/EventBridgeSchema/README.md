# EventBridge Schema

EventBridge makes available the event schemas by region.
Each event schema is a JSON-formatted text file that defines the properties and their types of a specific event. It also includes metadata values that define the event, such as `x-amazon-events-source` and `x-amazon-events-detail-type`.

## Source

Using a script to fetch all the schemas from the [AWS EventBridge Schema Registry SDK](https://docs.aws.amazon.com/AWSJavaScriptSDK/v3/latest/client/schemas/)

```ts
const script = () => {
  let nextToken: string | undefined;
  const REGISTRY_NAME = 'aws.events';

  do {
    const listSchemasInput = {
      NextToken: nextToken,
      RegistryName: REGISTRY_NAME,
    };

    const listCommand = new ListSchemasCommand(listSchemasInput);
    const listResponse = await client.send(listCommand);
    nextToken = listResponse.NextToken;
    for (const summarySchema of listResponse.Schemas ?? []) {
      const describeCommandInput = {
        RegistryName: REGISTRY_NAME,
        SchemaName: summarySchema.SchemaName,
      };
      const describeCommand = new DescribeSchemaCommand(describeCommandInput);
      const describeResponse = await client.send(describeCommand);
      describeResponse.Content = JSON.parse(describeResponse.Content!);

      await writeForServiceSpec({
        fullSchema: describeResponse,
        schemaName: summarySchema.SchemaName!,
        directory: `${assetsPath}`,
      });
    }
  } while (nextToken != undefined);
};

const writeForServiceSpec = async ({
  fullSchema,
  schemaName,
  directory,
}: {
  fullSchema: DescribeSchemaCommandOutput;
  schemaName: string;
  directory: string;
}) => {
  console.log({ directory, schemaName });
  await ensureDir(`EventBridgeSchema/us-east-1`);
  await writeFile(`EventBridgeSchema/us-east-1/${schemaName}.json`, JSON.stringify(fullSchema, null, 2));
};
```

## Instructions

These schemas are used to generate strongly-typed event functions for AWS CDK resources.
Each schema provides the complete event structure and metadata needed to create type-safe event handlers and filters for EventBridge rules targeting specific event.
