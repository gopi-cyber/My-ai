
async function checkSystem() {
  const endpoints = [
    '/api/health',
    '/api/agents/specialists',
    '/api/agents',
    '/api/awareness/status',
    '/api/sites/projects',
    '/api/vault/commitments?status=active'
  ];

  for (const endpoint of endpoints) {
    console.log(`\n--- Fetching ${endpoint} ---`);
    try {
      const resp = await fetch(`http://localhost:3142${endpoint}`);
      if (!resp.ok) {
        console.error(`Error: ${resp.status} ${resp.statusText}`);
        const text = await resp.text();
        console.error(text);
        continue;
      }
      const data = await resp.json();
      console.log(JSON.stringify(data, null, 2));
    } catch (err) {
      console.error(`Fetch failed for ${endpoint}:`, err.message);
    }
  }
}

checkSystem();
