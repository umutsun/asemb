
const express = require('express');
const { createClient } = require('redis');
const crypto = require('crypto');
const axios = require('axios'); // Import axios

const router = express.Router();

// Redis client setup
const redisClient = createClient({
  url: process.env.REDIS_URL || 'redis://localhost:6379'
});

redisClient.on('error', (err) => console.log('Redis Client Error', err));
redisClient.connect();

// Function to call the actual LightRAG Python service
async function queryLightRAG(query) {
  console.log(`Forwarding query to LightRAG service: "${query}"`);
  try {
    const response = await axios.post('http://localhost:8001/query', {
      query: query,
      mode: 'hybrid' // or make this configurable
    });
    // The Python service wraps its result in a "response" object, so we extract it.
    return response.data.response; 
  } catch (error) {
    console.error('Error calling LightRAG service:', error.message);
    // If the service is down or there's an error, throw an exception
    // so the main endpoint handler can catch it.
    throw new Error('Failed to get response from LightRAG service.');
  }
}

// API endpoint to query the knowledge graph
router.post('/query', async (req, res) => {
  const { query } = req.body;

  if (!query) {
    return res.status(400).json({ error: 'Query is required' });
  }

  try {
    const cacheKey = `lightrag:query:${crypto.createHash('sha256').update(query).digest('hex')}`;

    const cachedResult = await redisClient.get(cacheKey);
    if (cachedResult) {
      console.log(`Cache hit for query: "${query}"`);
      return res.json({ ...JSON.parse(cachedResult), source: 'cache' });
    }

    console.log(`Cache miss for query: "${query}"`);
    const result = await queryLightRAG(query);

    // The result from the python service is just the answer string.
    // We will wrap it in an object to match the previous structure.
    const responsePayload = {
        query: query,
        answer: result,
        sources: ["LightRAG Service"], // Indicate the source
        timestamp: new Date().toISOString()
    };

    await redisClient.setEx(cacheKey, 3600, JSON.stringify(responsePayload));

    return res.json({ ...responsePayload, source: 'live' });

  } catch (error) {
    console.error('Error processing LightRAG query:', error);
    res.status(500).json({ error: 'An internal error occurred', details: error.message });
  }
});

module.exports = router;
