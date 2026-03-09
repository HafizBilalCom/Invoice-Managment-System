const { getUserById } = require('../services/userService');

async function applyImpersonation(req, res, next) {
  try {
    if (!req.user || !req.session) {
      return next();
    }

    const impersonatedUserId = Number(req.session.impersonatedUserId || 0);
    const impersonatorUserId = Number(req.session.impersonatorUserId || 0);

    if (!Number.isInteger(impersonatedUserId) || impersonatedUserId <= 0) {
      return next();
    }

    if (!Number.isInteger(impersonatorUserId) || impersonatorUserId <= 0) {
      req.session.impersonatedUserId = null;
      req.session.impersonatorUserId = null;
      return next();
    }

    if (impersonatedUserId === impersonatorUserId) {
      req.session.impersonatedUserId = null;
      req.session.impersonatorUserId = null;
      return next();
    }

    const [impersonator, impersonated] = await Promise.all([
      getUserById(impersonatorUserId),
      getUserById(impersonatedUserId)
    ]);

    if (!impersonator?.isSuperAdmin || !impersonated) {
      req.session.impersonatedUserId = null;
      req.session.impersonatorUserId = null;
      return next();
    }

    req.impersonatorUser = impersonator;
    req.user = impersonated;
    req.isImpersonating = true;
    return next();
  } catch (error) {
    return next(error);
  }
}

module.exports = applyImpersonation;
