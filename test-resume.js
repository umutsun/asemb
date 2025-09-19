const fetch = require('node-fetch');

async function testResume() {
  // First, check current progress
  console.log('Checking current progress...');
  const progressRes = await fetch('http://localhost:8083/api/v2/embeddings/progress');
  const progressData = await progressRes.json();
  console.log('Current progress:', progressData);

  // Fix the counts first
  console.log('\nFixing embedding counts...');
  const fixRes = await fetch('http://localhost:8083/api/v2/embeddings/fix-counts', {
    method: 'POST'
  });
  const fixData = await fixRes.json();
  console.log('Fix result:', {
    total: fixData.overall.totalRecords,
    embedded: fixData.overall.totalEmbedded,
    percentage: fixData.overall.percentage
  });

  // Check tables
  console.log('\nChecking tables...');
  const tablesRes = await fetch('http://localhost:8083/api/v2/embeddings/tables');
  const tablesData = await tablesRes.json();

  console.log('\nTable status:');
  tablesData.tablesWithMeta.forEach(table => {
    console.log(`${table.name}: ${table.embeddedRecords || 0} / ${table.totalRecords || 0} (${Math.round((table.embeddedRecords / table.totalRecords) * 100)}%)`);
  });
}

testResume().catch(console.error);