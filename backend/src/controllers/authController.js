const db = require('../config/db');
const { getUserById, touchLastLogin, disconnectJiraConnection } = require('../services/userService');

const getSessionUser = async (req, res) => {
  if (!req.user?.id) {
    return res.status(401).json({ message: 'Unauthorized' });
  }

  const user = await getUserById(req.user.id);
  if (!user) {
    return res.status(401).json({ message: 'Unauthorized' });
  }

  if (!req.isImpersonating) {
    await touchLastLogin(user.id);
  }

  if (req.isImpersonating && req.impersonatorUser) {
    return res.json({
      user: {
        ...user,
        isImpersonating: true,
        impersonator: {
          id: req.impersonatorUser.id,
          email: req.impersonatorUser.email,
          name: req.impersonatorUser.name,
          role: req.impersonatorUser.role
        }
      }
    });
  }

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

const startImpersonation = async (req, res) => {
  if (!req.user?.id || !req.user?.isSuperAdmin) {
    return res.status(403).json({ message: 'Only super admin can impersonate users' });
  }

  const targetUserId = Number(req.params.userId);
  if (!Number.isInteger(targetUserId) || targetUserId <= 0) {
    return res.status(400).json({ message: 'Invalid target user id' });
  }

  if (targetUserId === Number(req.user.id)) {
    return res.status(400).json({ message: 'You cannot impersonate yourself' });
  }

  const targetUser = await getUserById(targetUserId);
  if (!targetUser) {
    return res.status(404).json({ message: 'Target user not found' });
  }

  req.session.impersonatorUserId = req.user.id;
  req.session.impersonatedUserId = targetUser.id;

  await db.query('INSERT INTO audit_logs (user_id, action, metadata) VALUES (?, ?, ?)', [
    req.user.id,
    'IMPERSONATION_STARTED',
    JSON.stringify({ targetUserId: targetUser.id, targetEmail: targetUser.email || null })
  ]);

  return res.json({
    message: 'Impersonation started',
    user: {
      ...targetUser,
      isImpersonating: true,
      impersonator: {
        id: req.user.id,
        email: req.user.email,
        name: req.user.name,
        role: req.user.role
      }
    }
  });
};

const stopImpersonation = async (req, res) => {
  const impersonatorUserId = Number(req.session?.impersonatorUserId || 0);
  const impersonatedUserId = Number(req.session?.impersonatedUserId || 0);

  if (!Number.isInteger(impersonatorUserId) || impersonatorUserId <= 0 || !impersonatedUserId) {
    return res.status(400).json({ message: 'No active impersonation session' });
  }

  req.session.impersonatorUserId = null;
  req.session.impersonatedUserId = null;

  const impersonatorUser = await getUserById(impersonatorUserId);
  if (!impersonatorUser) {
    return res.status(401).json({ message: 'Impersonator session no longer valid' });
  }

  await db.query('INSERT INTO audit_logs (user_id, action, metadata) VALUES (?, ?, ?)', [
    impersonatorUserId,
    'IMPERSONATION_STOPPED',
    JSON.stringify({ previousImpersonatedUserId: impersonatedUserId })
  ]);

  return res.json({
    message: 'Impersonation stopped',
    user: impersonatorUser
  });
};

module.exports = { getSessionUser, logout, disconnectJira, startImpersonation, stopImpersonation };
