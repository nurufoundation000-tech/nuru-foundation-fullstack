// controllers/mpesaController.js - M-Pesa Controller
import db from '../config/database.js';
import { 
  initiateSTKPush, 
  queryTransactionStatus, 
  parseCallbackPayload, 
  formatPhoneNumber,
  isMpesaConfigured,
  simulatePayment 
} from '../lib/mpesa.js';
import { markInvoicePaid, isStudentLocked, generateInitialInvoices } from '../lib/invoices.js';
import { authenticateToken } from '../middleware/auth.js';

export async function initiatePayment(req, res) {
  try {
    const { invoiceId, phoneNumber, amount } = req.body;

    if (!invoiceId || !phoneNumber) {
      return res.status(400).json({ error: 'Invoice ID and phone number are required' });
    }

    const invoice = await db.getOne(`
      SELECT i.*, c.title as course_title 
      FROM invoices i
      JOIN courses c ON i.course_id = c.id
      WHERE i.id = ? AND i.student_id = ?
    `, [invoiceId, req.user.userId]);

    if (!invoice) {
      return res.status(404).json({ error: 'Invoice not found' });
    }

    if (invoice.status !== 'pending') {
      return res.status(400).json({ error: 'Invoice is not pending' });
    }

    const paymentAmount = amount || invoice.amount;
    const formattedPhone = formatPhoneNumber(phoneNumber);

    if (!formattedPhone) {
      return res.status(400).json({ error: 'Invalid phone number format' });
    }

    if (!isMpesaConfigured()) {
      const simResult = simulatePayment(invoiceId, paymentAmount);
      return res.json({
        success: true,
        ...simResult,
        message: 'Payment simulated. In production, STK push would be sent.'
      });
    }

    const result = await initiateSTKPush(
      formattedPhone,
      paymentAmount,
      invoiceId,
      `Nuru Foundation - ${invoice.course_title}`
    );

    if (!result.success) {
      return res.status(400).json({ error: result.error });
    }

    // Store the checkout request ID with the invoice
    await db.update('invoices', invoiceId, {
      checkout_request_id: result.checkoutRequestId
    });

    res.json({
      success: true,
      checkoutRequestId: result.checkoutRequestId,
      message: 'STK push sent to your phone'
    });

  } catch (error) {
    console.error('Initiate payment error:', error);
    res.status(500).json({ error: 'Failed to initiate payment' });
  }
}

export async function handleCallback(req, res) {
  try {
    console.log('[M-Pesa] Callback received:', JSON.stringify(req.body));

    const parsed = parseCallbackPayload(req.body);

    if (!parsed.success) {
      console.log('[M-Pesa] Failed to parse callback');
      return res.status(400).json({ error: 'Invalid callback' });
    }

    if (parsed.resultCode !== 0) {
      console.log('[M-Pesa] Payment failed:', parsed.resultDesc);
      return res.status(400).json({ error: parsed.resultDesc });
    }

    // Find the invoice by checkout request ID
    const invoice = await db.getOne(`
      SELECT id, student_id, amount FROM invoices 
      WHERE checkout_request_id = ?
    `, [parsed.checkoutRequestId]);

    if (!invoice) {
      console.log('[M-Pesa] Invoice not found for checkout:', parsed.checkoutRequestId);
      return res.status(404).json({ error: 'Invoice not found' });
    }

    // Mark invoice as paid
    await markInvoicePaid(invoice.id, {
      method: 'mpesa',
      transactionId: parsed.checkoutRequestId,
      receiptNumber: parsed.receiptNumber
    });

    console.log('[M-Pesa] Invoice marked as paid:', invoice.id);

    res.json({ success: true });
  } catch (error) {
    console.error('M-Pesa callback error:', error);
    res.status(500).json({ error: 'Callback processing failed' });
  }
}

export async function checkPaymentStatus(req, res) {
  try {
    const { checkoutRequestId } = req.params;

    if (!checkoutRequestId) {
      return res.status(400).json({ error: 'Checkout request ID is required' });
    }

    if (!isMpesaConfigured()) {
      return res.json({
        success: true,
        status: 'simulated',
        message: 'Payment simulation mode'
      });
    }

    const result = await queryTransactionStatus(checkoutRequestId);

    if (!result.success) {
      return res.status(400).json({ error: result.error });
    }

    let invoiceStatus = 'pending';
    if (result.resultCode === '0') {
      invoiceStatus = 'paid';

      // Mark invoice as paid
      const invoice = await db.getOne(`
        SELECT id FROM invoices WHERE checkout_request_id = ?
      `, [checkoutRequestId]);

      if (invoice) {
        await markInvoicePaid(invoice.id, {
          method: 'mpesa',
          transactionId: checkoutRequestId,
          receiptNumber: result.mpesaReceiptNumber
        });
      }
    }

    res.json({
      success: true,
      status: invoiceStatus,
      resultCode: result.resultCode,
      resultDesc: result.resultDesc,
      mpesaReceiptNumber: result.mpesaReceiptNumber
    });

  } catch (error) {
    console.error('Check payment status error:', error);
    res.status(500).json({ error: 'Failed to check payment status' });
  }
}

export async function getConfiguration(req, res) {
  try {
    const configured = isMpesaConfigured();
    res.json({
      configured,
      environment: process.env.MPESA_ENV || 'sandbox',
      callbackUrl: process.env.MPESA_CALLBACK_URL
    });
  } catch (error) {
    console.error('Get M-Pesa config error:', error);
    res.status(500).json({ error: 'Failed to get configuration' });
  }
}

export async function simulateCallback(req, res) {
  try {
    const { invoiceId, amount } = req.body;

    if (!invoiceId) {
      return res.status(400).json({ error: 'Invoice ID is required' });
    }

    const invoice = await db.getOne('SELECT * FROM invoices WHERE id = ?', [invoiceId]);

    if (!invoice) {
      return res.status(404).json({ error: 'Invoice not found' });
    }

    await markInvoicePaid(invoiceId, {
      method: 'simulated',
      transactionId: `SIM_${Date.now()}`,
      receiptNumber: `SIM${Date.now()}`
    });

    res.json({
      success: true,
      message: 'Invoice marked as paid (simulated)'
    });
  } catch (error) {
    console.error('Simulate callback error:', error);
    res.status(500).json({ error: 'Simulation failed' });
  }
}

export default {
  initiatePayment,
  handleCallback,
  checkPaymentStatus,
  getConfiguration,
  simulateCallback
};