const axios = require('axios');
const passport = require('passport');
const GoogleStrategy = require('passport-google-oauth20').Strategy;
const OAuth2Strategy = require('passport-oauth2');
const logger = require('../utils/logger');
const { upsertOAuthUser, upsertJiraConnection, getUserById } = require('../services/userService');

passport.serializeUser((user, done) => done(null, user.id));
passport.deserializeUser(async (id, done) => {
  try {
    const user = await getUserById(id);
    done(null, user || false);
  } catch (error) {
    done(error);
  }
});

passport.use(
  new GoogleStrategy(
    {
      clientID: process.env.GOOGLE_CLIENT_ID,
      clientSecret: process.env.GOOGLE_CLIENT_SECRET,
      callbackURL: process.env.GOOGLE_CALLBACK_URL
    },
    async (accessToken, refreshToken, profile, done) => {
      try {
        const email = profile.emails?.[0]?.value || null;
        const allowedDomains = (process.env.ALLOWED_EMAIL_DOMAIN || '')
          .split(',')
          .map((item) => item.trim().toLowerCase())
          .filter(Boolean);

        if (!email) {
          return done(null, false, { message: 'Google account email not found' });
        }

        if (allowedDomains.length > 0) {
          const emailDomain = email.split('@')[1]?.toLowerCase() || '';
          const isAllowed = allowedDomains.includes(emailDomain);

          if (!isAllowed) {
            return done(null, false, { message: 'Email domain not allowed' });
          }
        }

        const user = await upsertOAuthUser({
          provider: 'GOOGLE',
          providerId: profile.id,
          email,
          fullName: profile.displayName || 'Google User',
          avatarUrl: profile.photos?.[0]?.value || null
        });

        done(null, user);
      } catch (error) {
        done(error);
      }
    }
  )
);

passport.use(
  'jira-connect',
  new OAuth2Strategy(
    {
      authorizationURL: process.env.JIRA_AUTH_URL,
      tokenURL: process.env.JIRA_TOKEN_URL,
      clientID: process.env.JIRA_CLIENT_ID,
      clientSecret: process.env.JIRA_CLIENT_SECRET,
      callbackURL: process.env.JIRA_CALLBACK_URL,
      passReqToCallback: true
    },
    async (req, accessToken, refreshToken, params, profile, done) => {
      const requestId = `jira-connect-${Date.now()}`;

      try {
        if (!req.user?.id) {
          return done(new Error('Jira connection requires an authenticated user session'));
        }

        const [profileResponse, resourcesResponse] = await Promise.all([
          axios.get('https://api.atlassian.com/me', {
            headers: { Authorization: `Bearer ${accessToken}` }
          }),
          axios.get('https://api.atlassian.com/oauth/token/accessible-resources', {
            headers: { Authorization: `Bearer ${accessToken}` }
          })
        ]);

        const jiraProfile = profileResponse.data || {};
        const resources = resourcesResponse.data || [];
        const selectedResource = resources.find((item) => Array.isArray(item.scopes) && item.scopes.includes('read:jira-work')) || resources[0] || null;

        const externalAccountId = jiraProfile.account_id || jiraProfile.accountId;

        if (!externalAccountId) {
          return done(new Error('Could not read Jira account id from Atlassian profile response'));
        }

        const { isFirstConnection } = await upsertJiraConnection({
          userId: req.user.id,
          externalAccountId,
          externalEmail: jiraProfile.email || jiraProfile.mail || null,
          jiraCloudId: selectedResource?.id || null,
          jiraSiteName: selectedResource?.name || null,
          accessToken,
          refreshToken,
          expiresIn: params?.expires_in,
          scopes: params?.scope
        });

        if (isFirstConnection) {
          logger.info('Jira first connection established', {
            requestId,
            userId: req.user.id
          });
        }

        const user = await getUserById(req.user.id);
        return done(null, user);
      } catch (error) {
        return done(error);
      }
    }
  )
);

module.exports = passport;
