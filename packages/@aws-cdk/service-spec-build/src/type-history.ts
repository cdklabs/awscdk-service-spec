import { PropertyType } from '@aws-cdk/service-spec';
import HISTORY_FABRICATORS from './history';

/**
 * For a given key and a history of types, returns a new history of types
 *
 * If no change should be made, return the unchanged history.
 */
export type FabricateTypeHistory = (key: string, history: PropertyType[]) => PropertyType[];

/**
 * For a given key and a history of types, returns a new history of types
 *
 * If no change should be made, return the unchanged history.
 */
export const fabricateTypeHistory: FabricateTypeHistory = (key, history) => {
  for (const fabricator of HISTORY_FABRICATORS) {
    history = fabricator(key, history);
  }

  return history;
};
