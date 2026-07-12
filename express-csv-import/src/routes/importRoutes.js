const express = require('express');
const router = express.Router();
const importController = require('../controllers/importController');

// POST /api/import
router.post('/import', importController.handleImport);

module.exports = router;
