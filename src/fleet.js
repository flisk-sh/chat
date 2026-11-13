// Chat's view of fleet.flisk.si: a trusted site that signs users in itself and calls fleet for them.
// One computer (pod) per task: start on the first action, stop at the end, unless the task shared the running app (share.js).
export function fleetClient(env, login, fetchImpl = fetch) {
  const base = (env.FLEET_URL || 'https://fleet.flisk.si').replace(/\/$/, '');
  const call = async (method, path, body) => {
    const res = await fetchImpl(`${base}${path}`, {
      method,
      headers: { authorization: `Bearer ${env.FLEET_SERVICE_SECRET}`, 'x-on-behalf-of': login, 'content-type': 'application/json', 'user-agent': 'flisk-chat' },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    const data = await res.json().catch(() => ({}));
    return { status: res.status, data, error: res.status >= 400 ? data.error || `fleet answered ${res.status}` : null };
  };
  return {
    connections: async () => (await call('GET', '/v1/connections')).data.connections || {},
    connect: async (provider, key) => call('PUT', `/v1/connections/${encodeURIComponent(provider)}`, { key }),
    // order: provider ids to use, in this order; empty means fleet picks the cheapest of the connected ones.
    // public: a computer that can later give a port a public URL (share.js). Fleet starts a normal one where that is not possible.
    start: async (order = []) => call('POST', '/v1/pods', { cpu: 2, ram: 4, public: true, ...(order.length ? { order } : {}) }),
    share: async (id, port, startup) => call('POST', `/v1/pods/${encodeURIComponent(id)}/public`, { port, startup }),
    run: async (id, command) => call('POST', `/v1/pods/${encodeURIComponent(id)}/run`, { command, timeout: 60 }),
    write: async (id, path, content) => call('PUT', `/v1/pods/${encodeURIComponent(id)}/files`, { path, content }),
    read: async (id, path) => call('GET', `/v1/pods/${encodeURIComponent(id)}/files?path=${encodeURIComponent(path)}`),
    stop: async (id) => call('DELETE', `/v1/pods/${encodeURIComponent(id)}`),
  };
}
