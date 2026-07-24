const Address = require('../models/Address');

// Helper: format one address doc into what myAddresses.ejs expects
const formatAddressForList = (addr) => ({
  id: addr._id.toString(),
  label: addr.address_type === 'home' ? 'Home' : addr.address_type === 'work' ? 'Work' : 'Other',
  isDefault: addr.is_default,
  name: addr.full_name,
  lines: [
    addr.address_line1,
    addr.address_line2,
    `${addr.city}${addr.pincode ? ', ' + addr.pincode : ''}`,
    addr.country,
  ].filter(Boolean),
});

// Helper: validate address form fields
const validateAddressInput = (data) => {
  const errors = [];

  if (!data.fullName || data.fullName.trim().length < 2) {
    errors.push('Full name must be at least 2 characters');
  }
  if (!data.line1 || data.line1.trim().length < 5) {
    errors.push('Address line 1 must be at least 5 characters');
  }
  if (!data.city || data.city.trim().length < 2) {
    errors.push('City is required');
  }
  
  if (!data.pincode || !/^[1-9][0-9]{5}$/.test(data.pincode.trim())) {
  errors.push('Enter a valid 6-digit Indian pincode');
}
  if (!data.phone || !/^[6-9]\d{9}$/.test(data.phone.trim())) {
    errors.push('Phone number must be a valid 10-digit Indian mobile number');
  }
  if (!['home', 'work'].includes(data.type)) {
    errors.push('Invalid address type');
  }

  return errors;
};

// @desc    List all addresses for the logged-in user
// @route   GET /address
exports.listAddresses = async (req, res) => {
  try {
    const addresses = await Address.find({ user_id: req.user._id }).sort({ is_default: -1, created_at: -1 });
    const formatted = addresses.map(formatAddressForList);
    res.render('user/address/myAddresses', { addresses: formatted, user: req.user });
  } catch (error) {
    console.error('List addresses error:', error.message);
    res.status(500).send('Server error loading addresses');
  }
};

// @desc    Show the "Add New Address" form
// @route   GET /address/new
exports.getNewAddressForm = (req, res) => {
  res.render('user/address/edit-address', {
    address: { id: 'new', type: 'home', fullName: '', line1: '', line2: '', city: '', pincode: '', phone: '' },
  });
};

// @desc    Show the "Edit Address" form for an existing address
// @route   GET /address/:id/edit
exports.getEditAddressForm = async (req, res) => {
  try {
    const addr = await Address.findOne({ _id: req.params.id, user_id: req.user._id });
    if (!addr) return res.status(404).send('Address not found');

    res.render('user/address/edit-address', {
      address: {
        id: addr._id.toString(),
        type: addr.address_type,
        fullName: addr.full_name,
        line1: addr.address_line1,
        line2: addr.address_line2,
        city: addr.city,
        pincode: addr.pincode,
        phone: addr.phone_number,
      },
    });
  } catch (error) {
    console.error('Get edit address form error:', error.message);
    res.status(500).send('Server error loading address');
  }
};

// @desc    Show the "Delete Address" confirmation page
// @route   GET /address/:id/delete
exports.getDeleteConfirmation = async (req, res) => {
  try {
    const addr = await Address.findOne({ _id: req.params.id, user_id: req.user._id });
    if (!addr) return res.redirect('/address');

    res.render('user/address/delete-address', {
      address: {
        id: addr._id.toString(),
        label: addr.address_type === 'home' ? 'Home' : addr.address_type === 'work' ? 'Work' : 'Other',
        name: addr.full_name,
        lines: [
          addr.address_line1,
          addr.address_line2,
          `${addr.city}${addr.pincode ? ', ' + addr.pincode : ''}`,
          addr.country,
        ].filter(Boolean),
      },
    });
  } catch (error) {
    console.error('Get delete confirmation error:', error.message);
    res.redirect('/address');
  }
};

// @desc    Create a new address
// @route   POST /address/new
exports.createAddress = async (req, res) => {
  try {
    const { type, fullName, line1, line2, city, pincode, phone } = req.body;

    const errors = validateAddressInput(req.body);
    if (errors.length > 0) {
      return res.render('user/address/edit-address', {
        address: { id: 'new', type, fullName, line1, line2, city, pincode, phone },
        errors,
      });
    }

    await Address.create({
      user_id: req.user._id,
      full_name: fullName,
      phone_number: phone,
      address_line1: line1,
      address_line2: line2,
      city,
      pincode,
      address_type: type,
    });

    res.redirect('/address');
  } catch (error) {
    console.error('Create address error:', error.message);
    res.status(500).send('Server error creating address');
  }
};

// @desc    Update an existing address
// @route   POST /address/:id/edit
exports.updateAddress = async (req, res) => {
  try {
    const { type, fullName, line1, line2, city, pincode, phone } = req.body;

    const errors = validateAddressInput(req.body);
    if (errors.length > 0) {
      return res.render('user/address/edit-address', {
        address: { id: req.params.id, type, fullName, line1, line2, city, pincode, phone },
        errors,
      });
    }

    await Address.findOneAndUpdate(
      { _id: req.params.id, user_id: req.user._id },
      {
        full_name: fullName,
        phone_number: phone,
        address_line1: line1,
        address_line2: line2,
        city,
        pincode,
        address_type: type,
      }
    );

    res.redirect('/address');
  } catch (error) {
    console.error('Update address error:', error.message);
    res.status(500).send('Server error updating address');
  }
};

// @desc    Delete an address
// @route   POST /address/:id/delete
exports.deleteAddress = async (req, res) => {
  try {
    await Address.findOneAndDelete({ _id: req.params.id, user_id: req.user._id });
    res.redirect('/address');
  } catch (error) {
    console.error('Delete address error:', error.message);
    res.status(500).send('Server error deleting address');
  }
};