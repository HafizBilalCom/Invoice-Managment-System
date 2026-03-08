const db = require('../config/db');
const { generateInvoicePdf } = require('../services/pdfService');
const { buildInvoiceSnapshot, getUserProfileRow } = require('../services/profileService');
const logger = require('../utils/logger');

const STATUS_DB_TO_LABEL = {
  DRAFT: 'Draft',
  PENDING_PM: 'Pending PM Approval',
  REJECTED_PM: 'Rejected by PM',
  APPROVED_PM: 'Approved by PM',
  PAID: 'Paid'
};

const STATUS_INPUT_TO_DB = {
  DRAFT: 'DRAFT',
  PENDING_PM: 'PENDING_PM',
  REJECTED_PM: 'REJECTED_PM',
  APPROVED_PM: 'APPROVED_PM',
  PAID: 'PAID',
  Draft: 'DRAFT',
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
    projectKey: row.project_key_snapshot || null,
    projectName: row.project_name,
    projectNumber: row.project_number_snapshot || null,
    projectAccountNumber: row.project_account_number_snapshot || null,
    startDate: row.start_date,
    endDate: row.end_date,
    totalHours: Number(row.total_hours),
    rate: Number(row.rate),
    amount: Number(row.amount),
    status: STATUS_DB_TO_LABEL[row.status] || row.status,
    statusCode: row.status,
    pdfPath: row.pdf_path,
    payeeName: row.payee_name_snapshot || null,
    payeeEmail: row.payee_email_snapshot || null,
    paymentMethod: row.payment_method_snapshot || null,
    paymentCurrency: row.payment_currency_snapshot || null,
    remittanceEmail: row.remittance_email_snapshot || null,
    bankAccountTitle: row.bank_account_title_snapshot || null,
    bankAccountLast4: row.bank_account_last4_snapshot || null,
    bankName: row.bank_name_snapshot || null,
    createdAt: row.created_at,
    comments: []
  };
}

async function getProjectForInvoice(connection, { projectId, projectKey }) {
  if (projectId) {
    const [rows] = await connection.query(
      `SELECT id, project_key, project_name, project_number, project_account_number
       FROM projects
       WHERE id = ?
       LIMIT 1`,
      [Number(projectId)]
    );
    return rows[0] || null;
  }

  if (projectKey) {
    const [rows] = await connection.query(
      `SELECT id, project_key, project_name, project_number, project_account_number
       FROM projects
       WHERE project_key = ?
       LIMIT 1`,
      [String(projectKey)]
    );
    return rows[0] || null;
  }

  return null;
}

async function getInvoiceEntries(connection, { userId, projectId, timesheetEntryIds }) {
  if (!Array.isArray(timesheetEntryIds) || timesheetEntryIds.length === 0) {
    return [];
  }

  const normalizedIds = timesheetEntryIds
    .map((value) => Number(value))
    .filter((value) => Number.isInteger(value) && value > 0);

  if (normalizedIds.length === 0) {
    return [];
  }

  const [rows] = await connection.query(
    `SELECT t.id, t.issue_key, t.work_date, t.hours, t.description,
            COALESCE(j.issue_key, t.issue_key, '') AS resolved_issue_key,
            COALESCE(j.summary, '') AS issue_summary
     FROM timesheet_entries t
     LEFT JOIN jira_issues j ON j.id = t.jira_issue_ref_id
     WHERE t.contractor_user_id = ?
       AND t.project_id = ?
       AND t.id IN (?)
     ORDER BY t.work_date ASC, t.issue_key ASC, t.id ASC`,
    [userId, projectId, normalizedIds]
  );

  return rows;
}

async function getNextInvoiceSequence(connection, projectKey) {
  const likePattern = `%-${projectKey}`;
  const [rows] = await connection.query(
    `SELECT invoice_number
     FROM invoices
     WHERE invoice_number LIKE ?`,
    [likePattern]
  );

  let maxSequence = 0;

  for (const row of rows) {
    const value = String(row.invoice_number || '');
    if (!value.endsWith(`-${projectKey}`)) {
      continue;
    }

    const parts = value.split('-');
    const sequencePart = parts.slice(0, -1).join('-');
    if (!/^\d+$/.test(sequencePart)) {
      continue;
    }

    maxSequence = Math.max(maxSequence, Number(sequencePart));
  }

  return maxSequence + 1;
}

