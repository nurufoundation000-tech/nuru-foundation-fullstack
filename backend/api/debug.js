module.exports = async (req, res) => {
  res.json({ 
    status: 'Serverless function working!',
    timestamp: new Date().toISOString(),
    path: req.url
  });
};