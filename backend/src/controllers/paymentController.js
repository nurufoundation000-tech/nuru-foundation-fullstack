// controllers/paymentController.js - Payment Submission & Verification (CommonJS)
const db = require('../config/database.js');
const { markDepositAndMonthsPaid, markInvoicePaid } = require('../lib/invoices.js');

async function submitTransaction(req, res) {
  try {
    const { invoiceId, transactionId, months, amount, phoneNumber } = req.body;
    const studentId = req.user.userId;

    if (!invoiceId || !transactionId) {
      return res.status(400).json({ error: 'Invoice ID and transaction ID are required' });
    }

    const invoice = await db.getOne(`
      SELECT i.*, c.title as course_title
      FROM invoices i
      JOIN courses c ON i.course_id = c.id
      WHERE i.id = ? AND i.student_id = ?
    `, [invoiceId, studentId]);

    if (!invoice) {
      return res.status(404).json({ error: 'Invoice not found' });
    }

    if (invoice.status === 'paid') {
      return res.status(400).json({ error: 'Invoice is already paid' });
    }

    const existing = await db.getOne(
      'SELECT id FROM payment_submissions WHERE invoice_id = ? AND status = ?',
      [invoiceId, 'pending']
    );
    if (existing) {
      return res.status(400).json({ error: 'A pending submission already exists for this invoice' });
    }

    const monthsPaid = parseInt(months) || 1;
    const totalAmount = parseFloat(amount) || invoice.amount;

    const result = await db.insert('payment_submissions', {
      student_id: studentId,
      invoice_id: invoiceId,
      course_id: invoice.course_id,
      months_paid: monthsPaid,
      amount: totalAmount,
      transaction_id: transactionId,
      phone_number: phoneNumber || '',
      status: 'pending'
    });

    res.json({
      success: true,
      submissionId: result.insertId || result,
      message: 'Payment submission received. Awaiting admin verification.'
    });
  } catch (error) {
    console.error('Submit transaction error:', error);
    res.status(500).json({ error: 'Failed to submit payment' });
  }
}

async function getMySubmissions(req, res) {
  try {
    const submissions = await db.query(`
      SELECT ps.*, c.title as course_title
      FROM payment_submissions ps
      JOIN courses c ON ps.course_id = c.id
      WHERE ps.student_id = ?
      ORDER BY ps.submitted_at DESC
    `, [req.user.userId]);

    res.json({ success: true, data: submissions });
  } catch (error) {
    console.error('Get my submissions error:', error);
    res.status(500).json({ error: 'Failed to load submissions' });
  }
}

async function getPaymentSubmissions(req, res) {
  try {
    const { status } = req.query;
    let query = `
      SELECT ps.*, 
             u.full_name as student_name, u.email as student_email, u.username,
             a.full_name as admin_name,
             c.title as course_title
      FROM payment_submissions ps
      JOIN users u ON ps.student_id = u.id
      JOIN courses c ON ps.course_id = c.id
      LEFT JOIN users a ON ps.admin_id = a.id
    `;
    const params = [];

    if (status && ['pending', 'verified', 'rejected'].includes(status)) {
      query += ' WHERE ps.status = ?';
      params.push(status);
    }

    query += ' ORDER BY ps.submitted_at DESC';

    const submissions = await db.query(query, params);
    res.json({ success: true, data: submissions });
  } catch (error) {
    console.error('Get payment submissions error:', error);
    res.status(500).json({ error: 'Failed to load payment submissions' });
  }
}

async function verifySubmission(req, res) {
  try {
    const submissionId = parseInt(req.params.id);
    const adminId = req.user.userId;

    const submission = await db.getOne(`
      SELECT ps.*, i.type as invoice_type
      FROM payment_submissions ps
      JOIN invoices i ON ps.invoice_id = i.id
      WHERE ps.id = ?
    `, [submissionId]);

    if (!submission) {
      return res.status(404).json({ error: 'Submission not found' });
    }

    if (submission.status !== 'pending') {
      return res.status(400).json({ error: `Submission is already ${submission.status}` });
    }

    const paymentData = {
      method: 'mpesa',
      transactionId: submission.transaction_id,
      receiptNumber: submission.transaction_id
    };

    if ((submission.invoice_type === 'initial' || submission.invoice_type === 'deposit') && submission.months_paid > 0) {
      await markDepositAndMonthsPaid(submission.invoice_id, submission.months_paid, paymentData);
    } else {
      await markInvoicePaid(submission.invoice_id, paymentData);
    }

    await db.query(
      'UPDATE payment_submissions SET status = ?, admin_id = ?, verified_at = NOW() WHERE id = ?',
      ['verified', adminId, submissionId]
    );

    res.json({
      success: true,
      message: 'Payment verified and invoices marked as paid.'
    });
  } catch (error) {
    console.error('Verify submission error:', error);
    res.status(500).json({ error: 'Failed to verify submission' });
  }
}

async function rejectSubmission(req, res) {
  try {
    const submissionId = parseInt(req.params.id);
    const adminId = req.user.userId;
    const { reason } = req.body;

    const submission = await db.getOne('SELECT * FROM payment_submissions WHERE id = ?', [submissionId]);

    if (!submission) {
      return res.status(404).json({ error: 'Submission not found' });
    }

    if (submission.status !== 'pending') {
      return res.status(400).json({ error: `Submission is already ${submission.status}` });
    }

    await db.query(
      'UPDATE payment_submissions SET status = ?, admin_id = ?, admin_notes = ?, verified_at = NOW() WHERE id = ?',
      ['rejected', adminId, reason || '', submissionId]
    );

    res.json({
      success: true,
      message: 'Payment submission rejected.'
    });
  } catch (error) {
    console.error('Reject submission error:', error);
    res.status(500).json({ error: 'Failed to reject submission' });
  }
}

module.exports = {
  submitTransaction,
  getMySubmissions,
  getPaymentSubmissions,
  verifySubmission,
  rejectSubmission
};
