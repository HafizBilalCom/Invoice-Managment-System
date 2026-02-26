const { getUserById, touchLastLogin, disconnectJiraConnection } = require('../services/userService');

const getSessionUser = async (req, res) => {
  if (!req.user?.id) {
    return res.status(401).json({ message: 'Unauthorized' });
  }

  const user = await getUserById(req.user.id);
  if (!user) {
    return res.status(401).json({ message: 'Unauthorized' });
  }

  await touchLastLogin(user.id);
  return res.json({ user });
};

const logout = (req, res) => {
  req.logout(() => {
    req.session.destroy(() => {
      res.clearCookie('connect.sid');
      res.json({ message: 'Logged out' });
    });
  });
};

const disconnectJira = async (req, res) => {
  if (!req.user?.id) {
    return res.status(401).json({ message: 'Unauthorized' });
  }

  const disconnected = await disconnectJiraConnection(req.user.id);
  return res.json({
    message: disconnected ? 'Jira account disconnected' : 'No Jira connection found'
  });
};

module.exports = { getSessionUser, logout, disconnectJira };
