module.exports = async (req, res) => {
  // Set CORS headers
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  res.json({
    message: 'Path Debug Information',
    url: req.url,
    method: req.method,
    fullPath: req.url,
    timestamp: new Date().toISOString(),
    note: 'Use this to see what paths Vercel is sending to your functions'
  });
};