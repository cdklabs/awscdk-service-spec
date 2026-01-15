import {
  SchemasClient, ListSchemasCommand, DescribeSchemaCommand,
} from "@aws-sdk/client-schemas";
import pkg from 'fs-extra';
const { ensureDir, writeFile } = pkg;



const downloadEventBridgeSchema = async () => {
  const [destination] = process.argv.slice(2);
  const REGISTRY_NAME = "aws.events";

  const region = "us-east-1"
  const config = { region }
  const client = new SchemasClient(config)

  let nextToken: string | undefined;

  await ensureDir(destination)

  do {
    const listSchemasInput = {
      NextToken: nextToken,
      RegistryName: REGISTRY_NAME,
    };
    const listCommand = new ListSchemasCommand(listSchemasInput)
    const listResponse = await client.send(listCommand);
    nextToken = listResponse.NextToken
    for (const summarySchema of listResponse.Schemas ?? []) {
      const describeCommandInput = {
        RegistryName: REGISTRY_NAME,
        SchemaName: summarySchema.SchemaName,
      }
      const describeCommand = new DescribeSchemaCommand(describeCommandInput)
      const describeResponse = await client.send(describeCommand)

      describeResponse.Content = JSON.parse(describeResponse.Content!);


      await ensureDir(`${destination}/${region}`)
      await writeFile(`${destination}/${region}/${summarySchema.SchemaName}.json`, JSON.stringify(describeResponse, null, 2))

    }
  } while (nextToken != undefined)
};



downloadEventBridgeSchema()
