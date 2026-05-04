/**
 * LangBuilder REST Client — list flows, run flows, abort in-flight requests.
 *
 * Stateless functions (URL + key passed per call). The only mutable state
 * is the AbortController for cancelling a running flow.
 */

export interface LangBuilderFlow {
  id: string;
  name: string;
  inputType: 'chat' | 'text';
}

/** Normalise base URL: strip trailing slashes. */
function normalizeUrl(url: string): string {
  return url.replace(/\/+$/, '');
}

let abortController: AbortController | null = null;

/**
 * Detect whether a flow uses ChatInput or TextInput by inspecting its nodes.
 * LangFlow filters inputs by checking if `input_type` is in the vertex ID,
 * so sending "chat" to a TextInput flow silently skips the input → 500.
 */
function detectInputType(flow: Record<string, unknown>): 'chat' | 'text' {
  try {
    const flowData = flow.data as Record<string, unknown> | undefined;
    const nodes = flowData?.nodes as Array<Record<string, unknown>> | undefined;
    if (!Array.isArray(nodes)) return 'chat';

    for (const node of nodes) {
      const id = String(node.id || '').toLowerCase();
      if (id.includes('chatinput')) return 'chat';
      if (id.includes('textinput')) return 'text';
    }
  } catch {
    // Fall through to default
  }
  return 'chat';
}

/**
 * List all flows from a LangBuilder instance.
 */
async function listFlows(url: string, apiKey: string): Promise<LangBuilderFlow[]> {
  const base = normalizeUrl(url);
  const endpoint = `${base}/api/v1/flows/?remove_example_flows=true&components_only=false`;

  const res = await fetch(endpoint, {
    method: 'GET',
    headers: { 'x-api-key': apiKey },
  });

  if (res.status === 401 || res.status === 403) {
    throw new Error('Invalid API key');
  }
  if (!res.ok) {
    throw new Error(`Server error (${res.status})`);
  }

  const data: unknown = await res.json();
  const flows = Array.isArray(data) ? data : [];

  return flows
    .filter((f: Record<string, unknown>) => f.id && f.name)
    .map((f: Record<string, unknown>) => ({
      id: String(f.id),
      name: String(f.name),
      inputType: detectInputType(f),
    }));
}

/**
 * Run a flow and return the output text.
 *
 * Response structure is deeply nested — we walk the object defensively.
 */
