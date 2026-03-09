const db = require('../config/db');

async function getWorkflowSteps(req, res) {
  try {
    const [rows] = await db.query(
      `SELECT aws.id, aws.step_order, aws.step_title, aws.approver_user_id,
              aws.is_active, aws.is_final, u.full_name AS approver_name, u.email AS approver_email
       FROM approval_workflow_steps aws
       LEFT JOIN users u ON u.id = aws.approver_user_id
       ORDER BY aws.step_order ASC`
    );

    return res.json({
      steps: rows.map((row) => ({
        id: row.id,
        stepOrder: row.step_order,
        stepTitle: row.step_title,
        approverUserId: row.approver_user_id,
        approverName: row.approver_name,
        approverEmail: row.approver_email,
        isActive: Boolean(row.is_active),
        isFinal: Boolean(row.is_final)
      }))
    });
  } catch (error) {
    return res.status(500).json({ message: 'Failed to fetch workflow steps', error: error.message });
  }
}

async function updateWorkflowSteps(req, res) {
  const connection = await db.getConnection();
  let transactionStarted = false;

  try {
    const steps = Array.isArray(req.body?.steps) ? req.body.steps : null;
    if (!steps) {
      return res.status(400).json({ message: 'steps array is required' });
    }

    const stepMap = new Map();
    for (const step of steps) {
      const stepOrder = Number(step.stepOrder);
      if (!Number.isInteger(stepOrder) || stepOrder < 1 || stepOrder > 6) {
        return res.status(400).json({ message: 'stepOrder must be between 1 and 6' });
      }
      if (stepMap.has(stepOrder)) {
        return res.status(400).json({ message: 'Duplicate stepOrder detected' });
      }
      stepMap.set(stepOrder, {
        stepOrder,
        stepTitle: String(step.stepTitle || '').trim() || `Level ${stepOrder} Approval`,
        approverUserId: step.approverUserId ? Number(step.approverUserId) : null,
        isActive: Boolean(step.isActive),
        isFinal: Boolean(step.isFinal)
      });
    }

    const normalized = [];
    for (let order = 1; order <= 6; order += 1) {
      const current = stepMap.get(order) || {
        stepOrder: order,
        stepTitle: `Level ${order} Approval`,
        approverUserId: null,
        isActive: false,
        isFinal: false
      };
      normalized.push(current);
    }

    const activeSteps = normalized.filter((step) => step.isActive);
    const firstStep = normalized.find((step) => step.stepOrder === 1);
    if (!firstStep?.isActive) {
      return res.status(400).json({ message: 'Step 1 must remain active' });
    }

    const finalSteps = activeSteps.filter((step) => step.isFinal);
    if (finalSteps.length !== 1) {
      return res.status(400).json({ message: 'Exactly one active step must be marked final' });
    }

    const finalOrder = finalSteps[0].stepOrder;
    const invalidAfterFinal = activeSteps.some((step) => step.stepOrder > finalOrder);
    if (invalidAfterFinal) {
      return res.status(400).json({ message: 'No active steps are allowed after the final step' });
    }

    for (const step of normalized) {
      if (!step.isActive) {
        continue;
      }
      if (step.stepOrder > 1 && !step.approverUserId) {
        return res.status(400).json({ message: `Step ${step.stepOrder} requires an approver user` });
      }
    }

    const approverIds = normalized
      .map((step) => step.approverUserId)
      .filter((value) => Number.isInteger(value) && value > 0);

    if (approverIds.length > 0) {
      const [approverRows] = await connection.query('SELECT id FROM users WHERE id IN (?)', [approverIds]);
      const approverSet = new Set(approverRows.map((row) => Number(row.id)));
      for (const id of approverIds) {
        if (!approverSet.has(id)) {
          return res.status(400).json({ message: `Invalid approver user id: ${id}` });
        }
      }
    }

    await connection.beginTransaction();
    transactionStarted = true;

    for (const step of normalized) {
      await connection.query(
        `INSERT INTO approval_workflow_steps
          (step_order, step_title, approver_user_id, is_active, is_final)
         VALUES (?, ?, ?, ?, ?)
         ON DUPLICATE KEY UPDATE
           step_title = VALUES(step_title),
           approver_user_id = VALUES(approver_user_id),
           is_active = VALUES(is_active),
           is_final = VALUES(is_final)`,
        [step.stepOrder, step.stepTitle, step.approverUserId, step.isActive ? 1 : 0, step.isFinal ? 1 : 0]
      );
    }

    await connection.query('INSERT INTO audit_logs (user_id, action, metadata) VALUES (?, ?, ?)', [
      req.user.id,
      'APPROVAL_WORKFLOW_UPDATED',
      JSON.stringify({ steps: normalized })
    ]);

    await connection.commit();
    transactionStarted = false;

    return getWorkflowSteps(req, res);
  } catch (error) {
    if (transactionStarted) {
      await connection.rollback();
    }
    return res.status(500).json({ message: 'Failed to update workflow steps', error: error.message });
  } finally {
    connection.release();
  }
}

module.exports = {
  getWorkflowSteps,
  updateWorkflowSteps
};
