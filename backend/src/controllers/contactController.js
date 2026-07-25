// controllers/contactController.js - Contact & Newsletter (CommonJS)
const db = require('../config/database.js');
const { sendContactEmail, sendNewsletterConfirmation } = require('../lib/email.js');

async function submitContact(req, res) {
  try {
    const { name, email, phone, message } = req.body;

    if (!name || !name.trim()) {
      return res.status(400).json({ error: 'Name is required' });
    }
    if (!email || !email.trim()) {
      return res.status(400).json({ error: 'Email is required' });
    }
    if (!message || !message.trim()) {
      return res.status(400).json({ error: 'Message is required' });
    }

    await db.query(
      'INSERT INTO contact_messages (name, email, phone, message) VALUES (?, ?, ?, ?)',
      [name.trim(), email.trim(), phone || null, message.trim()]
    );

    const emailResult = await sendContactEmail({ name: name.trim(), email: email.trim(), phone: phone || null, message: message.trim() });

    res.json({
      success: true,
      message: 'Thank you for your message. We will get back to you shortly.',
      emailSent: emailResult.sent
    });

  } catch (error) {
    console.error('Contact form error:', error);
    res.status(500).json({ error: 'Failed to submit your message. Please try again later.' });
  }
}

async function subscribeNewsletter(req, res) {
  try {
    const { email } = req.body;

    if (!email || !email.trim()) {
      return res.status(400).json({ error: 'Email is required' });
    }

    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email.trim())) {
      return res.status(400).json({ error: 'Please provide a valid email address' });
    }

    const existing = await db.getOne(
      'SELECT id, is_active FROM newsletter_subscribers WHERE email = ?',
      [email.trim()]
    );

    if (existing) {
      if (existing.is_active) {
        return res.json({ success: true, message: 'You are already subscribed!' });
      }
      await db.query(
        'UPDATE newsletter_subscribers SET is_active = 1, unsubscribed_at = NULL WHERE id = ?',
        [existing.id]
      );
    } else {
      await db.query(
        'INSERT INTO newsletter_subscribers (email) VALUES (?)',
        [email.trim()]
      );
    }

    const emailResult = await sendNewsletterConfirmation(email.trim());

    res.json({
      success: true,
      message: 'Thank you for subscribing! Check your email for confirmation.',
      emailSent: emailResult.sent
    });

  } catch (error) {
    console.error('Newsletter subscribe error:', error);
    if (error.code === 'ER_DUP_ENTRY') {
      return res.json({ success: true, message: 'You are already subscribed!' });
    }
    res.status(500).json({ error: 'Failed to subscribe. Please try again later.' });
  }
}

module.exports = { submitContact, subscribeNewsletter };
