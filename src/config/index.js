import dotenv from 'dotenv';

// Load environment variables
dotenv.config();

/**
 * Validates that all required environment variables are present
 * @throws {Error} If any required environment variable is missing
 */
function validateConfig() {
  const requiredEnvVars = [
    'SUPABASE_URL',
    'SUPABASE_SERVICE_KEY',
    'SMTP_HOST',
    'SMTP_PORT',
    'SMTP_USER',
    'SMTP_PASSWORD'
  ];

  const missing = requiredEnvVars.filter(key => !process.env[key]);
  
  if (missing.length > 0) {
    throw new Error(`Missing required environment variables: ${missing.join(', ')}`);
  }

  // Check for AI API key (either OpenAI or Groq)
  if (!process.env.OPENAI_API_KEY && !process.env.GROQ_API_KEY) {
    throw new Error('Missing required environment variable: OPENAI_API_KEY or GROQ_API_KEY');
  }
}

// Configuration object
const config = {
  // Server
  port: process.env.PORT || 3000,
  nodeEnv: process.env.NODE_ENV || 'development',

  // Supabase
  supabase: {
    url: process.env.SUPABASE_URL,
    anonKey: process.env.SUPABASE_ANON_KEY,
    serviceKey: process.env.SUPABASE_SERVICE_KEY
  },

  // OpenAI (or Groq API compatible)
  openai: {
    apiKey: process.env.OPENAI_API_KEY || process.env.GROQ_API_KEY,
    model: process.env.OPENAI_MODEL || 'llama-3.1-8b-instant', // Faster model for Vercel
    timeout: parseInt(process.env.OPENAI_TIMEOUT) || 30000
  },

  // SMTP
  smtp: {
    host: process.env.SMTP_HOST,
    port: parseInt(process.env.SMTP_PORT) || 587,
    user: process.env.SMTP_USER,
    password: process.env.SMTP_PASSWORD,
    from: process.env.SMTP_FROM || process.env.SMTP_USER
  },

  // Application
  app: {
    maxRetries: parseInt(process.env.MAX_RETRIES) || 3,
    retryDelayMs: parseInt(process.env.RETRY_DELAY_MS) || 100,
    confidenceThreshold: parseFloat(process.env.CONFIDENCE_THRESHOLD) || 0.7
  }
};

export { config, validateConfig };
