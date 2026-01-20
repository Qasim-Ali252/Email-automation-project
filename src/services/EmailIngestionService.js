import databaseService from './DatabaseService.js';
import auditLogger from './AuditLogger.js';
import aiAnalysisService from './AIAnalysisService.js';

/**
 * Email Ingestion Service
 * Handles validation and storage of incoming emails
 */
class EmailIngestionService {
  /**
   * Validate email payload
   * @param {Object} payload - Email payload
   * @returns {Object} Validation result { valid: boolean, errors: string[] }
   */
  validatePayload(payload) {
    const errors = [];

    if (!payload) {
      errors.push('Request body is required');
      return { valid: false, errors };
    }

    // Check required fields
    if (!payload.from_email || typeof payload.from_email !== 'string') {
      errors.push('from_email is required and must be a string');
    }

    if (!payload.subject || typeof payload.subject !== 'string') {
      errors.push('subject is required and must be a string');
    }

    if (!payload.body || typeof payload.body !== 'string') {
      errors.push('body is required and must be a string');
    }

    // Validate email format
    if (payload.from_email && !this.isValidEmail(payload.from_email)) {
      errors.push('from_email must be a valid email address');
    }

    // Check for empty strings (only if they are strings)
    if (payload.from_email && typeof payload.from_email === 'string' && payload.from_email.trim() === '') {
      errors.push('from_email cannot be empty');
    }

    if (payload.subject && typeof payload.subject === 'string' && payload.subject.trim() === '') {
      errors.push('subject cannot be empty');
    }

    if (payload.body && typeof payload.body === 'string' && payload.body.trim() === '') {
      errors.push('body cannot be empty');
    }

    return {
      valid: errors.length === 0,
      errors
    };
  }

  /**
   * Validate email address format
   * @param {string} email - Email address
   * @returns {boolean} True if valid
   */
  isValidEmail(email) {
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    return emailRegex.test(email);
  }

  /**
   * Sanitize input to prevent injection attacks
   * @param {string} input - Input string
   * @returns {string} Sanitized string
   */
  sanitizeInput(input) {
    if (typeof input !== 'string') return input;
    
    // Remove null bytes and control characters
    return input
      .replace(/\0/g, '')
      .replace(/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/g, '')
      .trim();
  }

  /**
   * Process incoming email
   * @param {Object} payload - Email payload
   * @returns {Promise<Object>} Result { success: boolean, email_id?: string, error?: string }
   */
  async processIncomingEmail(payload) {
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

      // Log successful receipt
      await auditLogger.logEmailReceived(email_id, {
        from_email: sanitizedData.from_email,
        subject: sanitizedData.subject,
        received_at: new Date().toISOString()
      });

      // Trigger AI analysis asynchronously (non-blocking)
      // Don't await - let it run in background but log failures prominently
      aiAnalysisService.analyzeEmail(
        email_id,
        sanitizedData.subject,
        sanitizedData.body
      ).catch(error => {
        console.error('🚨 CRITICAL: AI ANALYSIS FAILED 🚨');
        console.error('Email ID:', email_id);
        console.error('Error:', error.message);
        console.error('Subject:', sanitizedData.subject);
        console.error('From:', sanitizedData.from_email);
        console.error('Stack:', error.stack);
        console.error('🚨 NO AUTOMATED RESPONSE WILL BE SENT 🚨');
        
        // Log to audit system for monitoring
        auditLogger.logSystemError(error, {
          component: 'EmailIngestionService',
          operation: 'AI_ANALYSIS_CRITICAL_FAILURE',
          email_id: email_id,
          from_email: sanitizedData.from_email,
          subject: sanitizedData.subject
        }).catch(auditError => {
          console.error('Failed to log AI analysis failure to audit system:', auditError.message);
        });
      });

      return {
        success: true,
        email_id,
        message: 'Email received and stored successfully'
      };

    } catch (error) {
      // Log system error
      await auditLogger.logSystemError(error, {
        component: 'EmailIngestionService',
        operation: 'processIncomingEmail'
      });

      return {
        success: false,
        error: 'Internal server error',
        message: 'Failed to process email'
      };
    }
  }
}

// Export singleton instance
const emailIngestionService = new EmailIngestionService();
export default emailIngestionService;
