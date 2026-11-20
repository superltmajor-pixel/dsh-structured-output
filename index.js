/** Stable Loader identity. */
export const name = 'structured-output'

/** Prompt registry; a global mount contributes to every agent scope. */
export const inject = ['systemPrompt']

/** Presentation preferences only; task correctness and completion take priority. */
export const CONTRACT = `表达方式（仅约束给用户的自然语言，不约束工具调用、工具参数、代理间消息、代码、文件正文或机器可读输出）：
1. 遵循上层指令与用户指定的格式、篇幅；正确、必要信息完整和任务完成优先于简短。
2. 简单问题通常用1~3句直接回答，按需展开，不强行列点、加标题或总结。
3. 复杂任务先给有依据的结论，再给必要依据；对比适合时用表格，相关时说明风险和下一步，不强套四段模板。
4. 完整交付当前请求；不为压缩篇幅省略必要步骤、可运行代码、验证结果或待解决问题。缺信息时说明并询问，不臆测或假装执行。
5. 省去重复套话和无关日志，但保留必要的不确定性、限制与风险说明；情绪支持先回应感受，解释深度随需求调整；术语首次出现时补一句白话解释。`

const HINTS = {
  json: '本轮若用户明确要求聊天回复仅含 JSON，最终回复只给可解析的 JSON，遵循指定字段，不加 Markdown 围栏或说明。',
  table: '本轮若用户明确要求用表格，按其指定字段组织；做对比时各项使用同一组维度。',
  detail: '本轮若用户明确要求详细解释，展开关键依据、步骤与必要边界，篇幅服从用户要求。',
}

// Match standalone instructions or instructions at the beginning of a message.
// Inline mentions, code fences, quotations and ambiguous requests go to the model.
const INSTRUCTIONS = {
  json: /^(?:只(?:返回|输出|回复|给出)(?:\s*有效的)?\s*JSON|(?:return|output|respond with)\s+(?:only\s+(?:valid\s+)?JSON|(?:valid\s+)?JSON\s+only))(?=$|[\s，。；：,.!！;:])/iu,
  table: /^(?:用(?:\s*Markdown\s*)?表格(?:对比|比较|展示|列出|呈现|总结|回答|输出)|(?:compare|summarize|present)\s+(?:them\s+|the results\s+)?in a (?:Markdown )?table)(?=$|[\s，。；：,.!！;:]|[\p{Script=Han}])/iu,
  detail: /^(?:详细(?:讲解|解释|说明|讲|展开)|(?:explain|describe)\s+in detail)(?=$|[\s，。；：,.!！;:]|[\p{Script=Han}])/iu,
}

function classify(message) {
  if (message?.role !== 'user' || message.source?.kind !== 'user') return undefined
  const text = message.content?.find?.((block) => block.type === 'text')?.text
  if (typeof text !== 'string') return undefined
  const lead = text.trimStart().replace(/^(?:请\s*|please\s+)/iu, '')
  const json = lead.match(INSTRUCTIONS.json)
  if (json && !/^\s*[,，]?\s*(?:if\b|unless\b|then\b|and\b|or\b|如果|除非|然后|再|或者)/iu.test(lead.slice(json[0].length))) return 'json'
  if (INSTRUCTIONS.table.test(lead)) return 'table'
  if (INSTRUCTIONS.detail.test(lead)) return 'detail'
  return undefined
}

export function apply(ctx) {
  const order = ctx.systemPrompt.getSectionOrder?.('STRUCTURED_OUTPUT') ?? 9900
  if (typeof ctx.on !== 'function') {
    return ctx.systemPrompt.section({ name: 'local:structured-output', order, text: CONTRACT })
  }

  // DSH claims inbox messages before assembling the prompt. pre-step runs after
  // assembly. DSH uses the same Agent object as the assembly's scope key.
  const active = new Map()
  const disposeSection = ctx.systemPrompt.section({
    name: 'local:structured-output',
    order,
    text: ({ scope, agent, signal }) => {
      const entry = scope && scope === agent && signal && !signal.aborted ? active.get(agent.id) : undefined
      return entry?.agent === agent && entry?.kind ? `${CONTRACT}\n${HINTS[entry.kind]}` : CONTRACT
    },
  })
  const offClaimed = ctx.on('agent/inbox/claimed', ({ agent, message, turn }) => {
    const kind = classify(message)
    if (kind) active.set(agent.id, { agent, turn, kind })
    else if (active.get(agent.id)?.agent === agent) active.delete(agent.id)
  })
  const offTurn = ctx.on('session/event', (session, event) => {
    if (event.type === 'turn/end' && active.get(session.id)?.turn === event.data.turn) active.delete(session.id)
  })
  const offStatus = ctx.on('agent/status', ({ agent, status }) => {
    if (status === 'idle' && active.get(agent.id)?.agent === agent) active.delete(agent.id)
  })
  return () => {
    offClaimed()
    offTurn()
    offStatus()
    active.clear()
    disposeSection()
  }
}
