import { Reason, fp } from '../../src/patching';
import { patchObject } from '../utils';
describe('functional patches', () => {
  test('patch at pointer', () => {
    const obj = {
      type: 'boolean',
      props: {
        one: 'foobar',
      },
    };

    const patcher = fp.patchAt<Partial<(typeof obj)['props']>>('/props', Reason.other('test'), (props) => {
      props.one = props.one?.toUpperCase();
      return props;
    });

    const patchedObj = patchObject(obj, patcher);

    expect(patchedObj).toEqual({
      type: 'boolean',
      props: {
        one: 'FOOBAR',
      },
    });
  });

  test('patch at document root', () => {
    const obj = {
      type: 'boolean',
      pattern: 'true|false',
    };

    const patcher = fp.patchDocument<Partial<typeof obj>>(Reason.other('test'), (doc) => {
      delete doc.pattern;
      return doc;
    });

    const patchedObj = patchObject(obj, patcher);

    expect(patchedObj).toEqual({
      type: 'boolean',
    });
  });
});
