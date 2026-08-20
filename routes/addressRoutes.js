const express = require('express');
const router = express.Router();
const { requireAuth } = require('../middleware/authMiddleware');

const {
  listAddresses,
  getNewAddressForm,
  getEditAddressForm,
  createAddress,
  updateAddress,
  deleteAddress,
  getDeleteConfirmation,
} = require('../controllers/user/addressController');

router.get('/', requireAuth, listAddresses);
router.get('/new', requireAuth, getNewAddressForm);
router.get('/:id/edit', requireAuth, getEditAddressForm);
router.get('/:id/delete', requireAuth, getDeleteConfirmation);

router.post('/new', requireAuth, createAddress);
router.post('/:id/edit', requireAuth, updateAddress);
router.post('/:id/delete', requireAuth, deleteAddress);



module.exports = router;
