import express from 'express';
const router = express.Router();
import { requireAuth } from '../../middleware/authMiddleware.js';

import { listAddresses, getNewAddressForm, getEditAddressForm, createAddress, updateAddress, deleteAddress, getDeleteConfirmation, setDefaultAddress } from '../../controllers/user/addressController.js';

router.get('/', requireAuth, listAddresses);
router.get('/new', requireAuth, getNewAddressForm);
router.get('/:id/edit', requireAuth, getEditAddressForm);
router.get('/:id/delete', requireAuth, getDeleteConfirmation);

router.post('/new', requireAuth, createAddress);
router.post('/:id/edit', requireAuth, updateAddress);
router.post('/:id/delete', requireAuth, deleteAddress);
router.post('/:id/set-default', requireAuth, setDefaultAddress); 



export default router;
