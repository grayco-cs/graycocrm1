// netlify/functions/_lib/ai.js — patch AUTAI: one small Claude caller for the automations (weekly update, voice notes,
// COI / W-9). The same call bid-inbox.js makes: the Anthropic Messages API with ANTHROPIC_API_KEY (read from the
// environment at call time — never in a file), a tool for the structured answer (tool_choice "auto" + an instruction:
// the current models refuse a forced tool choice), the server-side refusal fallback, and a hard time limit.
// Env: ANTHROPIC_API_KEY; optional AUT_AI_MODEL (default claude-opus-5-5), AUT_AI_TIMEOUT_MS, AUT_AI_NO_FALLBACK=1.
'use strict';

function env(k){ return String(process.env[k] == null ? '' : process.env[k]).trim(); }
function s(v){ return v == null ? '' : String(v).trim(); }
function parseLoose(text){
  const t = s(text).replace(/^```(?:json)?/i, '').replace(/```$/, '');
  try { return JSON.parse(t); } catch (e) {}
  const i = t.indexOf('{'), j = t.lastIndexOf('}');
  if (i >= 0 && j > i) { try { return JSON.parse(t.slice(i, j + 1)); } catch (e) {} }
  return null;
}
function ready(){ return !!env('ANTHROPIC_API_KEY'); }

/* content: the user message's content blocks; tool: { name, description, input_schema } (optional)
   → { ok, out (the tool input or the JSON in the text), text, why } */
async function ask(opts){
  const key = env('ANTHROPIC_API_KEY');
  if (!key) return { ok: false, why: 'ANTHROPIC_API_KEY is not set on Netlify' };
  const body = { model: opts.model || env('AUT_AI_MODEL') || 'claude-opus-5-5', max_tokens: opts.maxTokens || 4000,
    messages: [{ role: 'user', content: opts.content }] };
  if (opts.system) body.system = opts.system;
  if (opts.tool) { body.tools = [opts.tool]; body.tool_choice = { type: 'auto' }; }
  if (opts.effort !== false) body.output_config = { effort: opts.effort || 'low' };
  if (env('AUT_AI_NO_FALLBACK') !== '1') body.fallbacks = 'default';
  const ms = parseInt(env('AUT_AI_TIMEOUT_MS') || String(opts.timeoutMs || 24000), 10);
  async function once(){
    const ctl = new AbortController(); const timer = setTimeout(function(){ ctl.abort(); }, ms);
    try {
      const headers = { 'Content-Type': 'application/json', 'x-api-key': key, 'anthropic-version': '2023-06-01' };
      if (body.fallbacks) headers['anthropic-beta'] = 'server-side-fallback-2026-07-01';
      const r = await fetch('https://api.anthropic.com/v1/messages', { method: 'POST', signal: ctl.signal, headers: headers, body: JSON.stringify(body) });
      const j = await r.json().catch(function(){ return null; });
      return { status: r.status, ok: r.ok, j: j };
    } finally { clearTimeout(timer); }
  }
  try {
    let r = await once();
    if (r.status === 400 && /fallback/i.test(JSON.stringify(r.j || ''))) { delete body.fallbacks; r = await once(); }
    if (r.status === 400 && /effort|output_config/i.test(JSON.stringify(r.j || ''))) { delete body.output_config; r = await once(); }
    if (!r.ok || !r.j) return { ok: false, why: 'AI answered ' + r.status };
    if (r.j.stop_reason === 'refusal') return { ok: false, why: 'AI declined to read it' };
    const blocks = Array.isArray(r.j.content) ? r.j.content : [];
    const text = blocks.filter(function(b){ return b && b.type === 'text'; }).map(function(b){ return b.text; }).join('\n');
    let out = null;
    if (opts.tool) { const tu = blocks.find(function(b){ return b && b.type === 'tool_use' && b.name === opts.tool.name; }); out = tu && tu.input; }
    if (!out && opts.json !== false) out = parseLoose(text);
    return { ok: true, out: out, text: text, model: body.model };
  } catch (e) {
    return { ok: false, why: e && e.name === 'AbortError' ? 'AI timed out' : 'AI unreachable' };
  }
}

module.exports = { ask: ask, ready: ready, parseLoose: parseLoose };
