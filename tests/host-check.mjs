// Opt-in integration check against an installed DSH archive, without starting
// its application, loading the user's profile, or calling any model.
// Run with Electron's Node runtime and DSH_APP_ASAR pointing at app.asar.
import assert from 'node:assert/strict';
import { pathToFileURL } from 'node:url';
import { resolve } from 'node:path';
import { apply, CONTRACT } from '../index.js';

if (!process.env.DSH_APP_ASAR) throw new Error('DSH_APP_ASAR must point to the installed DSH app.asar');
const base = pathToFileURL(resolve(process.env.DSH_APP_ASAR) + '/dsh/node_modules/@deepseek-ai/').href;
const { Context } = await import(base + 'cordis/lib/index.js');
const { SystemPrompt, renderPrompt } = await import(base + 'dsh-system-prompt/lib/index.js');
const { createScope } = await import(base + 'dsh-scope/lib/index.js');
const ctx = new Context();
new SystemPrompt(ctx, {});
try {
  const service = ctx.reflect.get('systemPrompt');
  assert.ok(service, 'real DSH prompt service must be ready');
  service.variable('test_value', () => 'unchanged-value');
  service.section({ name: 'test:host-rule', order: 100, text: 'host-rule {{test_value}}' });
  service.context({ name: 'test:runtime', order: 1, text: 'runtime-fact', required: true });
  service.tools(() => ({ schemas: [{ name: 'test_tool', description: 'existing tool', parameters: { type: 'object', properties: { value: { type: 'string' } }, required: ['value'], additionalProperties: false } }] }));
  const placement = service.getSectionOrder('STRUCTURED_OUTPUT') ?? 9900;
  service.section({ name: 'test:before', order: placement - 1, text: 'host-before' });
  service.section({ name: 'test:after', order: placement + 1, text: 'host-after' });
  const baseline = await service.assemble();
  const baselineText = renderPrompt(baseline);
  assert.equal(baseline.tools.length, 1);
  assert.equal(baseline.contexts.length, 1);
  assert.equal(baseline.variables.test_value, 'unchanged-value');
  assert.ok(baselineText.includes('host-rule unchanged-value'));
  const dispose = apply({ systemPrompt: service });
  const enabled = await service.assemble();
  const ours = enabled.sections.filter((s) => s.name === 'local:structured-output');
  assert.equal(ours.length, 1);
  assert.equal(ours[0].text, CONTRACT);
  const names = enabled.sections.map((s) => s.name);
  assert.ok(names.indexOf('test:before') < names.indexOf('local:structured-output'));
  assert.ok(names.indexOf('local:structured-output') < names.indexOf('test:after'));
  assert.deepEqual(enabled.sections.filter((s) => s.name !== 'local:structured-output'), baseline.sections);
  assert.deepEqual(enabled.tools, baseline.tools);
  assert.deepEqual(enabled.contexts, baseline.contexts);
  assert.deepEqual(enabled.variables, baseline.variables);
  assert.ok(renderPrompt(enabled).includes(CONTRACT));
  const scope = {};
  const scopeOwner = createScope(ctx, scope);
  const scoped = await service.assemble({ scope });
  assert.equal(scoped.sections.filter((s) => s.name === 'local:structured-output').length, 1);
  const disposeComplete = service.section({ name: 'test:complete', order: 20000, text: 'exact host-owned prompt', complete: true });
  assert.equal(renderPrompt(await service.assemble()), 'exact host-owned prompt');
  disposeComplete();
  dispose();
  assert.equal(renderPrompt(await service.assemble()), baselineText);
  assert.equal(renderPrompt(await service.assemble({ scope })), baselineText);
  // Re-enabling after disposal must not leave duplicate or stale sections.
  const disposeAgain = apply({ systemPrompt: service });
  assert.equal((await service.assemble()).sections.filter((s) => s.name === 'local:structured-output').length, 1);
  disposeAgain();
  assert.equal(renderPrompt(await service.assemble()), baselineText);
  await scopeOwner.dispose();
  const fiber = ctx.plugin({ name: 'structured-output-host-check', inject: ['systemPrompt'], apply });
  while (fiber.inertia !== undefined) await fiber.inertia;
  assert.equal((await service.assemble()).sections.filter((s) => s.name === 'local:structured-output').length, 1);
  await Promise.resolve(fiber.dispose());
  while (fiber.inertia !== undefined) await fiber.inertia;
  assert.equal(renderPrompt(await service.assemble()), baselineText);
  console.log(JSON.stringify({
    pass: true,
    runtime: process.versions.electron ? `Electron ${process.versions.electron}` : process.version,
    scope: 'installed DSH prompt-service integration only; no live profile reload or model generations',
    assertions: ['single contribution', 'host placement', 'existing sections preserved', 'tool schemas preserved', 'contexts preserved', 'variables preserved', 'rendering', 'agent-scope inheritance', 'complete host prompt preserved', 'disposal restores baseline', 're-enable without duplicates', 'real Cordis plugin injection and teardown'],
  }, null, 2));
} finally {
  await ctx.fiber.dispose();
}
