const { isSuperAdminEmail } = require('../utils/superAdmin');

function requireSuperAdmin(req, res, next) {
  console.log(JSON.stringify(req.jiraConnection));
  if (!req.jiraConnection?.external_email || !isSuperAdminEmail(req.jiraConnection.external_email)) {
    
    return res.status(403).json({
      message: 'Only the configured super admin can run this sync action '+req.jiraConnection?.external_email
    });
  }

  return next();
}

module.exports = requireSuperAdmin;
