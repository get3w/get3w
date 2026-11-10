/** Structural diagnostics only: never retain prompts, tool programs or values. */
export function toolSchemaDiagnostics(body) {
  try {
    const payload = JSON.parse(body.toString());
    return (payload.tools ?? []).filter(tool => tool.function?.name === 'execute').map(tool => ({
      name: 'execute',
      type: tool.function.parameters?.type ?? null,
      properties: Object.keys(tool.function.parameters?.properties ?? {}),
      required: tool.function.parameters?.required ?? [],
    }));
  } catch { return []; }
}

export function toolCallDiagnostics() {
  const calls = new Map();
  return {
    observe(event) {
      for (const choice of event?.choices ?? []) {
        for (const call of choice.delta?.tool_calls ?? []) {
          const key = `${choice.index ?? 0}:${call.index ?? 0}`;
          const row = calls.get(key) ?? { name: '', arguments: '', fields: new Set(), functionFields: new Set() };
          Object.keys(call).forEach(field => row.fields.add(field));
          Object.keys(call.function ?? {}).forEach(field => row.functionFields.add(field));
          row.name += call.function?.name ?? '';
          row.arguments += call.function?.arguments ?? '';
          calls.set(key, row);
        }
      }
    },
    summary() {
      return [...calls.values()].filter(row => row.name).map(row => {
        let keys = [], validJson = false;
        try {
          const parsed = JSON.parse(row.arguments);
          validJson = true;
          if (parsed && typeof parsed === 'object') keys = Object.keys(parsed);
        } catch {}
        return { name: row.name, argumentBytes: Buffer.byteLength(row.arguments), validJson, keys, fields: [...row.fields], functionFields: [...row.functionFields] };
      });
    },
  };
}
