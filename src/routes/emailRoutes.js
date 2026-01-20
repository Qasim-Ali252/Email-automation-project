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

/**
 * POST /api/emails/gmail-webhook
 * Gmail Pub/Sub webhook endpoint
 */
router.post('/gmail-webhook', async (req, res) => {
  console.log('📨 Gmail Pub/Sub notification received');
  
  // Send 200 immediately (required by Pub/Sub)
  res.status(200).send('OK');
  
  try {
    if (!req.body.message || !req.body.message.data) {
      console.log('⚠️  Invalid Pub/Sub message format');
      return;
    }
    
    // Decode Pub/Sub message
    const messageData = JSON.parse(
      Buffer.from(req.body.message.data, 'base64').toString()
    );
    
    console.log('📧 Gmail change detected:', {
      historyId: messageData.historyId,
      emailAddress: messageData.emailAddress
    });
    
    // Process the Gmail change asynchronously
    processGmailChange(messageData).catch(error => {
      console.error('Error processing Gmail change:', error);
    });
    
  } catch (error) {
    console.error('❌ Error processing Gmail webhook:', error.message);
  }
});

// Function to process Gmail changes (runs asynchronously)
async function processGmailChange(messageData) {
  console.log('🔄 Processing Gmail change for historyId:', messageData.historyId);
  
  // TODO: This would need Gmail API credentials to fetch the actual email
  // For now, we'll just log that we received the notification
  
  // In a full implementation, you would:
  // 1. Use Gmail API to fetch the email details
  // 2. Extract from_email, subject, body
  // 3. Call your existing email ingestion service
  
  console.log('✅ Gmail change processed');
}

export default router;
