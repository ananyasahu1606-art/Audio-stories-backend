const express = require('express');
const router = express.Router();
const {
  getSavedLibrary,
  addToLibrary,
  removeFromLibrary,
  toggleLibrary,
} = require('../controllers/library.controller');
const { protectListener } = require('../middlewares/auth.middleware');

// All Library routes are protected and strictly scoped to the authenticated listener
router.use(protectListener);

router.route('/')
  .get(getSavedLibrary)
  .post(addToLibrary);

router.post('/toggle', toggleLibrary);
router.delete('/:storyId', removeFromLibrary);

module.exports = router;
