require('dotenv').config() 
const express=  require("express")
const app =express()
const path = require("path");
app.set("view engine", "ejs");
const connectDB=require('./db/connectDB');
const cookieParser = require('cookie-parser');
const userRoutes = require('./routes/userRoutes');
const { checkUser } = require('./middleware/authMiddleware');
const addressRoutes = require('./routes/addressRoutes');
const profileRoutes = require('./routes/profileRoutes');
const adminRoutes = require('./routes/adminRoutes');





app.use(express.static(path.join(__dirname, "public")));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

app.use(cookieParser());


connectDB();
const PORT = process.env.PORT || 3002;


app.get('/', checkUser, (req, res) => {
  res.set('Cache-Control', 'no-store, no-cache, must-revalidate, private');
  res.set('Pragma', 'no-cache');
  res.set('Expires', '0');

    res.render('user/home/homepage', { user: req.user });
});

app.use('/auth', userRoutes);
app.use('/address', addressRoutes);
app.use('/profile', profileRoutes);
app.use('/admin', adminRoutes);




app.listen(PORT, () => console.log(` Server running on port ${PORT}`));


