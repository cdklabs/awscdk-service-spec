import { ICommentable } from './commentable';
import { EmptyStatement, Statement } from '../statements';

export * as expr from '../expressions/builder';
export * as stmt from '../statements/builder';

export function commentOn<T extends ICommentable>(x: T, ...comments: string[]): T {
  x.withComments(...comments);
  return x;
}

export function comment(...comments: string[]): Statement {
  return new EmptyStatement().withComments(...comments);
}
