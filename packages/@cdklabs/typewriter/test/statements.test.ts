import { expr, Module, stmt, Statement, TypeScriptRenderer } from '../src';

test('if statement', () => {
  const s = stmt.if_(expr.ident('condition')).then(stmt.expr(expr.builtInFn('console.log', expr.lit('true'))));

  expect(renderStmt(s)).toMatchInlineSnapshot(`"if (condition) console.log(\"true\");"`);
});

test('if-else statement', () => {
  const s = stmt
    .if_(expr.ident('condition'))
    .then(stmt.expr(expr.builtInFn('console.log', expr.lit('true'))))
    .else(stmt.expr(expr.builtInFn('console.log', expr.lit('false'))));

  expect(renderStmt(s)).toMatchInlineSnapshot(`"if (condition) console.log("true"); else console.log("false");"`);
});

test('if-else with block statements', () => {
  const s = stmt
    .if_(expr.binOp(expr.ident('x'), '>', expr.lit(0)))
    .then(stmt.block(stmt.constVar(expr.ident('result'), expr.lit('positive')), stmt.ret(expr.ident('result'))))
    .else(stmt.block(stmt.ret(expr.lit('non-positive'))));

  expect(renderStmt(s)).toMatchInlineSnapshot(`
    "if ((x > 0)) {
      const result = "positive";
      return result;
    } else {
      return "non-positive";
    }"
  `);
});

test('directCode statement builder', () => {
  const s = stmt.directCode('console.log("hello")');

  expect(renderStmt(s)).toMatchInlineSnapshot(`"console.log("hello");"`);
});

function renderStmt(s: Statement) {
  const scope = new Module('typewriter.test');
  scope.addInitialization(s);

  const renderer = new TypeScriptRenderer();
  let ret = renderer.render(scope);

  // Disregard eslint directives
  if (ret.startsWith('/* eslint-disable')) {
    ret = ret.split('\n').slice(1).join('\n');
  }
  return ret.trim();
}
