import express from 'express';
import fs from 'fs';

const app = express();
const PORT = 3000;

// Enhanced middleware with better error handling
app.use(express.json({
  limit: '10mb',
  verify: (req, res, buf) => {
    // Store raw body for debugging
    req.rawBody = buf.toString();
  }
}));

// Error handling middleware for JSON parsing
app.use((error, req, res, next) => {
  if (error instanceof SyntaxError && error.status === 400 && 'body' in error) {
    console.error('❌ JSON Parse Error:', error.message);
    console.error('📄 Raw body received:', req.rawBody);
    return res.status(400).json({
      success: false,
      error: 'Invalid JSON format',
      message: 'Please check your JSON syntax',
      received: req.rawBody?.substring(0, 200) + '...'
    });
  }
  next();
});

// Webhook endpoint
app.post('/webhook', (req, res) => {
  console.log('📧 New email received via Apps Script');
  console.log('=======================================');
  console.log('🕐 Received at:', new Date().toISOString());
  
  const email = req.body;
  
  // Validate request body
  if (!email || typeof email !== 'object') {
    console.error('❌ Invalid request body:', email);
    return res.status(400).json({ 
      success: false, 
      error: 'Invalid request body',
      received: typeof email
    });
  }
  
  // Log email details
  console.log('📋 Email Details:');
  console.log('  Subject:', email.subject || 'N/A');
  console.log('  From:', email.from_email || email.from || 'N/A');
  console.log('  Date:', email.date || 'N/A');
  console.log('  Message ID:', email.messageId || 'N/A');
  console.log('  Has attachments:', email.hasAttachments || false);
  console.log('  Is test:', email.isTest || email.isManualTest || false);
  
  if (email.snippet) {
    console.log('  Snippet:', email.snippet.substring(0, 100) + '...');
  }
  
  // Log full payload for debugging (truncated)
  const fullPayload = JSON.stringify(email, null, 2);
  console.log('📄 Full payload:', fullPayload.substring(0, 500) + (fullPayload.length > 500 ? '...' : ''));
  
  // ✅ IMPORTANT: Send response immediately
  res.status(200).json({ 
    success: true, 
    received: true,
    timestamp: new Date().toISOString(),
    messageId: email.messageId || 'unknown',
    processed: true
  });
  
  // Process email asynchronously
  processEmail(email).catch(error => {
    console.error('❌ Async processing error:', error.message);
  });
});

// Forward email to your Vercel webhook
async function processEmail(email) {
  console.log('\n🚀 Processing email:', email.messageId || 'unknown');
  
  try {
    // Skip processing for test emails (just log them)
    if (email.isTest || email.isManualTest) {
      console.log('🧪 Test email detected - skipping Vercel forwarding');
      logToFile(email, 'TEST');
      return;
    }
    
    // Skip system emails that aren't relevant for business
    const systemEmails = [
      'mailer-daemon@',
      'noreply@',
      'no-reply@',
      'postmaster@',
      'delivery-status@'
    ];
    
    const isSystemEmail = systemEmails.some(pattern => 
      (email.from_email || email.from) && (email.from_email || email.from).toLowerCase().includes(pattern)
    );
    
    if (isSystemEmail) {
      console.log('🤖 System email detected - skipping processing');
      console.log('📧 From:', email.from_email || email.from);
      logToFile(email, 'SYSTEM_SKIPPED');
      return;
    }
    
    // Validate required fields
    const fromField = email.from_email || email.from; // Handle both field names
    if (!fromField || !email.subject) {
      console.error('❌ Missing required fields:', { 
        from_email: email.from_email, 
        from: email.from, 
        subject: email.subject 
      });
      return;
    }
    
    // Extract email address from "Display Name <email@domain.com>" format
    const extractEmail = (fromField) => {
      if (!fromField) return '';
      
      // Check if it contains angle brackets (Display Name <email@domain.com>)
      const emailMatch = fromField.match(/<([^>]+)>/);
      if (emailMatch) {
        return emailMatch[1]; // Return just the email part
      }
      
      // If no angle brackets, assume it's just the email
      return fromField.trim();
    };

    // Prepare data for your Vercel webhook (convert Apps Script format to your format)
    const webhookData = {
      from_email: extractEmail(fromField),
      subject: email.subject,
      body: email.body || email.snippet || 'No body content available'
    };
    
    console.log('📤 Forwarding to local server...');
    console.log('📋 Data being sent:', JSON.stringify(webhookData, null, 2));
    
    // Send to your local main server
    const response = await fetch('http://localhost:3001/api/emails/inbound', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(webhookData)
    });
    
    const responseText = await response.text();
    
    if (response.ok) {
      console.log('✅ Successfully forwarded to local server!');
      console.log('📄 Vercel response:', responseText);
      
      // Try to parse response to get email_id
      try {
        const result = JSON.parse(responseText);
        if (result.email_id) {
          console.log('🆔 Email ID:', result.email_id);
        }
      } catch (parseError) {
        // Response might not be JSON, that's okay
      }
      
      logToFile(email, 'SUCCESS');
    } else {
      console.error('❌ Local server error:', response.status, response.statusText);
      console.error('📄 Error response:', responseText);
      logToFile(email, 'ERROR', `${response.status}: ${responseText}`);
    }
    
  } catch (error) {
    console.error('❌ Error processing email:', error.message);
    console.error('📍 Stack trace:', error.stack);
    logToFile(email, 'ERROR', error.message);
  }
}

// Enhanced logging function
function logToFile(email, status, errorDetails = null) {
  try {
    const timestamp = new Date().toISOString();
    const fromField = email.from_email || email.from || 'N/A';
    const logEntry = `${timestamp} | ${status} | ${fromField} | ${email.subject || 'N/A'}${errorDetails ? ' | ' + errorDetails : ''}\n`;
    
    fs.appendFileSync('emails.log', logEntry);
    console.log('📝 Logged to emails.log');
  } catch (logError) {
    console.error('❌ Error writing to log file:', logError.message);
  }
}

// Health check endpoint
app.get('/', (req, res) => {
  res.send(`
    <h1>Gmail Webhook Server</h1>
    <p>✅ Server is running!</p>
    <p>📤 Webhook URL: <code>POST /webhook</code></p>
    <p>🔗 Make sure your Apps Script points to: <code>http://YOUR_NGROK_URL/webhook</code></p>
    <p>🚀 Forwards emails to: <code>https://nonflirtatious-multispeed-arcelia.ngrok-free.dev/api/emails/inbound</code></p>
  `);
});

// Start server
app.listen(PORT, () => {
  console.log('🚀 Gmail Webhook Server Started');
  console.log('================================');
  console.log(`🌐 Local URL: http://localhost:${PORT}`);
  console.log(`📤 Webhook endpoint: http://localhost:${PORT}/webhook`);
  console.log(`💚 Health check: http://localhost:${PORT}`);
  console.log('================================');
  console.log('\n📋 Next steps:');
  console.log('1. Install ngrok: npm install -g ngrok');
  console.log('2. Expose server: ngrok http 3000');
  console.log('3. Update Apps Script with ngrok URL');
  console.log('4. Test by sending yourself an email\n');
});