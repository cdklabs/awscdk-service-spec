import { assertSuccess } from '@cdklabs/tskb';
import { Loader, LoadResult, LoadSourceOptions } from './loader';
import { AwsPartitionsSource } from '../types';

/**
 * Load AWS partitions data from a partitions.json file
 *
 * @param filePath Path to the partitions.json file
 * @param options Loading options (validation, debug)
 * @returns The loaded and validated partitions data
 */
export async function loadAwsPartitions(
  filePath: string,
  options: LoadSourceOptions = {},
): Promise<LoadResult<AwsPartitionsSource>> {
  const loader = await Loader.fromSchemaFile<AwsPartitionsSource>('AwsPartitionsSource.schema.json', {
    mustValidate: options.validate,
  });

  const result = await loader.loadFile(filePath);
  assertSuccess(result);
  return result;
}
