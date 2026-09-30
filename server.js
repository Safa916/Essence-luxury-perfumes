require('dotenv').config() 
const express=  require("express")
const methodOverride = require('method-override'); 
const app =express()
const path = require("path");
app.set("view engine", "ejs");


const connectDB=require('./db/connectDB');
const cookieParser = require('cookie-parser');
const userRoutes = require('./routes/user/userRoutes');
const { checkUser } = require('./middleware/authMiddleware');
const addressRoutes = require('./routes/user/addressRoutes');
const profileRoutes = require('./routes/user/profileRoutes');
const adminRoutes = require('./routes/admin/adminRoutes');
const shopRoutes = require('./routes/user/shopRoutes');
 const { renderHome } = require('./controllers/user/homeController');
  const categoryRoutes = require('./routes/user/categoryRoutes');
  const productRoutes = require('./routes/user/productRoutes');
  const cartRoutes = require('./routes/user/cartRoutes');  
const wishlistRoutes = require('./routes/user/wishlistRoutes');





app.use(express.static(path.join(__dirname, "public")));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

app.use(methodOverride(function (req, res) {
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


app.get('/',checkUser,renderHome)


app.use('/auth', userRoutes);
app.use('/address', addressRoutes);
app.use('/profile', profileRoutes);
app.use('/admin', adminRoutes);
app.use('/shop', shopRoutes);
app.use('/categories',categoryRoutes);
app.use('/product', productRoutes);
app.use('/cart', cartRoutes);  
app.use('/wishlist', wishlistRoutes);






app.listen(PORT, () => console.log(` Server running on port ${PORT}`));