function buildInvoiceItemDescription(entry) {
  const issueKey = entry.resolved_issue_key || entry.issue_key || '';
  const issueSummary = String(entry.issue_summary || '').trim();
  return [issueKey, issueSummary].filter(Boolean).join(' - ') || 'Worklog';
}

function groupEntriesIntoInvoiceItems(entries, effectiveRate) {
  const grouped = new Map();

  for (const entry of entries) {
    const issueKey = entry.resolved_issue_key || entry.issue_key || '';
    const issueSummary = String(entry.issue_summary || '').trim();
    const groupKey = `${issueKey}::${issueSummary}`;
    const quantity = Number(entry.hours || 0);

    if (!grouped.has(groupKey)) {
      grouped.set(groupKey, {
        timesheetEntryId: entry.id,
        issueKey,
        issueSummary,
        label: buildInvoiceItemDescription(entry),
        quantity: 0
      });
    }

    const item = grouped.get(groupKey);
    item.quantity = Number((item.quantity + quantity).toFixed(2));
  }

  return [...grouped.values()]
    .map((item) => ({
      ...item,
      amount: Number((item.quantity * effectiveRate).toFixed(2))
    }))
    .sort((a, b) => {
      const issueKeyCompare = String(a.issueKey || '').localeCompare(String(b.issueKey || ''));
      if (issueKeyCompare !== 0) {
        return issueKeyCompare;
      }

      return String(a.issueSummary || '').localeCompare(String(b.issueSummary || ''));
    });
}

function groupInvoiceWorklogs(items) {
  const grouped = new Map();

  for (const item of items) {
    const issueKey = item.issueKey || '';
    const issueSummary = String(item.issueSummary || '').trim();
    const groupKey = `${issueKey}::${issueSummary}`;

    if (!grouped.has(groupKey)) {
      grouped.set(groupKey, {
        issueKey,
        issueSummary,
        description: '',
        label: [issueKey, issueSummary].filter(Boolean).join(' - ') || item.label || item.description || 'Worklog',
        quantity: 0,
        amount: 0
      });
    }

    const groupedItem = grouped.get(groupKey);
    groupedItem.quantity = Number((groupedItem.quantity + Number(item.quantity || 0)).toFixed(2));
    groupedItem.amount = Number((groupedItem.amount + Number(item.amount || 0)).toFixed(2));
  }

  return [...grouped.values()].sort((a, b) => {
    const issueKeyCompare = String(a.issueKey || '').localeCompare(String(b.issueKey || ''));
    if (issueKeyCompare !== 0) {
      return issueKeyCompare;
    }

    return String(a.issueSummary || '').localeCompare(String(b.issueSummary || ''));
  });
}

