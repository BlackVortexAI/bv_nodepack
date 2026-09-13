import assert from 'node:assert/strict';
import test from 'node:test';
import {readFileSync} from 'node:fs';
import ts from '../ui/node_modules/typescript/lib/typescript.js';

// Ignore callback bodies: their returns do not exit the component, and their
// effects are not part of the component's render-time hook sequence.
function renderNodes(node, visit) {
    if (ts.isFunctionLike(node)) return;
    visit(node);
    ts.forEachChild(node, child => renderNodes(child, visit));
}

function conditionalHookViolations(source, componentName) {
    const file = ts.createSourceFile('editor.tsx', source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
    const component = file.statements.find(node => ts.isFunctionDeclaration(node) && node.name?.text === componentName);
    assert.ok(component?.body, `Component ${componentName} exists`);
    let canHaveReturned = false;
    const violations = [];
    for (const statement of component.body.statements) {
        let returns = false;
        renderNodes(statement, node => {
            if (ts.isReturnStatement(node)) returns = true;
            if (!ts.isCallExpression(node)) return;
            const name = ts.isIdentifier(node.expression) ? node.expression.text
                : ts.isPropertyAccessExpression(node.expression) ? node.expression.name.text : '';
            if (/^use[A-Z]/.test(name) && canHaveReturned) {
                violations.push(`${name} at line ${file.getLineAndCharacterOfPosition(node.getStart(file)).line + 1} can be skipped by a preceding component return`);
            }
        });
        canHaveReturned ||= returns;
    }
    return violations;
}

test('hook guard catches closed-to-open hook additions without confusing effect callback returns', () => {
    assert.equal(conditionalHookViolations('function Editor({open}) { useState(null); if (!open) return null; useEffect(() => {}); return null; }', 'Editor').length, 1);
    assert.deepEqual(conditionalHookViolations('function Editor({open}) { useEffect(() => { if (!open) return; }); if (!open) return null; return null; }', 'Editor'), []);
});

for (const component of ['RegionalEditor', 'QuickPromptEditor', 'PromptAssistAction', 'PromptAssistPanel']) {
    test(`${component} keeps its hook sequence when opening, closing and reopening`, () => {
        const path = component.startsWith('PromptAssist') ? 'PromptAssist' : component;
        const source = readFileSync(new URL(`../ui/src/regional/${path}.tsx`, import.meta.url), 'utf8');
        assert.deepEqual(conditionalHookViolations(source, component), [], 'Conditional hooks can cause React #310 on open');
    });
}
