import 'dotenv/config';
import express from 'express';
import methodOverride from 'method-override';
import path from 'path';
import cookieParser from 'cookie-parser';
import connectDB from './db/connectDB.js';
import userRoutes from './routes/user/userRoutes.js';
import { checkUser } from './middleware/authMiddleware.js';
import addressRoutes from './routes/user/addressRoutes.js';
import profileRoutes from './routes/user/profileRoutes.js';
import adminRoutes from './routes/admin/adminRoutes.js';
import shopRoutes from './routes/user/shopRoutes.js';
import { renderHome } from './controllers/user/homeController.js';
import categoryRoutes from './routes/user/categoryRoutes.js';
import productRoutes from './routes/user/productRoutes.js';
import cartRoutes from './routes/user/cartRoutes.js';
import wishlistRoutes from './routes/user/wishlistRoutes.js';
import checkoutRoutes from './routes/user/checkoutRoutes.js';
import orderRoutes from './routes/user/orderRoutes.js';
import couponRoutes from './routes/user/couponRoutes.js';
import walletRoutes from './routes/user/walletRoutes.js';
import userBrandRoutes from './routes/user/brandRoutes.js';

const __dirname = import.meta.dirname;

const app = express();
app.set("view engine", "ejs");

app.use(express.static(path.join(__dirname, "public")));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

app.use(methodOverride(function (req, _res) {
  if (req.body && typeof req.body === 'object' && '_method' in req.body) {
    const method = req.body._method;
    delete req.body._method;
    return method;
  }
}));

app.use(methodOverride('_method'));

app.use(cookieParser());

connectDB();
const PORT = process.env.PORT || 3002;

app.get('/', checkUser, renderHome);

app.use('/auth', userRoutes);
app.use('/address', addressRoutes);
app.use('/profile', profileRoutes);
app.use('/admin', adminRoutes);
app.use('/shop', shopRoutes);
app.use('/categories', categoryRoutes);
app.use('/product', productRoutes);
app.use('/cart', cartRoutes);
app.use('/wishlist', wishlistRoutes);
app.use('/checkout', checkoutRoutes);
app.use('/orders', orderRoutes);
app.use('/coupon', couponRoutes);
app.use('/coupons', couponRoutes);
app.use('/wallet', walletRoutes);
app.use('/brands', userBrandRoutes);
app.use('/brand', userBrandRoutes);
app.use('/houses', userBrandRoutes);

// Server entry - running
app.listen(PORT, () => console.log(` Server running on port ${PORT}`));
