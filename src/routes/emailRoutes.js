import express from 'express';
import emailIngestionService from '../services/EmailIngestionService.js';
import aiAnalysisService from '../services/AIAnalysisService.js';
import databaseService from '../services/DatabaseService.js';

const router = express.Router();

/**
 * POST /api/emails/inbound
 * Webhook endpoint for receiving incoming emails
 * 🚀 FIXED: Respond immediately, process in background
 */
router.post('/inbound', async (req, res) => {
  console.log('📧 Webhook received email data');
  
  try {
    // 🔥 STEP 1: Validate payload ONLY (fast validation)
    const validation = emailIngestionService.validatePayload(req.body);
    if (!validation.valid) {
      return res.status(400).json({
        success: false,
        error: 'Validation failed',
        details: validation.errors
      });
    }

    // 🔥 STEP 2: Respond IMMEDIATELY (before any DB/AI operations)
    res.status(200).json({
      success: true,
      message: 'Email received and processing started',
      timestamp: new Date().toISOString()
    });

    // 🔥 STEP 3: Process email in background (fire & forget)
    console.log('🚀 Starting background email processing...');
    processEmailInBackground(req.body).catch(error => {
      console.error('❌ Background processing failed:', error.message);
    });

  } catch (error) {
    // Only validation errors should reach here
    console.error('❌ Webhook validation error:', error.message);
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

/**
 * 🚀 Background Email Processing Function
 * This runs AFTER the webhook has already responded
 * No timeout limits - can take as long as needed
 */
async function processEmailInBackground(payload) {
  console.log('🔄 Background processing started');
  
  try {
    // Use the EmailIngestionService to process the email properly
    console.log('💾 Storing email in database...');
    const result = await emailIngestionService.processIncomingEmail(payload);
    
    if (result.success) {
      console.log(`✅ Email processed successfully with ID: ${result.email_id}`);
    } else {
      console.error('❌ Email processing failed:', result.error);
    }
    
    console.log('✅ Background processing completed successfully');

  } catch (error) {
    console.error('❌ Background processing failed:', error.message);
    console.error('📍 Stack trace:', error.stack);
    
    // Don't throw - this is fire & forget
    // The webhook has already responded successfully
  }
}

export default router;
