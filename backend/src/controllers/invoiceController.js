const db = require('../config/db');
const { syncTimesheetsDirect } = require('../services/tempoService');
const { generateInvoicePdf } = require('../services/pdfService');

const STATUS_DB_TO_LABEL = {
  PENDING_PM: 'Pending PM Approval',
  REJECTED_PM: 'Rejected by PM',
  APPROVED_PM: 'Approved by PM',
  PAID: 'Paid'
};

const STATUS_INPUT_TO_DB = {
  PENDING_PM: 'PENDING_PM',
  REJECTED_PM: 'REJECTED_PM',
  APPROVED_PM: 'APPROVED_PM',
  PAID: 'PAID',
  'Pending PM Approval': 'PENDING_PM',
  'Rejected by PM': 'REJECTED_PM',
  'Approved by PM': 'APPROVED_PM',
  Paid: 'PAID'
};

function mapInvoiceRow(row) {
  return {
    id: row.id,
    invoiceNumber: row.invoice_number,
    contractorId: row.contractor_id,
    contractorName: row.contractor_name,
    projectName: row.project_name,
    startDate: row.start_date,
    endDate: row.end_date,
    totalHours: Number(row.total_hours),
    rate: Number(row.rate),
    amount: Number(row.amount),
    status: STATUS_DB_TO_LABEL[row.status] || row.status,
    statusCode: row.status,
    pdfPath: row.pdf_path,
    createdAt: row.created_at,
    comments: []
  };
}

function getExternalEntryId(entry, invoiceNumber, index) {
  return (
    String(entry?.tempoWorklogId || entry?.worklogId || entry?.id || entry?.issue?.id || '') ||
    `${invoiceNumber}-${index}`
  );
}

async function getInvoiceById(invoiceId) {
  const [invoiceRows] = await db.query(
    `SELECT i.id, i.invoice_number, i.contractor_id, u.full_name AS contractor_name,
            i.project_name, i.start_date, i.end_date, i.total_hours, i.rate, i.amount,
            i.status, i.pdf_path, i.created_at
     FROM invoices i
     JOIN users u ON u.id = i.contractor_id
     WHERE i.id = ?`,
    [invoiceId]
  );

  if (!invoiceRows[0]) {
    return null;
  }

  const invoice = mapInvoiceRow(invoiceRows[0]);

  const [commentRows] = await db.query(
    `SELECT c.id, c.comment_text AS comment, c.created_at AS at, c.user_id,
            u.full_name AS actor
     FROM comments c
     LEFT JOIN users u ON u.id = c.user_id
     WHERE c.invoice_id = ?
     ORDER BY c.created_at ASC`,
    [invoiceId]
  );

  invoice.comments = commentRows.map((row) => ({
    id: row.id,
    comment: row.comment,
    actor: row.actor || `User#${row.user_id || 'N/A'}`,
    at: row.at
  }));

  return invoice;
}

