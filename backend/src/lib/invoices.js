// lib/invoices.js - Invoice and Billing System (CommonJS)
const db = require('../config/database.js');
const fs = require('fs');

const GLOBAL_SETTINGS_PATH = './global-billing.json';

async function getGlobalSettings() {
  try {
    const settingsPath = GLOBAL_SETTINGS_PATH;
    let settings = { billingDay: 1, gracePeriodDays: 2 };
    if (fs.existsSync(settingsPath)) {
      settings = JSON.parse(fs.readFileSync(settingsPath, 'utf8'));
    }
    return settings;
  } catch (error) {
    console.error('[Invoice] Error loading global settings:', error);
    return { billingDay: 1, gracePeriodDays: 2 };
  }
}

async function generateInitialInvoices(studentId) {
  const settings = await getGlobalSettings();
  const enrollments = await db.query(`
    SELECT e.*, c.title as course_title, cp.initial_payment, cp.is_active
    FROM enrollments e
    JOIN courses c ON e.course_id = c.id
    LEFT JOIN course_pricing cp ON c.id = cp.course_id
    WHERE e.student_id = ?
  `, [studentId]);

  for (const enrollment of enrollments) {
    if (!enrollment.initial_payment || !enrollment.is_active) continue;

    const existing = await db.getOne(`
      SELECT id FROM invoices 
      WHERE student_id = ? AND course_id = ? AND type = 'initial'
    `, [studentId, enrollment.course_id]);

    if (!existing) {
      const dueDate = new Date();
      dueDate.setDate(dueDate.getDate() + 7);
      const gracePeriodEnd = new Date(dueDate);
      gracePeriodEnd.setDate(gracePeriodEnd.getDate() + settings.gracePeriodDays);

      await db.insert('invoices', {
        student_id: studentId,
        course_id: enrollment.course_id,
        type: 'initial',
        amount: enrollment.initial_payment,
        status: 'pending',
        due_date: dueDate,
        grace_period_end: gracePeriodEnd
      });
      console.log(`[Invoice] Created initial invoice for student ${studentId}, course ${enrollment.course_id}`);
    }
  }
}

async function checkAndUpdateInvoiceStatuses() {
  const settings = await getGlobalSettings();
  const now = new Date();

  const overdueInvoices = await db.query(`
    SELECT id, student_id FROM invoices 
    WHERE status = 'pending' AND grace_period_end < ?
  `, [now]);

  for (const invoice of overdueInvoices) {
    await db.update('invoices', invoice.id, {
      status: 'locked',
      locked_at: now
    });
    console.log(`[Invoice] Invoice ${invoice.id} marked as locked, student ${invoice.student_id} locked out`);
  }
}

async function generateMonthlyInvoices() {
  const settings = await getGlobalSettings();
  const billingDay = settings.billingDay;
  const today = new Date();

  const enrollments = await db.query(`
    SELECT e.*, cp.monthly_amount, cp.billing_duration, cp.is_active
    FROM enrollments e
    LEFT JOIN course_pricing cp ON e.course_id = cp.course_id
    WHERE cp.is_active = 1 AND cp.monthly_amount > 0
  `);

  for (const enrollment of enrollments) {
    if (!enrollment.monthly_amount) continue;

    const billingDuration = enrollment.billing_duration || 1;
    const existingMonthly = await db.query(`
      SELECT id FROM invoices 
      WHERE student_id = ? AND course_id = ? AND type = 'monthly'
      ORDER BY created_at ASC
    `, [enrollment.student_id, enrollment.course_id]);

    if (existingMonthly.length >= billingDuration) continue;

    const startOfMonth = new Date(today.getFullYear(), today.getMonth(), 1);
    const alreadyBilled = existingMonthly.find(inv => new Date(inv.created_at) >= startOfMonth);
    if (alreadyBilled) continue;

    let dueDate = new Date(today.getFullYear(), today.getMonth(), billingDay);
    if (today.getDate() > billingDay) {
      dueDate = new Date(today.getFullYear(), today.getMonth() + 1, billingDay);
    }

    const gracePeriodEnd = new Date(dueDate);
    gracePeriodEnd.setDate(gracePeriodEnd.getDate() + settings.gracePeriodDays);

    await db.insert('invoices', {
      student_id: enrollment.student_id,
      course_id: enrollment.course_id,
      type: 'monthly',
      month_number: existingMonthly.length + 1,
      amount: enrollment.monthly_amount,
      status: 'pending',
      due_date: dueDate,
      grace_period_end: gracePeriodEnd,
      last_billed_at: today
    });
  }
}

