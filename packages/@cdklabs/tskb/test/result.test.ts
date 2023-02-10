import { errorMessage, failure, isFailure } from '../src/result';

test('produce a failure', () => {
  const f = failure('oops');
  expect(isFailure(f)).toBeTruthy();
  expect(isFailure(f) ? errorMessage(f) : undefined).toEqual('oops');
});

test('nest a failure', () => {
  const deepFail = failure.in('something');

  const f = deepFail('oops');
  expect(isFailure(f) ? errorMessage(f) : undefined).toEqual('something: oops');

  const deeperFail = deepFail.in('elsewhere');
  const g = deeperFail('oops');
  expect(isFailure(g) ? errorMessage(g) : undefined).toEqual('something: elsewhere: oops');
});