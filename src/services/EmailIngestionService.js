import databaseService from './DatabaseService.js';
import auditLogger from './AuditLogger.js';
import aiAnalysisService from './AIAnalysisService.js';

/**
 * Email Ingestion Service - Clean and Simple
 */
class EmailIngestionService {
  /**
   * Process incoming email
   */
  async processIncomingEmail(payload) {
    console.log(payload, 'step 1')
    try {
      // Validate payload
      const validation = this.validatePayload(payload);
      if (!validation.valid) {
        return {
          success: false,
          error: 'Validation failed',
          details: validation.errors
        };
      }

      // Sanitize inputs
      const sanitizedData = {
        from_email: this.sanitizeInput(payload.from_email),
        subject: this.sanitizeInput(payload.subject),
        body: this.sanitizeInput(payload.body)
      };

      // Store email in database
      const email_id = await databaseService.insertEmail(sanitizedData);

      console.log(`📧 Construction email received: ${email_id} from ${sanitizedData.from_email}`);

      // 🚀 Start AI analysis asynchronously
      setImmediate(() => {
        console.log(`🚀 Starting async AI analysis for email ${email_id}...`);
        aiAnalysisService.analyzeEmail(
          email_id,
          sanitizedData.subject,
          sanitizedData.body
        ).catch(error => {
          console.error(`❌ Async AI analysis failed for email ${email_id}:`, error.message);
        });
      });

      return {
        success: true,
        email_id,
        message: 'Construction email received and stored successfully'
      };

    } catch (error) {
      console.error('Email ingestion failed:', error.message);
      
      await auditLogger.logSystemError(error, {
        component: 'EmailIngestionService',
        operation: 'processIncomingEmail'
      });

      return {
        success: false,
        error: 'Internal server error'
      };
    }
  }

  /**
   * Validate email payload
   */
  validatePayload(payload) {
    const errors = [];

    if (!payload) {
      errors.push('Request body is required');
      return { valid: false, errors };
    }

    if (!payload.from_email || typeof payload.from_email !== 'string') {
      errors.push('from_email is required and must be a string');
    }

    if (!payload.subject || typeof payload.subject !== 'string') {
      errors.push('subject is required and must be a string');
    }

    if (!payload.body || typeof payload.body !== 'string') {
      errors.push('body is required and must be a string');
    }

    if (payload.from_email && !this.isValidEmail(payload.from_email)) {
      errors.push('from_email must be a valid email address');
    }

    return { valid: errors.length === 0, errors };
  }

  /**
   * Validate email address format
   */
  isValidEmail(email) {
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    return emailRegex.test(email);
  }

  /**
   * Sanitize input
   */
  sanitizeInput(input) {
    if (typeof input !== 'string') return input;
    
    return input
      .replace(/\0/g, '')
      .replace(/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/g, '')
      .trim();
  }
}

export default new EmailIngestionService();
