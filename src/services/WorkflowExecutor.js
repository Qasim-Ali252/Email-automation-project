import databaseService from './DatabaseService.js';
import emailSender from './EmailSender.js';
import auditLogger from './AuditLogger.js';

/**
 * Workflow Executor
 * Routes to and executes appropriate workflow based on email classification
 */
class WorkflowExecutor {
  /**
   * Execute workflow based on email type and decision
   * @param {string} email_id - Email ID
   * @param {Object} analysis - AI analysis results
   * @param {Object} decision - Decision engine results
   * @returns {Promise<Object>} Workflow execution result
   */
  async executeWorkflow(email_id, analysis, decision) {
    try {
      console.log(`Executing workflow for email ${email_id}...`);
      console.log(`  Type: ${analysis.email_type}`);
      console.log(`  Automation: ${decision.automation_allowed ? 'Allowed' : 'Blocked'}`);

      // Get email details
      const email = await databaseService.getEmailById(email_id);

      // Route to appropriate workflow
      let result;
      switch (analysis.email_type) {
        case 'RFQ/Bid Request':
          result = await this.executeRFQWorkflow(email, analysis, decision);
          break;
        case 'Urgent Site Issue':
          result = await this.executeUrgentIssueWorkflow(email, analysis, decision);
          break;
        case 'Invoice/Billing':
          result = await this.executeInvoiceWorkflow(email, analysis, decision);
          break;
        case 'Unknown/Unclear':
          result = await this.executeUnknownWorkflow(email, analysis, decision);
          break;
        default:
          result = await this.executeUnknownWorkflow(email, analysis, decision);
      }

      // Record workflow execution
      await databaseService.insertWorkflow({
        email_id,
        workflow_type: analysis.email_type,
        automation_used: decision.automation_allowed && result.email_sent,
        actions_taken: result.actions_taken,
        success: result.success
      });

      // Log workflow execution
      await auditLogger.logWorkflowExecuted(
        email_id,
        analysis.email_type,
        decision.automation_allowed && result.email_sent,
        result.actions_taken
      );

      console.log(`✅ Workflow completed for email ${email_id}`);

      return {
        success: true,
        workflow_type: analysis.email_type,
        result
      };

    } catch (error) {
      console.error(`❌ Workflow execution failed for email ${email_id}:`, error.message);

      // Log error
      await auditLogger.logSystemError(error, {
        email_id,
        component: 'WorkflowExecutor',
        operation: 'executeWorkflow'
      });

      return {
        success: false,
        error: error.message
      };
    }
  }

  /**
   * Execute RFQ/Bid Request workflow
   * @param {Object} email - Email record
   * @param {Object} analysis - AI analysis results
   * @param {Object} decision - Decision engine results
   * @returns {Promise<Object>} Workflow result
   */
  async executeRFQWorkflow(email, analysis, decision) {
    const actions = [];

    try {
      // Determine priority based on deadline
      const priority = analysis.extracted_data?.deadline ? 'High' : 'Medium';
      
      // Update priority
      await databaseService.updateEmailPriority(email.id, priority);
      actions.push(`Set priority to ${priority}`);

      // Send acknowledgment if automation allowed
      let emailSent = false;
      if (decision.automation_allowed) {
        const sendResult = await emailSender.sendRFQAcknowledgment(
          email.id,
          email.from_email,
          email.subject,
          analysis.extracted_data
        );

        if (sendResult.success) {
          actions.push(`Sent acknowledgment email to ${email.from_email}`);
          emailSent = true;
        } else {
          actions.push(`Failed to send email: ${sendResult.error}`);
        }
      } else {
        actions.push('Automation blocked - no email sent');
      }

      return {
        success: true,
        email_sent: emailSent,
        actions_taken: actions,
        priority
      };

    } catch (error) {
      actions.push(`Error: ${error.message}`);
      return {
        success: false,
        email_sent: false,
        actions_taken: actions,
        error: error.message
      };
    }
  }

  /**
   * Execute Urgent Site Issue workflow
   * @param {Object} email - Email record
   * @param {Object} analysis - AI analysis results
   * @param {Object} decision - Decision engine results
   * @returns {Promise<Object>} Workflow result
   */
  async executeUrgentIssueWorkflow(email, analysis, decision) {
    const actions = [];

    try {
      // Flag as Critical
      await databaseService.updateEmailPriority(email.id, 'Critical');
      actions.push('Flagged as Critical');

      // Record escalation
      actions.push('Escalated for immediate human attention');
      actions.push('NO automated email sent (safety protocol)');

      return {
        success: true,
        email_sent: false,
        actions_taken: actions,
        priority: 'Critical'
      };

    } catch (error) {
      actions.push(`Error: ${error.message}`);
      return {
        success: false,
        email_sent: false,
        actions_taken: actions,
        error: error.message
      };
    }
  }

  /**
   * Execute Invoice/Billing workflow
   * @param {Object} email - Email record
   * @param {Object} analysis - AI analysis results
   * @param {Object} decision - Decision engine results
   * @returns {Promise<Object>} Workflow result
   */
  async executeInvoiceWorkflow(email, analysis, decision) {
    const actions = [];

    try {
      // Send acknowledgment if automation allowed
      let emailSent = false;
      if (decision.automation_allowed) {
        const sendResult = await emailSender.sendInvoiceAcknowledgment(
          email.id,
          email.from_email,
          email.subject
        );

        if (sendResult.success) {
          actions.push(`Sent acknowledgment email to ${email.from_email}`);
          emailSent = true;
        } else {
          actions.push(`Failed to send email: ${sendResult.error}`);
        }
      } else {
        actions.push('Automation blocked - no email sent');
      }

      actions.push('Routed to finance team for processing');

      return {
        success: true,
        email_sent: emailSent,
        actions_taken: actions
      };

    } catch (error) {
      actions.push(`Error: ${error.message}`);
      return {
        success: false,
        email_sent: false,
        actions_taken: actions,
        error: error.message
      };
    }
  }

  /**
   * Execute Unknown/Unclear workflow
   * @param {Object} email - Email record
   * @param {Object} analysis - AI analysis results
   * @param {Object} decision - Decision engine results
   * @returns {Promise<Object>} Workflow result
   */
  async executeUnknownWorkflow(email, analysis, decision) {
    const actions = [];

    try {
      actions.push('Email type unclear - flagged for manual review');
      actions.push('NO automated email sent');
      actions.push(`AI reasoning: ${analysis.reasoning}`);

      return {
        success: true,
        email_sent: false,
        actions_taken: actions
      };

    } catch (error) {
      actions.push(`Error: ${error.message}`);
      return {
        success: false,
        email_sent: false,
        actions_taken: actions,
        error: error.message
      };
    }
  }
}

// Export singleton instance
const workflowExecutor = new WorkflowExecutor();
export default workflowExecutor;
