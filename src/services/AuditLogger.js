import databaseService from './DatabaseService.js';

/**
 * Action types for audit logging
 */
export const ACTION_TYPES = {
  EMAIL_RECEIVED: 'email_received',
  AI_ANALYSIS_SUCCESS: 'ai_analysis_success',
  AI_ANALYSIS_FAILURE: 'ai_analysis_failure',
  WORKFLOW_EXECUTED: 'workflow_executed',
  AUTOMATION_BLOCKED: 'automation_blocked',
  MANUAL_REVIEW_TRIGGERED: 'manual_review_triggered',
  SYSTEM_ERROR: 'system_error',
  EMAIL_SENT: 'email_sent',
  EMAIL_SEND_FAILED: 'email_send_failed'
};

/**
 * Audit Logger for recording all system actions
 * Never throws errors - all logging is fail-safe
 */
class AuditLogger {
  /**
   * Internal method to safely log to database
   * @private
   */
  async _safeLog(logData) {
    try {
      await databaseService.insertAuditLog(logData);
    } catch (error) {
      // Never throw - logging failures should not crash the system
      console.error('Failed to write audit log:', error.message);
      console.error('Log data:', JSON.stringify(logData, null, 2));
    }
  }

  /**
   * Log email received event
   * @param {string} email_id - Email ID
   * @param {Object} metadata - Email metadata (from, subject, etc.)
   */
  async logEmailReceived(email_id, metadata = {}) {
    await this._safeLog({
      action_type: ACTION_TYPES.EMAIL_RECEIVED,
      related_email_id: email_id,
      description: `Email received from ${metadata.from_email || 'unknown'}`,
      success: true,
      metadata: {
        from_email: metadata.from_email,
        subject: metadata.subject,
        received_at: metadata.received_at || new Date().toISOString()
      }
    });
  }

  /**
   * Log successful AI analysis
   * @param {string} email_id - Email ID
   * @param {Object} analysisResults - Analysis results
   */
  async logAIAnalysisSuccess(email_id, analysisResults = {}) {
    await this._safeLog({
      action_type: ACTION_TYPES.AI_ANALYSIS_SUCCESS,
      related_email_id: email_id,
      description: `AI analysis completed: ${analysisResults.email_type || 'unknown type'}`,
      success: true,
      metadata: {
        email_type: analysisResults.email_type,
        urgency: analysisResults.urgency,
        confidence_score: analysisResults.confidence_score,
        analyzed_at: new Date().toISOString()
      }
    });
  }

  /**
   * Log failed AI analysis
   * @param {string} email_id - Email ID
   * @param {Error} error - Error object
   * @param {Object} context - Additional context
   */
  async logAIAnalysisFailure(email_id, error, context = {}) {
    await this._safeLog({
      action_type: ACTION_TYPES.AI_ANALYSIS_FAILURE,
      related_email_id: email_id,
      description: `AI analysis failed: ${error.message}`,
      success: false,
      metadata: {
        error_name: error.name,
        context,
        failed_at: new Date().toISOString()
      },
      error_details: error.stack || error.message
    });
  }

  /**
   * Log workflow execution
   * @param {string} email_id - Email ID
   * @param {string} workflow_type - Type of workflow
   * @param {boolean} automation_used - Whether automation was used
   * @param {Array<string>} actions_taken - Actions performed
   */
  async logWorkflowExecuted(email_id, workflow_type, automation_used, actions_taken = []) {
    await this._safeLog({
      action_type: ACTION_TYPES.WORKFLOW_EXECUTED,
      related_email_id: email_id,
      description: `Workflow executed: ${workflow_type} (automation: ${automation_used})`,
      success: true,
      metadata: {
        workflow_type,
        automation_used,
        actions_taken,
        executed_at: new Date().toISOString()
      }
    });
  }

  /**
   * Log automation blocked by decision rules
   * @param {string} email_id - Email ID
   * @param {string} reason - Reason for blocking
   * @param {Object} context - Additional context
   */
  async logAutomationBlocked(email_id, reason, context = {}) {
    await this._safeLog({
      action_type: ACTION_TYPES.AUTOMATION_BLOCKED,
      related_email_id: email_id,
      description: `Automation blocked: ${reason}`,
      success: true,
      metadata: {
        reason,
        email_type: context.email_type,
        confidence_score: context.confidence_score,
        blocked_at: new Date().toISOString()
      }
    });
  }

  /**
   * Log manual review triggered
   * @param {string} email_id - Email ID
   * @param {string} trigger_reason - Reason for manual review
   * @param {Object} context - Additional context
   */
  async logManualReviewTriggered(email_id, trigger_reason, context = {}) {
    await this._safeLog({
      action_type: ACTION_TYPES.MANUAL_REVIEW_TRIGGERED,
      related_email_id: email_id,
      description: `Manual review triggered: ${trigger_reason}`,
      success: true,
      metadata: {
        trigger_reason,
        email_type: context.email_type,
        confidence_score: context.confidence_score,
        triggered_at: new Date().toISOString()
      }
    });
  }

  /**
   * Log system error
   * @param {Error} error - Error object
   * @param {Object} context - Additional context
   */
  async logSystemError(error, context = {}) {
    await this._safeLog({
      action_type: ACTION_TYPES.SYSTEM_ERROR,
      related_email_id: context.email_id || null,
      description: `System error: ${error.message}`,
      success: false,
      metadata: {
        error_name: error.name,
        component: context.component,
        operation: context.operation,
        occurred_at: new Date().toISOString()
      },
      error_details: error.stack || error.message
    });
  }

  /**
   * Log successful email send
   * @param {string} email_id - Email ID
   * @param {string} recipient - Recipient email address
   * @param {string} message_id - Email message ID (optional)
   */
  async logEmailSent(email_id, recipient, message_id = null) {
    await this._safeLog({
      action_type: ACTION_TYPES.EMAIL_SENT,
      related_email_id: email_id,
      description: `Email sent to ${recipient}`,
      success: true,
      metadata: {
        recipient,
        message_id,
        sent_at: new Date().toISOString()
      }
    });
  }

  /**
   * Log failed email send
   * @param {string} email_id - Email ID
   * @param {string} recipient - Recipient email address
   * @param {Error} error - Error object
   */
  async logEmailSendFailed(email_id, recipient, error) {
    await this._safeLog({
      action_type: ACTION_TYPES.EMAIL_SEND_FAILED,
      related_email_id: email_id,
      description: `Failed to send email to ${recipient}: ${error.message}`,
      success: false,
      metadata: {
        recipient,
        failed_at: new Date().toISOString()
      },
      error_details: error.stack || error.message
    });
  }

  /**
   * Generic log method for custom events
   * @param {string} action_type - Action type
   * @param {string} description - Description
   * @param {boolean} success - Success status
   * @param {string} email_id - Related email ID (optional)
   * @param {Object} metadata - Additional metadata (optional)
   * @param {string} error_details - Error details (optional)
   */
  async log(action_type, description, success, email_id = null, metadata = {}, error_details = null) {
    await this._safeLog({
      action_type,
      related_email_id: email_id,
      description,
      success,
      metadata,
      error_details
    });
  }
}

// Export singleton instance
const auditLogger = new AuditLogger();
export default auditLogger;
