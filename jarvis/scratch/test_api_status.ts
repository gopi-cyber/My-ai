
// scratch/test_api_status.ts
const BASE_URL = 'http://localhost:3142';

async function testAwareness() {
  console.log('Testing Awareness API...');
  try {
    const res = await fetch(`${BASE_URL}/api/awareness/status`);
    const data = await res.json();
    console.log('Awareness Status:', JSON.stringify(data, null, 2));
  } catch (err) {
    console.error('Awareness API failed:', err);
  }
}

async function testSiteBuilder() {
  console.log('\nTesting Site Builder projects...');
  try {
    const res = await fetch(`${BASE_URL}/api/sites/projects`);
    const data = await res.json();
    console.log('Site Builder Projects:', JSON.stringify(data, null, 2));
  } catch (err) {
    console.error('Site Builder API failed:', err);
  }
}

async function testAgents() {
  console.log('\nTesting Agents...');
  try {
    const res = await fetch(`${BASE_URL}/api/agents/specialists`);
    const data = await res.json();
    console.log('Specialists:', JSON.stringify(data, null, 2));
  } catch (err) {
    console.error('Agents API failed:', err);
  }
}

await testAwareness();
await testSiteBuilder();
await testAgents();
