const { getJiraConnectionByUserId } = require('../services/userService');

async function requireJiraConnection(req, res, next) {
  if (!req.user?.id) {
    return res.status(401).json({ message: 'Unauthorized' });
  }

  const jiraConnection = await getJiraConnectionByUserId(req.user.id);
  if (!jiraConnection) {
    return res.status(403).json({ message: 'Jira account is not connected' });
  }

  req.jiraConnection = jiraConnection;
  return next();
}

module.exports = requireJiraConnection;
