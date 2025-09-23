// Use the Cohere SDK's V2 client wrapper that matches the installed package
const { CohereClientV2 } = require('cohere-ai');

// Instantiate with the API key from env
const cohere = new CohereClientV2({ apiKey: process.env.COHERE_API_KEY });

module.exports = { cohere };
