import { expr, Expression, Module, stmt, TypeScriptRenderer } from '../src';

test('splat', () => {
  const ex = expr.splat(expr.ident('input'));

  expect(renderExpr(ex)).toMatch('...input');
});

function renderExpr(ex: Expression) {
  const scope = new Module('typewriter.test');
  scope.addInitialization(stmt.expr(ex));

  const renderer = new TypeScriptRenderer();
  return renderer.render(scope);
}