async function getInvoiceById(invoiceId) {
  const [invoiceRows] = await db.query(
    `SELECT i.id, i.invoice_number, i.contractor_id, u.full_name AS contractor_name,
            i.project_name, i.project_key_snapshot, i.project_number_snapshot,
            i.project_account_number_snapshot, i.start_date, i.end_date, i.total_hours, i.rate,
            i.amount, i.status, i.pdf_path, i.created_at, i.payee_name_snapshot,
            i.payee_email_snapshot, i.payment_method_snapshot, i.payment_currency_snapshot,
            i.remittance_email_snapshot, i.bank_account_title_snapshot,
            i.bank_account_last4_snapshot, i.bank_name_snapshot
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

async function getInvoiceDetailById(connection, invoiceId) {
  const [invoiceRows] = await connection.query(
    `SELECT i.id, i.invoice_number, i.contractor_id, u.full_name AS contractor_name,
            u.email AS contractor_email, i.project_name, i.project_key_snapshot, i.project_number_snapshot,
            i.project_account_number_snapshot, i.start_date, i.end_date, i.total_hours, i.rate,
            i.amount, i.status, i.pdf_path, i.created_at, i.payee_name_snapshot, i.payee_email_snapshot,
            i.payee_address_line1_snapshot, i.payee_address_line2_snapshot, i.payee_city_snapshot,
            i.payee_state_snapshot, i.payee_postal_code_snapshot, i.payee_country_snapshot,
            i.payment_method_snapshot, i.payment_currency_snapshot, i.remittance_email_snapshot,
            i.bank_account_title_snapshot, i.bank_routing_number_snapshot, i.bank_account_number_snapshot,
            i.bank_account_last4_snapshot, i.bank_account_type_snapshot, i.bank_name_snapshot,
            i.bank_address_line1_snapshot, i.bank_address_line2_snapshot, i.bank_city_snapshot,
            i.bank_state_snapshot, i.bank_postal_code_snapshot, i.bank_country_snapshot
     FROM invoices i
     JOIN users u ON u.id = i.contractor_id
     WHERE i.id = ?
     LIMIT 1`,
    [invoiceId]
  );

  if (!invoiceRows[0]) {
    return null;
  }

  const invoiceRow = invoiceRows[0];
  const [itemRows] = await connection.query(
    `SELECT ii.id, ii.description, ii.quantity, ii.unit_rate, ii.amount,
            COALESCE(ji.issue_key, te.issue_key, '') AS issue_key,
            COALESCE(ji.summary, '') AS issue_summary
     FROM invoice_items ii
     LEFT JOIN timesheet_entries te ON te.id = ii.timesheet_entry_id
     LEFT JOIN jira_issues ji ON ji.id = te.jira_issue_ref_id
     WHERE ii.invoice_id = ?
     ORDER BY ii.id ASC`,
    [invoiceId]
  );

  const [commentRows] = await connection.query(
    `SELECT c.id, c.comment_text AS comment, c.created_at AS at, c.user_id,
            u.full_name AS actor
     FROM comments c
     LEFT JOIN users u ON u.id = c.user_id
     WHERE c.invoice_id = ?
     ORDER BY c.created_at ASC`,
    [invoiceId]
  );

  return {
    id: invoiceRow.id,
    invoiceNumber: invoiceRow.invoice_number,
    contractorId: invoiceRow.contractor_id,
    contractorName: invoiceRow.contractor_name,
    contractorEmail: invoiceRow.contractor_email,
    projectKey: invoiceRow.project_key_snapshot || null,
    projectName: invoiceRow.project_name,
    projectNumber: invoiceRow.project_number_snapshot || null,
    projectAccountNumber: invoiceRow.project_account_number_snapshot || null,
    startDate: invoiceRow.start_date,
    endDate: invoiceRow.end_date,
    totalHours: Number(invoiceRow.total_hours),
    rate: Number(invoiceRow.rate),
    amount: Number(invoiceRow.amount),
    status: STATUS_DB_TO_LABEL[invoiceRow.status] || invoiceRow.status,
    statusCode: invoiceRow.status,
    pdfPath: invoiceRow.pdf_path,
    createdAt: invoiceRow.created_at,
    items: groupInvoiceWorklogs(
      itemRows.map((item) => ({
        issueKey: item.issue_key,
        issueSummary: item.issue_summary,
        description: item.description,
        quantity: Number(item.quantity),
        unitRate: Number(item.unit_rate),
        amount: Number(item.amount)
      }))
    ).map((item) => ({
      issueKey: item.issueKey,
      issueSummary: item.issueSummary,
      quantity: Number(item.quantity),
      unitRate: Number(invoiceRow.rate),
      amount: Number(item.amount),
      label: item.label
    })),
    payoutDetails: {
      payeeName: invoiceRow.payee_name_snapshot,
      payeeEmail: invoiceRow.payee_email_snapshot,
      payeeAddressLine1: invoiceRow.payee_address_line1_snapshot,
      payeeAddressLine2: invoiceRow.payee_address_line2_snapshot,
      payeeCity: invoiceRow.payee_city_snapshot,
      payeeState: invoiceRow.payee_state_snapshot,
      payeePostalCode: invoiceRow.payee_postal_code_snapshot,
      payeeCountry: invoiceRow.payee_country_snapshot,
      paymentMethod: invoiceRow.payment_method_snapshot,
      paymentCurrency: invoiceRow.payment_currency_snapshot,
      remittanceEmail: invoiceRow.remittance_email_snapshot,
      bankAccountTitle: invoiceRow.bank_account_title_snapshot,
      bankRoutingNumber: invoiceRow.bank_routing_number_snapshot,
      bankAccountNumber: invoiceRow.bank_account_number_snapshot,
      bankAccountLast4: invoiceRow.bank_account_last4_snapshot,
      bankAccountType: invoiceRow.bank_account_type_snapshot,
      bankName: invoiceRow.bank_name_snapshot,
      bankAddressLine1: invoiceRow.bank_address_line1_snapshot,
      bankAddressLine2: invoiceRow.bank_address_line2_snapshot,
      bankCity: invoiceRow.bank_city_snapshot,
      bankState: invoiceRow.bank_state_snapshot,
      bankPostalCode: invoiceRow.bank_postal_code_snapshot,
      bankCountry: invoiceRow.bank_country_snapshot
    },
    comments: commentRows.map((row) => ({
      id: row.id,
      comment: row.comment,
      actor: row.actor || `User#${row.user_id || 'N/A'}`,
      at: row.at
    }))
  };
}