const syncAndCreateInvoice = async (req, res) => {
  const connection = await db.getConnection();
  let transactionStarted = false;

  try {
    const {
      projectName,
      startDate,
      endDate,
      rate
    } = req.body;

    if (!req.user?.id) {
      return res.status(401).json({ message: 'Unauthorized' });
    }

    const [userRows] = await connection.query(
      'SELECT id, full_name, email FROM users WHERE id = ? LIMIT 1',
      [req.user.id]
    );

    if (!userRows[0]) {
      return res.status(401).json({ message: 'Authenticated user not found in database' });
    }

    const contractor = userRows[0];

    const syncResult = await syncTimesheetsDirect({
      accountId: req.jiraConnection.external_account_id,
      from: startDate,
      to: endDate,
      jiraAccessToken: req.jiraConnection.access_token
    });

    const totalHours = Number(syncResult.totalHours.toFixed(2));
    const amount = Number((totalHours * Number(rate)).toFixed(2));
    const invoiceNumber = `INV-${Date.now()}`;

    const draftInvoice = {
      invoiceNumber,
      contractorName: contractor.full_name,
      projectName,
      startDate,
      endDate,
      totalHours,
      rate,
      amount,
      status: STATUS_DB_TO_LABEL.PENDING_PM
    };

    const pdf = await generateInvoicePdf(draftInvoice);

    await connection.beginTransaction();
    transactionStarted = true;

    const [invoiceResult] = await connection.query(
      `INSERT INTO invoices
      (invoice_number, contractor_id, project_name, start_date, end_date, total_hours, rate, amount, status, pdf_path)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        invoiceNumber,
        contractor.id,
        projectName,
        startDate,
        endDate,
        totalHours,
        Number(rate),
        amount,
        'PENDING_PM',
        `pdfs/${pdf.fileName}`
      ]
    );

    const invoiceId = invoiceResult.insertId;

    await connection.query(
      'INSERT INTO approvals (invoice_id, current_level, status) VALUES (?, 1, ?)',
      [invoiceId, 'PENDING']
    );

    const entries = syncResult.entries || [];

    if (entries.length > 0) {
      for (let index = 0; index < entries.length; index += 1) {
        const entry = entries[index];
        const seconds = Number(entry.timeSpentSeconds || 0);
        const hours = Number((seconds / 3600).toFixed(2));
        const externalEntryId = getExternalEntryId(entry, invoiceNumber, index);
        const workDate = entry.startDate || entry.dateStarted || entry.updatedAt?.slice(0, 10) || startDate;
        const description = entry.description || 'Tempo worklog';

        const [timesheetResult] = await connection.query(
          `INSERT INTO timesheet_entries
          (provider, external_entry_id, contractor_user_id, project_id, work_date, hours, description, raw_payload)
          VALUES ('TEMPO', ?, ?, NULL, ?, ?, ?, ?)
          ON DUPLICATE KEY UPDATE
            hours = VALUES(hours),
            description = VALUES(description),
            raw_payload = VALUES(raw_payload),
            id = LAST_INSERT_ID(id)`,
          [
            externalEntryId,
            contractor.id,
            workDate,
            hours,
            description,
            JSON.stringify(entry)
          ]
        );

        const timesheetEntryId = timesheetResult.insertId;
        const itemAmount = Number((hours * Number(rate)).toFixed(2));

        await connection.query(
          `INSERT INTO invoice_items
          (invoice_id, timesheet_entry_id, description, quantity, unit_rate, amount)
          VALUES (?, ?, ?, ?, ?, ?)`,
          [invoiceId, timesheetEntryId || null, description, hours, Number(rate), itemAmount]
        );
      }
    } else {
      await connection.query(
        `INSERT INTO invoice_items
        (invoice_id, timesheet_entry_id, description, quantity, unit_rate, amount)
        VALUES (?, NULL, ?, ?, ?, ?)`,
        [invoiceId, 'Aggregated time logs', totalHours, Number(rate), amount]
      );
    }

    await connection.query(
      'INSERT INTO audit_logs (user_id, action, metadata) VALUES (?, ?, ?)',
      [contractor.id, 'INVOICE_CREATED', JSON.stringify({ invoiceId, invoiceNumber })]
    );

    await connection.commit();
    transactionStarted = false;

    const invoice = await getInvoiceById(invoiceId);
    return res.status(201).json({ invoice });
  } catch (error) {
    if (transactionStarted) {
      await connection.rollback();
    }
    return res.status(500).json({
      message: 'Failed to sync timesheets and create invoice',
      error: error.message
    });
  } finally {
    connection.release();
  }
};

const listInvoices = async (req, res) => {
  try {
    const [rows] = await db.query(
      `SELECT i.id, i.invoice_number, i.contractor_id, u.full_name AS contractor_name,
              i.project_name, i.start_date, i.end_date, i.total_hours, i.rate, i.amount,
              i.status, i.pdf_path, i.created_at
       FROM invoices i
       JOIN users u ON u.id = i.contractor_id
       ORDER BY i.created_at DESC`
    );

    const invoices = rows.map(mapInvoiceRow);

    if (invoices.length > 0) {
      const invoiceIds = invoices.map((item) => item.id);
      const [commentRows] = await db.query(
        `SELECT c.id, c.invoice_id, c.comment_text AS comment, c.created_at AS at, c.user_id,
                u.full_name AS actor
         FROM comments c
         LEFT JOIN users u ON u.id = c.user_id
         WHERE c.invoice_id IN (?)
         ORDER BY c.created_at ASC`,
        [invoiceIds]
      );

      const commentMap = new Map();
      for (const row of commentRows) {
        if (!commentMap.has(row.invoice_id)) {
          commentMap.set(row.invoice_id, []);
        }
        commentMap.get(row.invoice_id).push({
          id: row.id,
          comment: row.comment,
          actor: row.actor || `User#${row.user_id || 'N/A'}`,
          at: row.at
        });
      }

      for (const invoice of invoices) {
        invoice.comments = commentMap.get(invoice.id) || [];
      }
    }

    return res.json({ invoices });
  } catch (error) {
    return res.status(500).json({ message: 'Failed to fetch invoices', error: error.message });
  }
};

