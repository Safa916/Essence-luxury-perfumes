// Run this once to create your first admin account:
//   node seedAdmin.js
//
// There is intentionally no public "admin signup" page — admins are
// created directly in the database (or by another admin later on),
// never through a form anyone on the internet can reach.

require('dotenv').config();
const mongoose = require('mongoose');
const Admin = require('./models/admin');

const run = async () => {
  await mongoose.connect(process.env.MONGODB_URI);

  const email = 'safa@gmail.com';
  const password = 'safa123'; 
  
  const exists = await Admin.findOne({ email });
  if (exists) {
    console.log('An admin with this email already exists:', email);
    process.exit();
  }

  await Admin.create({
    full_name: 'Super Admin',
    email,
    password_hash: password, // hashed automatically by the pre('save') hook in models/admin.js
    access_level: 'super_admin'
  });

  console.log('Admin account created. Log in with:');
  console.log('  email:', email);
  console.log('  password:', password);
  process.exit();
};

run().catch((err) => {
  console.error(err);
  process.exit(1);
});
