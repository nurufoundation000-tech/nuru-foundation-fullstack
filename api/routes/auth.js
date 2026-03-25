const express = require('express');
const router = express.Router();
const { handleAuth } = require('../lib/handlers');
const { authLimiter, registerLimiter } = require('../middleware/rateLimiter');

router.post('/login', authLimiter, async (req, res) => {
  await handleAuth.login({ body: req.body }, res);
});

router.post('/register', registerLimiter, async (req, res) => {
  await handleAuth.register({ body: req.body }, res);
});

module.exports = router;
