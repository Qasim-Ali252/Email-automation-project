import { config } from '../config/index.js';
import databaseService from './DatabaseService.js';
import auditLogger from './AuditLogger.js';
import workflowExecutor from './WorkflowExecutor.js';

/**
 * Decision Engine
 * Applies rule-based logic to determine automation eligibility
 * Pure deterministic rules - no AI involved
 */
class DecisionEngine {
  constructor() {
    this.confidenceThreshold = config.app.confidenceThreshold;
  }

  /**
   * Apply decision rules to determine automation eligibility
   * @param {string} email_id - Email ID
   * @param {string} email_type - Email classification
   * @param {number} confidence_score - AI confidence score (0-1)
   * @returns {Promise<Object>} Decision result
   */
  async makeDecision(email_id, email_type, confidence_score) {
    try {
      console.log(`Making decision for email ${email_id}...`);
      console.log(`  Type: ${email_type}, Confidence: ${confidence_score}`);

      // Apply decision rules in order
      const decision = this.applyRules(email_type, confidence_score);

      console.log(`  Decision: automation_allowed=${decision.automation_allowed}, status=${decision.status}`);
      console.log(`  Reason: ${decision.reason}`);

      // Update email status in database
      await databaseService.updateEmailStatus(email_id, decision.status);

      // Log decision
      if (!decision.automation_allowed) {
        await auditLogger.logAutomationBlocked(email_id, decision.reason, {
          email_type,
          confidence_score
        });
      }

      if (decision.status === 'Manual Review') {
        await auditLogger.logManualReviewTriggered(email_id, decision.reason, {
          email_type,
          confidence_score
        });
      }

      // Trigger workflow execution (async, non-blocking)
      // Get analysis data for workflow
      const analysis = await databaseService.getAnalysisByEmailId(email_id);
      if (analysis) {
        workflowExecutor.executeWorkflow(email_id, {
          email_type,
          confidence_score,
          urgency_level: analysis.urgency,
          extracted_data: analysis.extracted_data,
          reasoning: analysis.reasoning
        }, decision).catch(error => {
          console.error('Workflow execution failed:', error.message);
        });
      }

      return {
        success: true,
        decision: {
          email_id,
          automation_allowed: decision.automation_allowed,
          status: decision.status,
          reason: decision.reason
        }
      };

    } catch (error) {
      console.error(`❌ Decision failed for email ${email_id}:`, error.message);

      // Log error
      await auditLogger.logSystemError(error, {
        email_id,
        component: 'DecisionEngine',
        operation: 'makeDecision'
      });

      return {
        success: false,
        error: error.message,
        decision: {
          email_id,
          automation_allowed: false,
          status: 'Manual Review',
          reason: `Decision engine error: ${error.message}`
        }
      };
    }
  }

  /**
   * Apply decision rules (pure function)
   * @param {string} email_type - Email classification
   * @param {number} confidence_score - AI confidence score (0-1)
   * @returns {Object} Decision result
   */
  applyRules(email_type, confidence_score) {
    // Rule 1: Urgent Site Issue → Never automate (always escalate)
    // This rule must come FIRST - urgent issues are escalated regardless of confidence
    if (email_type === 'Urgent Site Issue') {
      return {
        automation_allowed: false,
        status: 'Escalated',
        reason: 'Urgent site issues require immediate human attention'
      };
    }

    // Rule 2: Low confidence → Manual Review
    if (confidence_score < this.confidenceThreshold) {
      return {
        automation_allowed: false,
        status: 'Manual Review',
        reason: `Low confidence score (${confidence_score} < ${this.confidenceThreshold})`
      };
    }

    // Rule 3: Unknown/Unclear → Manual Review
    if (email_type === 'Unknown/Unclear') {
      return {
        automation_allowed: false,
        status: 'Manual Review',
        reason: 'Email type could not be confidently classified'
      };
    }

    // Rule 4: RFQ/Bid Request with high confidence → Allow automation
    if (email_type === 'RFQ/Bid Request') {
      return {
        automation_allowed: true,
        status: 'Pending Review',
        reason: 'High confidence RFQ - automation approved'
      };
    }

    // Rule 5: Invoice/Billing with high confidence → Allow automation
    if (email_type === 'Invoice/Billing') {
      return {
        automation_allowed: true,
        status: 'Finance Review',
        reason: 'High confidence invoice - automation approved'
      };
    }

    // Default: Unknown type → Manual Review
    return {
      automation_allowed: false,
      status: 'Manual Review',
      reason: `Unknown email type: ${email_type}`
    };
  }

  /**
   * Get decision rules as a table (for documentation/testing)
   * @returns {Array} Array of rule objects
   */
  getRules() {
    return [
      {
        priority: 1,
        condition: 'email_type = "Urgent Site Issue"',
        automation_allowed: false,
        status: 'Escalated',
        reason: 'Urgent issues require human attention (regardless of confidence)'
      },
      {
        priority: 2,
        condition: 'confidence_score < 0.7',
        automation_allowed: false,
        status: 'Manual Review',
        reason: 'Low confidence score'
      },
      {
        priority: 3,
        condition: 'email_type = "Unknown/Unclear"',
        automation_allowed: false,
        status: 'Manual Review',
        reason: 'Cannot confidently classify'
      },
      {
        priority: 4,
        condition: 'email_type = "RFQ/Bid Request" AND confidence_score >= 0.7',
        automation_allowed: true,
        status: 'Pending Review',
        reason: 'High confidence RFQ'
      },
      {
        priority: 5,
        condition: 'email_type = "Invoice/Billing" AND confidence_score >= 0.7',
        automation_allowed: true,
        status: 'Finance Review',
        reason: 'High confidence invoice'
      }
    ];
  }
}

// Export singleton instance
const decisionEngine = new DecisionEngine();
export default decisionEngine;
