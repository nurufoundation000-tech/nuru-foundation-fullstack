module.exports = async (req, res) => {
  res.json({
    message: 'Debug endpoint',
    url: req.url,
    method: req.method,
    fullUrl: `${req.url}`,
    timestamp: new Date().toISOString()
  });
};