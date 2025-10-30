import { AnonymousInterfaceImplementation, expr, Expression, Module, stmt, TypeScriptRenderer } from '../src';

test('object literal', () => {
  const ex = expr.object({
    a: expr.lit(1),
    b: expr.lit(2),
  });

  // eslint-disable-next-line prettier/prettier
  expect(renderExpr(ex)).toMatch([
    '{',
    '  a: 1,',
    '  b: 2',
    '}',
  ].join('\n'));
});

test('anonymous interface implementation', () => {
  const ex = new AnonymousInterfaceImplementation({
    a: expr.lit(1),
    b: expr.lit(2),
  });

  // eslint-disable-next-line prettier/prettier
  expect(renderExpr(ex)).toMatch([
    '{',
    '  a: 1,',
    '  b: 2',
    '}',
  ].join('\n'));
});


test('splat', () => {
  const ex = expr.splat(expr.ident('input'));

  expect(renderExpr(ex)).toMatch('...input');
});

function renderExpr(ex: Expression) {
  const scope = new Module('typewriter.test');
  scope.addInitialization(stmt.expr(ex));

  const renderer = new TypeScriptRenderer();
  let ret = renderer.render(scope);

  // Disregard eslint directives
  if (ret.startsWith('/* eslint-disable')) {
    ret = ret.split('\n').slice(1).join('\n');
  }
  // Remove trailing ;
  if (ret.endsWith(';')) {
    ret = ret.slice(0, -1);
  }
  return ret;
}
