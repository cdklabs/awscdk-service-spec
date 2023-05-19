import { PropertyType } from '@aws-cdk/service-spec';
import TYPE_HISTORY_MAKERS from './history';

/**
 * For a given key and a history of types, returns a new history of types
 *
 * If no change should be made, return the unchanged history.
 */
export type TypeHistoryMaker = (key: string, history: PropertyType[]) => PropertyType[];

/**
 * For a given key and a history of types, returns a new history of types
 *
 * If no change should be made, return the unchanged history.
 */
export const makeTypeHistory: TypeHistoryMaker = (key, history) => {
  for (const maker of TYPE_HISTORY_MAKERS) {
    history = maker(key, history);
  }

  return history;
};
