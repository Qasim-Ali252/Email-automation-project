import express from 'express';
import emailIngestionService from '../services/EmailIngestionService.js';

const router = express.Router();

/**
 * POST /api/emails/inbound
 * Webhook endpoint for receiving incoming emails
 */
router.post('/inbound', async (req, res) => {
  try {
    const result = await emailIngestionService.processIncomingEmail(req.body);

    if (result.success) {
      return res.status(200).json({
        success: true,
        email_id: result.email_id,
        message: result.message
      });
    } else {
      // Validation error
      return res.status(400).json({
        success: false,
        error: result.error,
        details: result.details
      });
    }
  } catch (error) {
    // Unexpected error
    console.error('Unexpected error in email webhook:', error);
    return res.status(500).json({
      success: false,
      error: 'Internal server error'
    });
  }
});

export default router;
