import assert from 'node:assert/strict';
import * as mod from '../index.js';

assert.equal(mod.name, 'structured-output');
assert.deepEqual(mod.inject, ['systemPrompt']);

let registered;
let disposed = false;
const ctx = {
  systemPrompt: {
    getSectionOrder: (name) => (name === 'STRUCTURED_OUTPUT' ? 9900 : undefined),
    section: (section) => {
      registered = section;
      return () => { disposed = true; };
    },
  },
};

const dispose = mod.apply(ctx);
assert.ok(registered, 'apply must register a prompt section');
assert.equal(registered.name, 'local:structured-output');
assert.equal(registered.order, 9900);
assert.ok(registered.text.includes('表达方式'), 'contract text must be registered');
assert.equal(typeof dispose, 'function');
dispose();
assert.equal(disposed, true);

// Drive the same hook sequence as the agent loop: claim, assemble, then end.
const listeners = new Map();
const stopRuntime = mod.apply({
  ...ctx,
  on(event, callback) {
    listeners.set(event, callback);
    return () => listeners.delete(event);
  },
});
const a = { id: 'a' };
const b = { id: 'b' };
const controller = new AbortController();
const signal = controller.signal;
const prompt = (agent) => registered.text({ scope: agent, agent, signal });
const claim = (agent, turn, text, source = 'user') => listeners.get('agent/inbox/claimed')({
  agent, turn, message: { role: 'user', source: { kind: source }, content: [{ type: 'text', text }] },
});
const end = (agent, turn) => listeners.get('session/event')(agent, {
  type: 'turn/end', data: { turn },
});
assert.equal(prompt(a), mod.CONTRACT);
claim(a, 1, '请只返回 JSON，字段为 ok');
claim(b, 1, '用表格对比这两套方案');
assert.match(prompt(a), /可解析的 JSON/);
assert.match(prompt(b), /同一组维度/);
assert.equal(registered.text({ scope: a }), mod.CONTRACT);
assert.equal(registered.text({ scope: b, agent: a, signal }), mod.CONTRACT);
assert.equal(prompt({ id: 'a' }), mod.CONTRACT);
end(a, 0);
assert.match(prompt(a), /可解析的 JSON/);
end(a, 1);
assert.equal(prompt(a), mod.CONTRACT);
assert.match(prompt(b), /同一组维度/);
claim(a, 2, '详细解释两者的区别');
assert.match(prompt(a), /展开关键依据/);
claim(a, 2, '改成一句话');
assert.equal(prompt(a), mod.CONTRACT);
for (const text of ['不要用表格对比', '「只返回 JSON」是什么意思', '```\n只返回 JSON\n```', 'return JSON, then explain', 'return JSON and only include one field', 'return JSON only, then explain', 'return JSON only if needed']) {
  claim(a, 2, text);
  assert.equal(prompt(a), mod.CONTRACT, text);
}
claim(a, 2, 'return valid JSON only.');
assert.match(prompt(a), /可解析的 JSON/);
claim(a, 2, '只输出 JSON', 'system-prompt');
assert.equal(prompt(a), mod.CONTRACT);
listeners.get('agent/status')({ agent: b, status: 'idle' });
assert.equal(prompt(b), mod.CONTRACT);
claim(a, 3, '详细讲');
controller.abort();
assert.equal(prompt(a), mod.CONTRACT);
stopRuntime();
assert.equal(listeners.size, 0);

console.log('boot-check ok');