const updateInvoiceStatus = async (req, res) => {
  const connection = await db.getConnection();
  let transactionStarted = false;

  try {
    const { id } = req.params;
    const { status, comment } = req.body;

    if (!req.user?.id) {
      return res.status(401).json({ message: 'Unauthorized' });
    }

    const statusCode = STATUS_INPUT_TO_DB[status];
    if (!statusCode) {
      return res.status(400).json({ message: 'Invalid status value' });
    }

    const [invoiceRows] = await connection.query(
      'SELECT id, amount FROM invoices WHERE id = ? LIMIT 1',
      [Number(id)]
    );

    if (!invoiceRows[0]) {
      return res.status(404).json({ message: 'Invoice not found' });
    }

    const invoice = invoiceRows[0];

    await connection.beginTransaction();
    transactionStarted = true;

    await connection.query('UPDATE invoices SET status = ? WHERE id = ?', [statusCode, invoice.id]);

    if (comment && String(comment).trim()) {
      await connection.query(
        'INSERT INTO comments (invoice_id, user_id, comment_text) VALUES (?, ?, ?)',
        [invoice.id, req.user.id, String(comment).trim()]
      );
    }

    const approvalStatus = statusCode === 'REJECTED_PM' ? 'REJECTED' : statusCode === 'PENDING_PM' ? 'PENDING' : 'APPROVED';
    await connection.query(
      `INSERT INTO approvals (invoice_id, current_level, status)
       VALUES (?, ?, ?)
       ON DUPLICATE KEY UPDATE current_level = VALUES(current_level), status = VALUES(status)`,
      [invoice.id, statusCode === 'PAID' ? 2 : 1, approvalStatus]
    );

    const [approvalRows] = await connection.query('SELECT id FROM approvals WHERE invoice_id = ? LIMIT 1', [invoice.id]);
    const approvalId = approvalRows[0]?.id;

    if (approvalId) {
      const stepOrder = statusCode === 'PAID' ? 2 : 1;
      const stepStatus = statusCode === 'REJECTED_PM' ? 'REJECTED' : statusCode === 'PENDING_PM' ? 'PENDING' : 'APPROVED';

      await connection.query(
        `INSERT INTO approval_steps (approval_id, step_order, approver_user_id, status, comment, acted_at)
         VALUES (?, ?, ?, ?, ?, ?)
         ON DUPLICATE KEY UPDATE
           approver_user_id = VALUES(approver_user_id),
           status = VALUES(status),
           comment = VALUES(comment),
           acted_at = VALUES(acted_at)`,
        [approvalId, stepOrder, req.user.id, stepStatus, comment || null, stepStatus === 'PENDING' ? null : new Date()]
      );
    }

    if (statusCode === 'PAID') {
      await connection.query(
        `INSERT INTO payments (invoice_id, paid_amount, paid_on, payment_reference, status)
         VALUES (?, ?, CURDATE(), ?, 'PAID')
         ON DUPLICATE KEY UPDATE
           paid_amount = VALUES(paid_amount),
           paid_on = VALUES(paid_on),
           payment_reference = VALUES(payment_reference),
           status = VALUES(status)`,
        [invoice.id, invoice.amount, `INV-${invoice.id}-${Date.now()}`]
      );
    }

    await connection.query(
      'INSERT INTO audit_logs (user_id, action, metadata) VALUES (?, ?, ?)',
      [req.user.id, 'INVOICE_STATUS_UPDATED', JSON.stringify({ invoiceId: invoice.id, status: statusCode })]
    );

    await connection.commit();
    transactionStarted = false;

    const updatedInvoice = await getInvoiceById(invoice.id);
    return res.json({ invoice: updatedInvoice });
  } catch (error) {
    if (transactionStarted) {
      await connection.rollback();
    }
    return res.status(500).json({ message: 'Failed to update invoice status', error: error.message });
  } finally {
    connection.release();
  }
};

module.exports = {
  syncAndCreateInvoice,
  listInvoices,
  updateInvoiceStatus
};