async function getInvoicePdfPayload(connection, invoiceId) {
  const [invoiceRows] = await connection.query(
    `SELECT i.id, i.invoice_number, i.project_name, i.project_key_snapshot, i.project_number_snapshot,
            i.project_account_number_snapshot, i.start_date, i.end_date, i.total_hours, i.rate,
            i.amount, i.status, i.payee_name_snapshot, i.payee_email_snapshot,
            i.payee_address_line1_snapshot, i.payee_address_line2_snapshot, i.payee_city_snapshot,
            i.payee_state_snapshot, i.payee_postal_code_snapshot, i.payee_country_snapshot,
            i.payment_method_snapshot, i.payment_currency_snapshot, i.remittance_email_snapshot,
            i.bank_account_title_snapshot, i.bank_routing_number_snapshot,
            i.bank_account_number_snapshot, i.bank_account_last4_snapshot,
            i.bank_account_type_snapshot, i.bank_name_snapshot, i.bank_address_line1_snapshot,
            i.bank_address_line2_snapshot, i.bank_city_snapshot, i.bank_state_snapshot,
            i.bank_postal_code_snapshot, i.bank_country_snapshot,
            u.full_name AS contractor_name, u.email AS contractor_email
     FROM invoices i
     JOIN users u ON u.id = i.contractor_id
     WHERE i.id = ?
     LIMIT 1`,
    [invoiceId]
  );

  if (!invoiceRows[0]) {
    return null;
  }

  const invoiceRow = invoiceRows[0];
  const [itemRows] = await connection.query(
    `SELECT ii.id, ii.description, ii.quantity, ii.amount,
            COALESCE(ji.issue_key, te.issue_key, '') AS issue_key,
            COALESCE(ji.summary, '') AS issue_summary
     FROM invoice_items ii
     LEFT JOIN timesheet_entries te ON te.id = ii.timesheet_entry_id
     LEFT JOIN jira_issues ji ON ji.id = te.jira_issue_ref_id
     WHERE ii.invoice_id = ?
     ORDER BY ii.id ASC`,
    [invoiceId]
  );

  return {
    invoiceNumber: invoiceRow.invoice_number,
    contractorName: invoiceRow.contractor_name,
    contractorEmail: invoiceRow.contractor_email,
    projectKey: invoiceRow.project_key_snapshot,
    projectName: invoiceRow.project_name,
    projectNumber: invoiceRow.project_number_snapshot,
    projectAccountNumber: invoiceRow.project_account_number_snapshot,
    startDate: invoiceRow.start_date,
    endDate: invoiceRow.end_date,
    totalHours: Number(invoiceRow.total_hours),
    rate: Number(invoiceRow.rate),
    amount: Number(invoiceRow.amount),
    status: STATUS_DB_TO_LABEL[invoiceRow.status] || invoiceRow.status,
    worklogs: groupInvoiceWorklogs(
      itemRows.map((item) => ({
        issueKey: item.issue_key,
        issueSummary: item.issue_summary,
        description: '',
        label: [item.issue_key, item.issue_summary].filter(Boolean).join(' - ') || item.description,
        quantity: Number(item.quantity),
        amount: Number(item.amount)
      }))
    ),
    payoutDetails: {
      payeeName: invoiceRow.payee_name_snapshot,
      payeeEmail: invoiceRow.payee_email_snapshot,
      payeeAddressLine1: invoiceRow.payee_address_line1_snapshot,
      payeeAddressLine2: invoiceRow.payee_address_line2_snapshot,
      payeeCity: invoiceRow.payee_city_snapshot,
      payeeState: invoiceRow.payee_state_snapshot,
      payeePostalCode: invoiceRow.payee_postal_code_snapshot,
      payeeCountry: invoiceRow.payee_country_snapshot,
      paymentMethod: invoiceRow.payment_method_snapshot,
      paymentCurrency: invoiceRow.payment_currency_snapshot,
      remittanceEmail: invoiceRow.remittance_email_snapshot,
      bankAccountTitle: invoiceRow.bank_account_title_snapshot,
      bankRoutingNumber: invoiceRow.bank_routing_number_snapshot,
      bankAccountNumber: invoiceRow.bank_account_number_snapshot,
      bankAccountLast4: invoiceRow.bank_account_last4_snapshot,
      bankAccountType: invoiceRow.bank_account_type_snapshot,
      bankName: invoiceRow.bank_name_snapshot,
      bankAddressLine1: invoiceRow.bank_address_line1_snapshot,
      bankAddressLine2: invoiceRow.bank_address_line2_snapshot,
      bankCity: invoiceRow.bank_city_snapshot,
      bankState: invoiceRow.bank_state_snapshot,
      bankPostalCode: invoiceRow.bank_postal_code_snapshot,
      bankCountry: invoiceRow.bank_country_snapshot
    }
  };
}

