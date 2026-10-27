const express = require('express');
const router = express.Router();
const {
  getFavorites,
  addToFavorites,
  removeFromFavorites,
  toggleFavorites,
} = require('../controllers/favorites.controller');
const { protectListener } = require('../middlewares/auth.middleware');

// All Favorites routes are protected and strictly scoped to the authenticated listener
router.use(protectListener);

router.route('/')
  .get(getFavorites)
  .post(addToFavorites);

router.post('/toggle', toggleFavorites);
router.delete('/:storyId', removeFromFavorites);

module.exports = router;