async function runFlow(
  url: string,
  apiKey: string,
  flowId: string,
  inputValue: string,
  inputType: 'chat' | 'text' = 'chat',
): Promise<string> {
  const base = normalizeUrl(url);
  const endpoint = `${base}/api/v1/run/${flowId}?stream=false`;

  abortController = new AbortController();

  const requestBody = {
    input_value: inputValue,
    input_type: inputType,
    output_type: 'chat',
  };

  // Detailed logging so we can prove exactly what we send
  const keyPreview = apiKey.length > 6
    ? `${apiKey.slice(0, 3)}...${apiKey.slice(-3)}`
    : '(short)';
  console.log('[LangBuilderClient] Request details:');
  console.log(`  URL: ${endpoint}`);
  console.log(`  x-api-key: ${keyPreview} (${apiKey.length} chars)`);
  console.log(`  Body:`, JSON.stringify(requestBody));

  const res = await fetch(endpoint, {
    method: 'POST',
    headers: {
      'x-api-key': apiKey,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(requestBody),
    signal: abortController.signal,
  });

  abortController = null;

  if (res.status === 401 || res.status === 403) {
    throw new Error('Invalid API key');
  }
  if (res.status === 404) {
    throw new Error('Flow not found');
  }
  if (!res.ok) {
    // Include the server error body so the user can diagnose
    let detail = '';
    try {
      const errBody = await res.json() as Record<string, unknown>;
      detail = String(errBody.detail || errBody.message || JSON.stringify(errBody).slice(0, 300));
    } catch {
      detail = await res.text().catch(() => '');
    }
    throw new Error(`Server error (${res.status}): ${detail}`);
  }

  const data: unknown = await res.json();
  console.debug('[LangBuilderClient] Raw response:', JSON.stringify(data).slice(0, 500));

  // Walk the nested response to extract the output text.
  // Typical path: outputs[0].outputs[0].results.message.text
  const text = extractOutputText(data);
  if (!text) {
    throw new Error('Could not extract output text from flow response');
  }
  return text;
}

/**
 * Abort an in-flight runFlow request.
 */
function abort(): void {
  if (abortController) {
    abortController.abort();
    abortController = null;
  }
}

/**
 * Defensively extract text from the deeply nested LangFlow response.
 */
function extractOutputText(data: unknown): string | null {
  if (!data || typeof data !== 'object') return null;

  const root = data as Record<string, unknown>;

  // Try: outputs[0].outputs[0].results.message.text
  const outputs = root.outputs as unknown[] | undefined;
  if (Array.isArray(outputs)) {
    for (const output of outputs) {
      const o = output as Record<string, unknown>;
      const inner = o.outputs as unknown[] | undefined;
      if (Array.isArray(inner)) {
        for (const item of inner) {
          const i = item as Record<string, unknown>;
          const results = i.results as Record<string, unknown> | undefined;
          if (results) {
            const message = results.message as Record<string, unknown> | undefined;
            if (message?.text && typeof message.text === 'string') {
              return message.text;
            }
          }
          // Fallback: item.message.text
          const msg = i.message as Record<string, unknown> | undefined;
          if (msg?.text && typeof msg.text === 'string') {
            return msg.text;
          }
        }
      }
    }
  }

  // Fallback: top-level result or message
  if (typeof root.result === 'string') return root.result;
  if (typeof root.text === 'string') return root.text;
  const topMsg = root.message as Record<string, unknown> | undefined;
  if (topMsg?.text && typeof topMsg.text === 'string') return topMsg.text;

  return null;
}

/**
 * Fetch a flow definition and inspect all components for credential issues.
 * Logs which components reference API keys and where the bad value lives.
 */
async function diagnoseFlow(
  url: string,
  apiKey: string,
  flowId: string,
): Promise<void> {
  const base = normalizeUrl(url);
  const endpoint = `${base}/api/v1/flows/${flowId}`;

  console.log('[LangBuilderClient] ── FLOW DIAGNOSTIC ──');
  console.log(`  Fetching flow definition: ${endpoint}`);

  try {
    const res = await fetch(endpoint, {
      method: 'GET',
      headers: { 'x-api-key': apiKey },
    });

    if (!res.ok) {
      console.warn(`  Could not fetch flow (${res.status})`);
      return;
    }

    const flow = await res.json() as Record<string, unknown>;
    console.log(`  Flow name: ${flow.name || '(unnamed)'}`);
    console.log(`  Flow user_id: ${flow.user_id || '(none)'}`);

    // Try to resolve user_id to a username
    if (flow.user_id) {
      try {
        const userRes = await fetch(`${base}/api/v1/users/${flow.user_id}`, {
          method: 'GET',
          headers: { 'x-api-key': apiKey },
        });
        if (userRes.ok) {
          const user = await userRes.json() as Record<string, unknown>;
          console.log(`  Flow owner: ${user.username || user.email || '(unknown)'}`);
        } else {
          // Try listing all users (some LangFlow versions support this)
          const usersRes = await fetch(`${base}/api/v1/users/`, {
            method: 'GET',
            headers: { 'x-api-key': apiKey },
          });
          if (usersRes.ok) {
            const users = await usersRes.json() as Array<Record<string, unknown>>;
            const owner = users.find((u) => u.id === flow.user_id);
            if (owner) {
              console.log(`  Flow owner: ${owner.username || owner.email || '(unknown)'}`);
            }
          }
        }
      } catch {
        // User lookup not available — not critical
      }
    }

    const flowData = flow.data as Record<string, unknown> | undefined;
    const nodes = flowData?.nodes as Array<Record<string, unknown>> | undefined;
    if (!Array.isArray(nodes)) {
      console.warn('  No nodes found in flow');
      return;
    }

    console.log(`  Total nodes: ${nodes.length}`);

    // Scan every node's template fields for credential-like values
    const sensitivePatterns = /api.?key|secret|token|password|openai/i;
    const findings: string[] = [];

    for (const node of nodes) {
      const nodeId = String(node.id || '');
      const nodeData = node.data as Record<string, unknown> | undefined;
      const nodeInfo = nodeData?.node as Record<string, unknown> | undefined;
      const displayName = String(nodeInfo?.display_name || nodeData?.type || nodeId);
      const template = nodeInfo?.template as Record<string, unknown> | undefined;

      if (!template) continue;

      for (const [fieldName, fieldDef] of Object.entries(template)) {
        if (!fieldDef || typeof fieldDef !== 'object') continue;
        const field = fieldDef as Record<string, unknown>;

        // Check if this field looks credential-related
        if (!sensitivePatterns.test(fieldName) && !sensitivePatterns.test(String(field.display_name || ''))) continue;

        const value = field.value;
        const hasValue = value !== undefined && value !== null && value !== '';
        const isPassword = field.password === true;
        const loadFromDb = field.load_from_db === true;
        const globalVarName = typeof value === 'string' && value.length > 0 ? value : null;

        const preview = typeof value === 'string' && value.length > 0
          ? `"${value.slice(0, 4)}...${value.slice(-4)}" (${value.length} chars)`
          : String(value);

        findings.push(
          `  [${displayName}] field="${fieldName}" ` +
          `hasValue=${hasValue} password=${isPassword} loadFromDb=${loadFromDb} ` +
          `value=${loadFromDb ? `(global var: ${globalVarName})` : preview}`,
        );
      }
    }

    if (findings.length === 0) {
      console.log('  No credential fields found in any component.');
    } else {
      console.log(`  Credential fields found (${findings.length}):`);
      for (const f of findings) {
        console.log(f);
      }
    }

    console.log('[LangBuilderClient] ── END DIAGNOSTIC ──');
  } catch (err) {
    console.warn('[LangBuilderClient] Diagnostic failed:', err instanceof Error ? err.message : err);
  }
}

export const langBuilderClient = { listFlows, runFlow, abort, diagnoseFlow };