const syncAndCreateInvoice = async (req, res) => {
  const connection = await db.getConnection();
  let transactionStarted = false;

  try {
    const { projectId, projectKey, startDate, endDate, rate, timesheetEntryIds } = req.body || {};

    if (!req.user?.id) {
      return res.status(401).json({ message: 'Unauthorized' });
    }

    if (!startDate || !endDate) {
      return res.status(400).json({ message: 'startDate and endDate are required' });
    }

    if (!Array.isArray(timesheetEntryIds) || timesheetEntryIds.length === 0) {
      return res.status(400).json({ message: 'timesheetEntryIds are required for invoice creation' });
    }

    const project = await getProjectForInvoice(connection, { projectId, projectKey });
    if (!project) {
      return res.status(404).json({ message: 'Project not found for invoice creation' });
    }

    const [userRows] = await connection.query(
      'SELECT id, full_name, email FROM users WHERE id = ? LIMIT 1',
      [req.user.id]
    );

    if (!userRows[0]) {
      return res.status(401).json({ message: 'Authenticated user not found in database' });
    }

    const contractor = userRows[0];
    const profileRow = await getUserProfileRow(contractor.id, connection);
    const effectiveRate =
      rate === undefined || rate === null || rate === ''
        ? Number(profileRow?.hourly_rate_usd ?? 0)
        : Number(rate);

    if (!Number.isFinite(effectiveRate) || effectiveRate <= 0) {
      return res.status(400).json({ message: 'A valid hourly rate is required to create an invoice' });
    }

    const entries = await getInvoiceEntries(connection, {
      userId: contractor.id,
      projectId: project.id,
      timesheetEntryIds
    });

    if (entries.length === 0) {
      return res.status(400).json({ message: 'No visible synced timelogs found for this project selection' });
    }

    if (entries.length !== timesheetEntryIds.length) {
      return res.status(400).json({
        message: 'Some selected timelogs do not belong to the current user/project and were rejected'
      });
    }

    const [existingInvoices] = await connection.query(
      `SELECT id, invoice_number
       FROM invoices
       WHERE contractor_id = ?
         AND project_key_snapshot = ?
         AND start_date = ?
         AND end_date = ?
       LIMIT 1`,
      [contractor.id, project.project_key, startDate, endDate]
    );

    if (existingInvoices[0]) {
      return res.status(409).json({
        message: 'Invoice already exists for this project and date range',
        invoiceNumber: existingInvoices[0].invoice_number
      });
    }

    const totalHours = Number(
      entries.reduce((sum, entry) => sum + Number(entry.hours || 0), 0).toFixed(2)
    );
    const amount = Number((totalHours * effectiveRate).toFixed(2));
    const sequence = await getNextInvoiceSequence(connection, project.project_key || 'PROJECT');
    const invoiceNumber = `${sequence}-${project.project_key || 'PROJECT'}`;

    const lineItems = groupEntriesIntoInvoiceItems(entries, effectiveRate);

    const payoutDetails = buildInvoiceSnapshot({ user: contractor, profileRow });
    const draftInvoice = {
      invoiceNumber,
      contractorName: contractor.full_name,
      contractorEmail: contractor.email,
      projectKey: project.project_key,
      projectName: project.project_name,
      projectNumber: project.project_number,
      projectAccountNumber: project.project_account_number,
      startDate,
      endDate,
      totalHours,
      rate: effectiveRate,
      amount,
      status: STATUS_DB_TO_LABEL.DRAFT,
      worklogs: lineItems,
      payoutDetails
    };

    const pdf = await generateInvoicePdf(draftInvoice);

    await connection.beginTransaction();
    transactionStarted = true;

    const [invoiceResult] = await connection.query(
      `INSERT INTO invoices
      (invoice_number, contractor_id, project_name, project_key_snapshot, project_number_snapshot,
       project_account_number_snapshot, start_date, end_date, total_hours, rate, amount, status,
       pdf_path, payee_name_snapshot, payee_email_snapshot, payee_address_line1_snapshot,
       payee_address_line2_snapshot, payee_city_snapshot, payee_state_snapshot,
       payee_postal_code_snapshot, payee_country_snapshot, payment_method_snapshot,
       payment_currency_snapshot, remittance_email_snapshot, bank_account_title_snapshot,
       bank_routing_number_snapshot, bank_account_number_snapshot, bank_account_last4_snapshot,
       bank_account_type_snapshot, bank_name_snapshot, bank_address_line1_snapshot,
       bank_address_line2_snapshot, bank_city_snapshot, bank_state_snapshot,
       bank_postal_code_snapshot, bank_country_snapshot)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        invoiceNumber,
        contractor.id,
        project.project_name,
        project.project_key,
        project.project_number,
        project.project_account_number,
        startDate,
        endDate,
        totalHours,
        effectiveRate,
        amount,
        'DRAFT',
        `pdfs/${pdf.fileName}`,
        payoutDetails.payeeName,
        payoutDetails.payeeEmail,
        payoutDetails.payeeAddressLine1,
        payoutDetails.payeeAddressLine2,
        payoutDetails.payeeCity,
        payoutDetails.payeeState,
        payoutDetails.payeePostalCode,
        payoutDetails.payeeCountry,
        payoutDetails.paymentMethod,
        payoutDetails.paymentCurrency,
        payoutDetails.remittanceEmail,
        payoutDetails.bankAccountTitle,
        payoutDetails.bankRoutingNumber,
        payoutDetails.bankAccountNumber,
        payoutDetails.bankAccountLast4,
        payoutDetails.bankAccountType,
        payoutDetails.bankName,
        payoutDetails.bankAddressLine1,
        payoutDetails.bankAddressLine2,
        payoutDetails.bankCity,
        payoutDetails.bankState,
        payoutDetails.bankPostalCode,
        payoutDetails.bankCountry
      ]
    );

    const invoiceId = invoiceResult.insertId;

    for (const item of lineItems) {
      await connection.query(
        `INSERT INTO invoice_items
         (invoice_id, timesheet_entry_id, description, quantity, unit_rate, amount)
         VALUES (?, ?, ?, ?, ?, ?)`,
        [invoiceId, item.timesheetEntryId, item.label, item.quantity, effectiveRate, item.amount]
      );
    }

    await connection.query(
      'INSERT INTO audit_logs (user_id, action, metadata) VALUES (?, ?, ?)',
      [
        contractor.id,
        'INVOICE_CREATED',
        JSON.stringify({
          invoiceId,
          invoiceNumber,
          projectId: project.id,
          projectKey: project.project_key,
          startDate,
          endDate
        })
      ]
    );

    await connection.commit();
    transactionStarted = false;

    const invoice = await getInvoiceById(invoiceId);
    return res.status(201).json({ invoice });
  } catch (error) {
    if (transactionStarted) {
      await connection.rollback();
    }
    logger.error('Error in syncAndCreateInvoice:', error);
    return res.status(500).json({
      message: 'Failed to create invoice from synced timelogs',
      error: error.message
    });
  } finally {
    connection.release();
  }
};

const listInvoices = async (req, res) => {
  try {
    const conditions = [];
    const params = [];

    if (req.query.mine === 'true') {
      conditions.push('i.contractor_id = ?');
      params.push(req.user.id);
    }

    const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';
    const [rows] = await db.query(
        `SELECT i.id, i.invoice_number, i.contractor_id, u.full_name AS contractor_name,
              i.project_name, i.project_key_snapshot, i.project_number_snapshot,
              i.project_account_number_snapshot, i.start_date, i.end_date, i.total_hours,
              i.rate, i.amount, i.status, i.pdf_path, i.created_at, i.payee_name_snapshot,
              i.payee_email_snapshot, i.payment_method_snapshot, i.payment_currency_snapshot,
              i.remittance_email_snapshot, i.bank_account_title_snapshot,
              i.bank_account_last4_snapshot, i.bank_name_snapshot
       FROM invoices i
       JOIN users u ON u.id = i.contractor_id
       ${whereClause}
       ORDER BY i.created_at DESC`,
      params
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

const getInvoiceDetail = async (req, res) => {
  const connection = await db.getConnection();

  try {
    const invoiceId = Number(req.params.id);
    if (!Number.isInteger(invoiceId) || invoiceId <= 0) {
      return res.status(400).json({ message: 'Invalid invoice id' });
    }

    const [invoiceRows] = await connection.query(
      'SELECT id, contractor_id FROM invoices WHERE id = ? LIMIT 1',
      [invoiceId]
    );

    if (!invoiceRows[0]) {
      return res.status(404).json({ message: 'Invoice not found' });
    }

    const invoice = invoiceRows[0];
    const canAccess = Number(invoice.contractor_id) === Number(req.user.id) || ['PM', 'FINANCE', 'ADMIN'].includes(req.user.role);
    if (!canAccess) {
      return res.status(403).json({ message: 'You do not have access to this invoice' });
    }

    const detail = await getInvoiceDetailById(connection, invoiceId);
    return res.json({ invoice: detail });
  } catch (error) {
    return res.status(500).json({ message: 'Failed to fetch invoice', error: error.message });
  } finally {
    connection.release();
  }
};

const submitInvoiceForApproval = async (req, res) => {
  const connection = await db.getConnection();
  let transactionStarted = false;

  try {
    const invoiceId = Number(req.params.id);
    if (!Number.isInteger(invoiceId) || invoiceId <= 0) {
      return res.status(400).json({ message: 'Invalid invoice id' });
    }

    const [invoiceRows] = await connection.query(
      'SELECT id, contractor_id, status FROM invoices WHERE id = ? LIMIT 1',
      [invoiceId]
    );

    if (!invoiceRows[0]) {
      return res.status(404).json({ message: 'Invoice not found' });
    }

    const invoice = invoiceRows[0];
    if (Number(invoice.contractor_id) !== Number(req.user.id)) {
      return res.status(403).json({ message: 'You can only submit your own invoices' });
    }

    if (invoice.status !== 'DRAFT') {
      return res.status(400).json({ message: 'Only draft invoices can be submitted for approval' });
    }

    await connection.beginTransaction();
    transactionStarted = true;

    await connection.query('UPDATE invoices SET status = ? WHERE id = ?', ['PENDING_PM', invoiceId]);
    await connection.query(
      `INSERT INTO approvals (invoice_id, current_level, status)
       VALUES (?, 1, 'PENDING')
       ON DUPLICATE KEY UPDATE current_level = VALUES(current_level), status = VALUES(status)`,
      [invoiceId]
    );

    await connection.query(
      'INSERT INTO audit_logs (user_id, action, metadata) VALUES (?, ?, ?)',
      [req.user.id, 'INVOICE_SUBMITTED_FOR_APPROVAL', JSON.stringify({ invoiceId })]
    );

    await connection.commit();
    transactionStarted = false;

    const updatedInvoice = await getInvoiceById(invoiceId);
    return res.json({ invoice: updatedInvoice });
  } catch (error) {
    if (transactionStarted) {
      await connection.rollback();
    }
    return res.status(500).json({ message: 'Failed to submit invoice for approval', error: error.message });
  } finally {
    connection.release();
  }
};

const regenerateInvoicePdf = async (req, res) => {
  const connection = await db.getConnection();

  try {
    const invoiceId = Number(req.params.id);

    if (!Number.isInteger(invoiceId) || invoiceId <= 0) {
      return res.status(400).json({ message: 'Invalid invoice id' });
    }

    const [invoiceRows] = await connection.query(
      'SELECT id, contractor_id FROM invoices WHERE id = ? LIMIT 1',
      [invoiceId]
    );

    if (!invoiceRows[0]) {
      return res.status(404).json({ message: 'Invoice not found' });
    }

    const invoice = invoiceRows[0];
    const canAccess = invoice.contractor_id === req.user.id || ['PM', 'FINANCE', 'ADMIN'].includes(req.user.role);
    if (!canAccess) {
      return res.status(403).json({ message: 'You do not have access to regenerate this invoice PDF' });
    }

    const payload = await getInvoicePdfPayload(connection, invoiceId);
    const pdf = await generateInvoicePdf(payload);

    await connection.query('UPDATE invoices SET pdf_path = ? WHERE id = ?', [`pdfs/${pdf.fileName}`, invoiceId]);
    await connection.query(
      'INSERT INTO audit_logs (user_id, action, metadata) VALUES (?, ?, ?)',
      [req.user.id, 'INVOICE_PDF_REGENERATED', JSON.stringify({ invoiceId, invoiceNumber: payload.invoiceNumber })]
    );

    const updatedInvoice = await getInvoiceById(invoiceId);
    return res.json({ invoice: updatedInvoice });
  } catch (error) {
    return res.status(500).json({ message: 'Failed to regenerate invoice PDF', error: error.message });
  } finally {
    connection.release();
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

    const approvalStatus =
      statusCode === 'REJECTED_PM' ? 'REJECTED' : statusCode === 'PENDING_PM' ? 'PENDING' : 'APPROVED';
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
      const stepStatus =
        statusCode === 'REJECTED_PM' ? 'REJECTED' : statusCode === 'PENDING_PM' ? 'PENDING' : 'APPROVED';

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
  getInvoiceDetail,
  updateInvoiceStatus,
  regenerateInvoicePdf,
  submitInvoiceForApproval
};
