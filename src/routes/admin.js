const express = require('express');
const router = express.Router();
const adminController = require('../controllers/admin.controller');
const { authMiddleware, adminMiddleware, strictLimiter } = require('../middleware/auth');
const { validateLogin, validateTask, validateConfig } = require('../middleware/validation');

router.post('/login', strictLimiter, validateLogin, adminController.login);

router.use(authMiddleware);
router.use(adminMiddleware);

router.get('/stats', adminController.getStats);
router.get('/agents', adminController.getAgents);
router.post('/tasks', validateTask, adminController.createTask);
router.get('/tokens', adminController.getTokenUsage);
router.put('/config', validateConfig, adminController.updateConfig);

module.exports = router;