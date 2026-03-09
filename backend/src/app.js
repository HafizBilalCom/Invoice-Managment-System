const express = require('express');
const cors = require('cors');
const session = require('express-session');
const dotenv = require('dotenv');
const passport = require('./config/passport');
const applyImpersonation = require('./middleware/applyImpersonation');
const routes = require('./routes');

dotenv.config();

const app = express();

app.use(
  cors({
    origin: process.env.FRONTEND_URL,
    credentials: true
  })
);
app.use(express.json());

app.use(
  session({
    secret: process.env.SESSION_SECRET,
    resave: false,
    saveUninitialized: false
  })
);

app.use(passport.initialize());
app.use(passport.session());
app.use(applyImpersonation);

app.use('/api', routes);
app.use('/pdfs', express.static('storage/pdfs'));

app.get('/health', (req, res) => {
  res.json({ status: 'ok' });
});

module.exports = app;
