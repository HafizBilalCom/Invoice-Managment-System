const { isSuperAdminEmail } = require('../utils/superAdmin');

function requireSuperAdmin(req, res, next) {
  let userEmail = req.user?.email;
  if(!userEmail) {
    if(req.jiraConnection?.external_email) {
      userEmail = req.jiraConnection.external_email;
    }
  }
  if (!userEmail || !isSuperAdminEmail(userEmail)) {
    return res.status(403).json({
      message: 'Only the configured super admin can run this sync action ' + userEmail
    });
  }

  return next();
}

module.exports = requireSuperAdmin;
