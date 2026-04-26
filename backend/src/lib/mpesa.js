// lib/mpesa.js - M-Pesa Integration (ES Modules)
import axios from 'axios';
import dotenv from 'dotenv';

dotenv.config();

const MPESA_CONFIG = {
  consumerKey: process.env.MPESA_CONSUMER_KEY || 'your_consumer_key',
  consumerSecret: process.env.MPESA_CONSUMER_SECRET || 'your_consumer_secret',
  shortCode: process.env.MPESA_SHORT_CODE || 'your_short_code',
  passkey: process.env.MPESA_PASSKEY || 'your_passkey',
  env: process.env.MPESA_ENV || 'sandbox',
  callbackUrl: process.env.MPESA_CALLBACK_URL || 'https://nurufoundations.com/api/mpesa/callback',
  forceSimulation: process.env.MPESA_FORCE_SIMULATION === 'true'
};

const getBaseUrl = () => {
  return MPESA_CONFIG.env === 'production'
    ? 'https://api.safaricom.co.ke'
    : 'https://sandbox.safaricom.co.ke';
};

let accessToken = null;
let tokenExpiry = null;

export async function getAccessToken() {
  if (accessToken && tokenExpiry && Date.now() < tokenExpiry) {
    return accessToken;
  }

  try {
    const auth = Buffer.from(`${MPESA_CONFIG.consumerKey}:${MPESA_CONFIG.consumerSecret}`).toString('base64');

    const response = await axios.get(`${getBaseUrl()}/oauth/v1/generate?grant_type=client_credentials`, {
      headers: {
        'Authorization': `Basic ${auth}`
      }
    });

    accessToken = response.data.access_token;
    tokenExpiry = Date.now() + (response.data.expires_in - 60) * 1000;

    return accessToken;
  } catch (error) {
    console.error('Mpesa Auth Error:', error.response?.data || error.message);
    throw new Error('Failed to get Mpesa access token');
  }
}

export async function initiateSTKPush(phone, amount, invoiceId, description = 'Nuru Foundation Payment') {
  try {
    const token = await getAccessToken();
    const now = new Date();
    const eatTime = new Date(now.getTime() + (3 * 60 * 60 * 1000));
    const timestamp = eatTime.toISOString().slice(0, 19).replace(/[-T:]/g, '');

    const payload = {
      BusinessShortCode: MPESA_CONFIG.shortCode,
      Password: Buffer.from(`${MPESA_CONFIG.shortCode}${MPESA_CONFIG.passkey}${timestamp}`).toString('base64'),
      Timestamp: timestamp,
      TransactionType: 'CustomerPayBillOnline',
      Amount: Math.ceil(amount),
      PartyA: phone,
      PartyB: MPESA_CONFIG.shortCode,
      PhoneNumber: phone,
      CallBackURL: MPESA_CONFIG.callbackUrl,
      AccountReference: `Invoice-${invoiceId}`,
      TransactionDesc: description
    };

    const response = await axios.post(
      `${getBaseUrl()}/mpesa/stkpush/v1/processrequest`,
      payload,
      {
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        }
      }
    );

    return {
      success: true,
      checkoutRequestId: response.data.CheckoutRequestID,
      responseCode: response.data.ResponseCode,
      responseDescription: response.data.ResponseDescription
    };
  } catch (error) {
    console.error('Mpesa STK Push Error:', error.response?.data || error.message);
    return {
      success: false,
      error: error.response?.data?.errorMessage || error.message || 'Failed to initiate payment'
    };
  }
}

export async function queryTransactionStatus(checkoutRequestId) {
  try {
    const token = await getAccessToken();
    const now = new Date();
    const eatTime = new Date(now.getTime() + (3 * 60 * 60 * 1000));
    const timestamp = eatTime.toISOString().slice(0, 19).replace(/[-T:]/g, '');

    const payload = {
      BusinessShortCode: MPESA_CONFIG.shortCode,
      Password: Buffer.from(`${MPESA_CONFIG.shortCode}${MPESA_CONFIG.passkey}${timestamp}`).toString('base64'),
      Timestamp: timestamp,
      CheckoutRequestID: checkoutRequestId
    };

    const response = await axios.post(
      `${getBaseUrl()}/mpesa/stkquery/v1/query`,
      payload,
      {
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        }
      }
    );

    return {
      success: true,
      resultCode: response.data.ResultCode,
      resultDesc: response.data.ResultDesc,
      mpesaReceiptNumber: response.data.MpesaReceiptNumber || null,
      amount: response.data.Amount || null
    };
  } catch (error) {
    console.error('Mpesa Query Error:', error.response?.data || error.message);
    return {
      success: false,
      error: error.message || 'Failed to query transaction'
    };
  }
}

export function parseCallbackPayload(payload) {
  try {
    const body = payload.Body || payload;
    const stkCallback = body.stkCallback || {};

    return {
      success: true,
      checkoutRequestId: stkCallback.CheckoutRequestID,
      merchantRequestId: stkCallback.MerchantRequestID,
      resultCode: stkCallback.ResultCode,
      resultDesc: stkCallback.ResultDesc,
      amount: stkCallback.CallbackMetadata?.Item?.find(i => i.Name === 'Amount')?.Value || null,
      receiptNumber: stkCallback.CallbackMetadata?.Item?.find(i => i.Name === 'MpesaReceiptNumber')?.Value || null,
      phoneNumber: stkCallback.CallbackMetadata?.Item?.find(i => i.Name === 'PhoneNumber')?.Value || null,
      transactionDate: stkCallback.CallbackMetadata?.Item?.find(i => i.Name === 'TransactionDate')?.Value || null
    };
  } catch (error) {
    console.error('Mpesa Callback Parse Error:', error.message);
    return {
      success: false,
      error: 'Failed to parse callback payload'
    };
  }
}

export function formatPhoneNumber(phone) {
  let cleaned = phone.replace(/\D/g, '');

  if (cleaned.startsWith('0')) {
    cleaned = '254' + cleaned.slice(1);
  } else if (!cleaned.startsWith('254')) {
    cleaned = '254' + cleaned;
  }

  if (cleaned.length === 12 && cleaned.startsWith('254')) {
    return cleaned;
  }

  return null;
}

export function isMpesaConfigured() {
  if (MPESA_CONFIG.forceSimulation) return false;

  const key = MPESA_CONFIG.consumerKey;
  const secret = MPESA_CONFIG.consumerSecret;
  const shortCode = MPESA_CONFIG.shortCode;
  const passkey = MPESA_CONFIG.passkey;

  return key &&
    secret &&
    shortCode &&
    passkey &&
    key !== 'YOUR_CONSUMER_KEY_HERE' &&
    secret !== 'YOUR_CONSUMER_SECRET_HERE' &&
    shortCode !== 'YOUR_SHORT_CODE_HERE' &&
    passkey !== 'YOUR_PASSKEY_HERE';
}

export function simulatePayment(invoiceId, amount) {
  return {
    success: true,
    checkoutRequestId: `SIM_${Date.now()}`,
    simulated: true,
    message: 'Payment simulated (Mpesa not configured)'
  };
}

export default {
  getAccessToken,
  initiateSTKPush,
  queryTransactionStatus,
  parseCallbackPayload,
  formatPhoneNumber,
  isMpesaConfigured,
  simulatePayment,
  MPESA_CONFIG
};