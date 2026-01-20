import express from 'express';
import aiAnalysisService from '../services/AIAnalysisService.js';

const router = express.Router();

/**
 * Test endpoint to check AI analysis service - STRICT MODE
 */
router.post('/test-ai', async (req, res) => {
  try {
    console.log('🧪 Testing AI analysis service (STRICT MODE)...');
    
    const testEmail = {
      subject: req.body.subject || "RFQ: Office Building Construction",
      body: req.body.body || "We need a quote for a 10-story office building. Budget: $8M. Deadline: March 15, 2026. Please provide detailed breakdown."
    };
    
    console.log('📧 Test email:', testEmail);
    
    // Test AI analysis with a proper UUID
    const { randomUUID } = await import('crypto');
    const testEmailId = randomUUID();
    
    console.log(`🚀 Starting STRICT AI analysis for ${testEmailId}...`);
    
    // This will throw an error if anything fails - no fallbacks
    const result = await aiAnalysisService.analyzeEmail(
      testEmailId,
      testEmail.subject,
      testEmail.body
    );
    
    console.log('✅ AI analysis completed successfully:', result);
    
    return res.status(200).json({
      success: true,
      message: 'AI analysis test completed successfully',
      result: result,
      testEmailId: testEmailId,
      mode: 'STRICT - no fallbacks'
    });
    
  } catch (error) {
    console.error('❌ AI test FAILED (this is expected in strict mode):', error);
    return res.status(500).json({
      success: false,
      error: error.message,
      stack: error.stack,
      mode: 'STRICT - no fallbacks',
      message: 'AI analysis failed - this will help us identify the root cause'
    });
  }
});

/**
 * Test endpoint to check environment variables
 */
router.get('/test-env', (req, res) => {
  const envCheck = {
    hasGroqKey: !!(process.env.GROQ_API_KEY || process.env.OPENAI_API_KEY),
    hasSupabaseUrl: !!process.env.SUPABASE_URL,
    hasSupabaseKey: !!(process.env.SUPABASE_ANON_KEY || process.env.SUPABASE_SERVICE_KEY),
    hasSmtpConfig: !!(process.env.SMTP_HOST && process.env.SMTP_USER),
    nodeEnv: process.env.NODE_ENV,
    groqKeyPrefix: (process.env.GROQ_API_KEY || process.env.OPENAI_API_KEY || '').substring(0, 10) + '...'
  };
  
  console.log('🔧 Environment check:', envCheck);
  
  return res.status(200).json({
    success: true,
    environment: envCheck,
    timestamp: new Date().toISOString()
  });
});

/**
 * Test endpoint for quick Groq API check
 */
router.post('/test-groq', async (req, res) => {
  try {
    console.log('🧪 Testing Groq API directly...');
    
    const { config } = await import('../config/index.js');
    const OpenAI = (await import('openai')).default;
    
    const client = new OpenAI({
      apiKey: config.openai.apiKey,
      baseURL: 'https://api.groq.com/openai/v1',
      timeout: 10000
    });
    
    const startTime = Date.now();
    
    const completion = await client.chat.completions.create({
      model: config.openai.model,
      messages: [
        {
          role: 'user',
          content: 'Respond with JSON: {"status": "working", "timestamp": "' + new Date().toISOString() + '"}'
        }
      ],
      temperature: 0.1,
      max_tokens: 100
    });
    
    const endTime = Date.now();
    const response = completion.choices[0]?.message?.content;
    
    console.log('✅ Groq API response:', response);
    
    return res.status(200).json({
      success: true,
      duration: endTime - startTime,
      response: response,
      model: config.openai.model
    });
    
  } catch (error) {
    console.error('❌ Groq API test failed:', error);
    return res.status(500).json({
      success: false,
      error: error.message,
      type: error.constructor.name
    });
  }
});

export default router;