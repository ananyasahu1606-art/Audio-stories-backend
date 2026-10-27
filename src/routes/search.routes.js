const express = require('express');
const router = express.Router();
const { globalSearch } = require('../controllers/search.controller');
const { protect } = require('../middlewares/auth.middleware');

// Protect Global Search with Admin JWT Authentication
router.use(protect);

// Routes
router.get('/', globalSearch);

module.exports = router;