async function isStudentLocked(studentId) {
  // Check if student has any paid (non-free) enrollments first
  const paidEnrollments = await db.query(`
    SELECT e.id FROM enrollments e
    JOIN courses c ON e.course_id = c.id
    WHERE e.student_id = ? AND (c.is_free = 0 OR c.is_free IS NULL)
  `, [studentId]);

  // If only enrolled in free courses, never locked
  if (paidEnrollments.length === 0) return false;

  // If has paid course enrollments, check for locked invoices
  const invoice = await db.getOne(`
    SELECT id FROM invoices 
    WHERE student_id = ? AND status = 'locked'
  `, [studentId]);
  return !!invoice;
}

async function getStudentInvoices(studentId) {
  return await db.query(`
    SELECT i.*, c.title as course_title
    FROM invoices i
    JOIN courses c ON i.course_id = c.id
    WHERE i.student_id = ?
    ORDER BY i.created_at DESC
  `, [studentId]);
}

async function getInvoiceById(invoiceId) {
  return await db.getOne(`
    SELECT i.*, c.title as course_title, u.full_name as student_name, u.email as student_email
    FROM invoices i
    JOIN courses c ON i.course_id = c.id
    JOIN users u ON i.student_id = u.id
    WHERE i.id = ?
  `, [invoiceId]);
}

async function markInvoicePaid(invoiceId, paymentData) {
  const invoice = await db.getOne('SELECT * FROM invoices WHERE id = ?', [invoiceId]);
  if (!invoice) return;

  await db.update('invoices', invoiceId, {
    status: 'paid',
    paid_at: new Date(),
    payment_method: paymentData.method || 'mpesa',
    transaction_id: paymentData.transactionId || null,
    mpesa_receipt: paymentData.receiptNumber || null
  });

  const studentId = invoice.student_id;

  // If this is an initial (deposit) payment, generate monthly invoices
  if (invoice.type === 'initial' || invoice.type === 'deposit') {
    await generateMonthlyInvoices();
  }

  const hasUnpaid = await db.getOne(`
    SELECT id FROM invoices 
    WHERE student_id = ? AND status IN ('pending', 'locked')
  `, [studentId]);

  if (!hasUnpaid) {
    await db.query('UPDATE users SET is_locked = 0 WHERE id = ?', [studentId]);
  }
}

async function createInvoice(data) {
  return await db.insert('invoices', {
    student_id: data.studentId,
    course_id: data.courseId,
    type: data.type || 'initial',
    amount: data.amount,
    status: 'pending',
    due_date: data.dueDate || new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
    grace_period_end: data.gracePeriodEnd || new Date(Date.now() + 14 * 24 * 60 * 60 * 1000)
  });
}

async function markDepositAndMonthsPaid(invoiceId, monthsPaid, paymentData) {
  const invoice = await db.getOne('SELECT * FROM invoices WHERE id = ?', [invoiceId]);
  if (!invoice) return;

  await markInvoicePaid(invoiceId, paymentData);

  if (monthsPaid > 0 && (invoice.type === 'initial' || invoice.type === 'deposit')) {
    const monthlyInvoices = await db.query(`
      SELECT id FROM invoices 
      WHERE student_id = ? AND course_id = ? AND type = 'monthly' AND status = 'pending'
      ORDER BY month_number ASC
      LIMIT ?
    `, [invoice.student_id, invoice.course_id, monthsPaid]);

    for (const mi of monthlyInvoices) {
      await db.update('invoices', mi.id, {
        status: 'paid',
        paid_at: new Date(),
        payment_method: paymentData.method || 'mpesa',
        transaction_id: paymentData.transactionId || null,
        mpesa_receipt: paymentData.receiptNumber || null
      });
    }
  }

  const hasUnpaid = await db.getOne(`
    SELECT id FROM invoices 
    WHERE student_id = ? AND status IN ('pending', 'locked')
  `, [invoice.student_id]);

  if (!hasUnpaid) {
    await db.query('UPDATE users SET is_locked = 0 WHERE id = ?', [invoice.student_id]);
  }
}

module.exports = {
  getGlobalSettings,
  generateInitialInvoices,
  checkAndUpdateInvoiceStatuses,
  generateMonthlyInvoices,
  isStudentLocked,
  getStudentInvoices,
  getInvoiceById,
  markInvoicePaid,
  markDepositAndMonthsPaid,
  createInvoice
};
