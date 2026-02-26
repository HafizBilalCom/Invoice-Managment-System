const express = require('express');
const passport = require('passport');
const { getSessionUser, logout, disconnectJira } = require('../controllers/authController');
const requireAuth = require('../middleware/requireAuth');

const router = express.Router();

router.get('/google', passport.authenticate('google', { scope: ['profile', 'email'] }));
router.get('/google/callback', (req, res, next) => {
  passport.authenticate('google', (error, user, info) => {
    if (error) {
      return next(error);
    }

    if (!user) {
      const errorCode = info?.message === 'Email domain not allowed' ? 'domain_not_allowed' : 'auth_failed';
      return res.redirect(`${process.env.FRONTEND_URL}/login?error=${errorCode}`);
    }

    return req.logIn(user, (loginError) => {
      if (loginError) {
        return next(loginError);
      }

      return res.redirect(process.env.FRONTEND_URL);
    });
  })(req, res, next);
});

router.get(
  '/jira/connect',
  requireAuth,
  passport.authenticate('jira-connect', {
    scope: ['read:me', 'read:jira-work', 'offline_access'],
    state: true
  })
);

router.get(
  '/jira/callback',
  passport.authenticate('jira-connect', { failureRedirect: `${process.env.FRONTEND_URL}/?jira=failed` }),
  (req, res) => {
    res.redirect(`${process.env.FRONTEND_URL}/?jira=connected`);
  }
);

router.get('/me', getSessionUser);
router.post('/jira/disconnect', requireAuth, disconnectJira);
router.post('/logout', logout);

module.exports = router;
