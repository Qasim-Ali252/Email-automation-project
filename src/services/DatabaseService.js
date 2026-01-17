import { createClient } from '@supabase/supabase-js';
import { config } from '../config/index.js';

/**
 * Sleep utility for retry delays
 * @param {number} ms - Milliseconds to sleep
 */
function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

/**
 * Database Service for managing all database operations with Supabase
 */
class DatabaseService {
  constructor() {
    this.client = createClient(
      config.supabase.url,
      config.supabase.serviceKey
    );
  }

  /**
   * Retry operation with exponential backoff
   * @param {Function} operation - Async operation to retry
   * @param {number} maxRetries - Maximum number of retry attempts
   * @returns {Promise<any>} Result of the operation
   */
  async retryOperation(operation, maxRetries = config.app.maxRetries) {
    let lastError;
    
    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      try {
        return await operation();
      } catch (error) {
        lastError = error;
        
        if (attempt === maxRetries) {
          console.error(`Operation failed after ${maxRetries} attempts:`, error.message);
          throw error;
        }
        
        const delay = Math.pow(2, attempt - 1) * config.app.retryDelayMs;
        console.warn(`Attempt ${attempt} failed, retrying in ${delay}ms...`);
        await sleep(delay);
      }
    }
    
    throw lastError;
  }

  /**
   * Insert a new email record
   * @param {Object} emailData - Email data
   * @param {string} emailData.from_email - Sender email address
   * @param {string} emailData.subject - Email subject
   * @param {string} emailData.body - Email body
   * @returns {Promise<string>} Created email ID
   */
  async insertEmail({ from_email, subject, body }) {
    return this.retryOperation(async () => {
      const { data, error } = await this.client
        .from('emails')
        .insert({
          from_email,
          subject,
          body,
          status: 'Received',
          received_at: new Date().toISOString()
        })
        .select('id')
        .single();

      if (error) {
        throw new Error(`Failed to insert email: ${error.message}`);
      }

      return data.id;
    });
  }

  /**
   * Insert email analysis results
   * @param {Object} analysisData - Analysis data
   * @param {string} analysisData.email_id - Email ID
   * @param {string} analysisData.email_type - Email classification
   * @param {string} analysisData.urgency - Urgency level
   * @param {number} analysisData.confidence_score - Confidence score (0-1)
   * @param {Object} analysisData.extracted_data - Extracted data as JSON
   * @param {string} analysisData.reasoning - AI reasoning
   * @returns {Promise<void>}
   */
  async insertAnalysis({ email_id, email_type, urgency, confidence_score, extracted_data, reasoning }) {
    return this.retryOperation(async () => {
      const { error } = await this.client
        .from('email_analysis')
        .insert({
          email_id,
          email_type,
          urgency,
          confidence_score,
          extracted_data,
          reasoning,
          analyzed_at: new Date().toISOString()
        });

      if (error) {
        throw new Error(`Failed to insert analysis: ${error.message}`);
      }
    });
  }

  /**
   * Insert workflow execution record
   * @param {Object} workflowData - Workflow data
   * @param {string} workflowData.email_id - Email ID
   * @param {string} workflowData.workflow_type - Workflow type
   * @param {boolean} workflowData.automation_used - Whether automation was used
   * @param {Array<string>} workflowData.actions_taken - Actions performed
   * @param {boolean} workflowData.success - Whether workflow succeeded
   * @returns {Promise<void>}
   */
  async insertWorkflow({ email_id, workflow_type, automation_used, actions_taken, success = true }) {
    return this.retryOperation(async () => {
      const { error } = await this.client
        .from('workflows')
        .insert({
          email_id,
          workflow_type,
          automation_used,
          actions_taken,
          success,
          executed_at: new Date().toISOString()
        });

      if (error) {
        throw new Error(`Failed to insert workflow: ${error.message}`);
      }
    });
  }

  /**
   * Insert audit log entry
   * @param {Object} logData - Audit log data
   * @param {string} logData.action_type - Type of action
   * @param {string} logData.related_email_id - Related email ID (optional)
   * @param {string} logData.description - Description of action
   * @param {boolean} logData.success - Whether action succeeded
   * @param {Object} logData.metadata - Additional metadata (optional)
   * @param {string} logData.error_details - Error details (optional)
   * @returns {Promise<void>}
   */
  async insertAuditLog({ action_type, related_email_id, description, success, metadata, error_details }) {
    return this.retryOperation(async () => {
      const { error } = await this.client
        .from('audit_logs')
        .insert({
          action_type,
          related_email_id: related_email_id || null,
          description,
          success,
          metadata: metadata || null,
          error_details: error_details || null,
          timestamp: new Date().toISOString()
        });

      if (error) {
        throw new Error(`Failed to insert audit log: ${error.message}`);
      }
    });
  }

  /**
   * Update email status
   * @param {string} email_id - Email ID
   * @param {string} status - New status
   * @returns {Promise<void>}
   */
  async updateEmailStatus(email_id, status) {
    return this.retryOperation(async () => {
      const { error } = await this.client
        .from('emails')
        .update({ 
          status,
          updated_at: new Date().toISOString()
        })
        .eq('id', email_id);

      if (error) {
        throw new Error(`Failed to update email status: ${error.message}`);
      }
    });
  }

  /**
   * Update email priority
   * @param {string} email_id - Email ID
   * @param {string} priority - New priority (Low, Medium, High, Critical)
   * @returns {Promise<void>}
   */
  async updateEmailPriority(email_id, priority) {
    return this.retryOperation(async () => {
      const { error } = await this.client
        .from('emails')
        .update({ 
          priority,
          updated_at: new Date().toISOString()
        })
        .eq('id', email_id);

      if (error) {
        throw new Error(`Failed to update email priority: ${error.message}`);
      }
    });
  }

  /**
   * Get email by ID
   * @param {string} email_id - Email ID
   * @returns {Promise<Object>} Email record
   */
  async getEmailById(email_id) {
    return this.retryOperation(async () => {
      const { data, error } = await this.client
        .from('emails')
        .select('*')
        .eq('id', email_id)
        .single();

      if (error) {
        throw new Error(`Failed to get email: ${error.message}`);
      }

      return data;
    });
  }

  /**
   * Get analysis by email ID
   * @param {string} email_id - Email ID
   * @returns {Promise<Object>} Analysis record
   */
  async getAnalysisByEmailId(email_id) {
    return this.retryOperation(async () => {
      const { data, error } = await this.client
        .from('email_analysis')
        .select('*')
        .eq('email_id', email_id)
        .single();

      if (error) {
        throw new Error(`Failed to get analysis: ${error.message}`);
      }

      return data;
    });
  }

  /**
   * Get workflow by email ID
   * @param {string} email_id - Email ID
   * @returns {Promise<Object>} Workflow record
   */
  async getWorkflowByEmailId(email_id) {
    return this.retryOperation(async () => {
      const { data, error } = await this.client
        .from('workflows')
        .select('*')
        .eq('email_id', email_id)
        .single();

      if (error) {
        throw new Error(`Failed to get workflow: ${error.message}`);
      }

      return data;
    });
  }

  /**
   * Get audit logs by email ID
   * @param {string} email_id - Email ID
   * @returns {Promise<Array>} Array of audit log records
   */
  async getAuditLogsByEmailId(email_id) {
    return this.retryOperation(async () => {
      const { data, error } = await this.client
        .from('audit_logs')
        .select('*')
        .eq('related_email_id', email_id)
        .order('timestamp', { ascending: true });

      if (error) {
        throw new Error(`Failed to get audit logs: ${error.message}`);
      }

      return data || [];
    });
  }
}

// Export singleton instance
const databaseService = new DatabaseService();
export default databaseService;
