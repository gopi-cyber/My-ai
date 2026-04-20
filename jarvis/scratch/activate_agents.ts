
async function activateAllAgents() {
  console.log("Fetching specialists...");
  const resp = await fetch('http://localhost:3142/api/agents/specialists');
  if (!resp.ok) {
    throw new Error(`Failed to fetch specialists: ${resp.status}`);
  }
  const data = await resp.json();
  // The structure seems to be { specialists: [ {id: "..."}, ... ] }
  const specialists = data.specialists;
  const ids = specialists.map(s => s.id);
  
  console.log(`Found ${ids.length} specialists: ${ids.join(', ')}. Spawning...`);

  for (const id of ids) {
    console.log(`Spawning ${id}...`);
    try {
      const spawnResp = await fetch('http://localhost:3142/api/agents', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ specialist: id })
      });
      if (!spawnResp.ok) {
        const errText = await spawnResp.text();
        console.error(`Failed to spawn ${id}: ${spawnResp.status} - ${errText}`);
        continue;
      }
      const result = await spawnResp.json();
      console.log(`✓ Spawned ${id} (ID: ${result.agent_id})`);
    } catch (err) {
      console.error(`Error spawning ${id}:`, err.message);
    }
  }
}

activateAllAgents();
