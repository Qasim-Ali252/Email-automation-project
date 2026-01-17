import nodemailer from 'nodemailer';
import { config } from '../config/index.js';
import auditLogger from './AuditLogger.js';

/**
 * Email Sender Service
 * Handles sending automated email responses via SMTP
 */
class EmailSender {
  constructor() {
    // Create SMTP transporter
    this.transporter = nodemailer.createTransport({
      host: config.smtp.host,
      port: config.smtp.port,
      secure: config.smtp.port === 465, // true for 465, false for other ports
      auth: {
        user: config.smtp.user,
        pass: config.smtp.password
      }
    });

    this.fromAddress = config.smtp.from;
    this.maxRetries = 2; // Up to 2 retries as per requirements
  }

  /**
   * Get email template for RFQ acknowledgment
   * @param {string} originalSubject - Original email subject
   * @param {string} senderName - Sender name (extracted from email)
   * @param {Object} projectDetails - Project details from AI analysis
   * @returns {Object} Email template
   */
  getRFQTemplate(originalSubject, senderName = 'there', projectDetails = {}) {
    const projectType = projectDetails.project_type || 'your project';
    
    return {
      subject: `Re: ${originalSubject}`,
      text: `Dear ${senderName},

Thank you for contacting InvexTech regarding ${projectType}. We have received your request for quotation and our team is currently reviewing the details.

You can expect a comprehensive response within 24 hours. Should you have any immediate questions or require additional information, please do not hesitate to contact us.

Best regards,

InvexTech
30 N Gould St, Ste N
Sheridan, WY 82801, United States
Phone: +1 (787) 710-2725
Email: info@invextech.com`,
      html: `<p>Dear ${senderName},</p>

<p>Thank you for contacting <strong>InvexTech</strong> regarding <strong>${projectType}</strong>. We have received your request for quotation and our team is currently reviewing the details.</p>

<p>You can expect a comprehensive response within <strong>24 hours</strong>. Should you have any immediate questions or require additional information, please do not hesitate to contact us.</p>

<p>Best regards,</p>

<p><strong>InvexTech</strong><br>
30 N Gould St, Ste N<br>
Sheridan, WY 82801, United States<br>
Phone: <a href="tel:+17877102725">+1 (787) 710-2725</a><br>
Email: <a href="mailto:info@invextech.com">info@invextech.com</a></p>`
    };
  }

  /**
   * Get email template for invoice acknowledgment
   * @param {string} originalSubject - Original email subject
   * @param {string} senderName - Sender name (extracted from email)
   * @returns {Object} Email template
   */
  getInvoiceTemplate(originalSubject, senderName = 'there') {
    return {
      subject: `Re: ${originalSubject}`,
      text: `Dear ${senderName},

Thank you for submitting your invoice. We have received it and forwarded it to our finance department for processing.

Payment will be processed according to our standard terms. You can expect to receive payment within the agreed timeframe.

If you have any questions regarding this invoice or payment status, please contact our finance team.

Best regards,

InvexTech - Finance Department
30 N Gould St, Ste N
Sheridan, WY 82801, United States
Phone: +1 (787) 710-2725
Email: info@invextech.com`,
      html: `<p>Dear ${senderName},</p>

<p>Thank you for submitting your invoice. We have received it and forwarded it to our finance department for processing.</p>

<p>Payment will be processed according to our standard terms. You can expect to receive payment within the agreed timeframe.</p>

<p>If you have any questions regarding this invoice or payment status, please contact our finance team.</p>

<p>Best regards,</p>

<p><strong>InvexTech - Finance Department</strong><br>
30 N Gould St, Ste N<br>
Sheridan, WY 82801, United States<br>
Phone: <a href="tel:+17877102725">+1 (787) 710-2725</a><br>
Email: <a href="mailto:info@invextech.com">info@invextech.com</a></p>`
    };
  }

  /**
   * Extract sender name from email address
   * @param {string} email - Email address
   * @returns {string} Sender name
   */
  extractSenderName(email) {
    if (!email) return 'there';
    
    // Try to extract name from email (e.g., john.doe@example.com → John Doe)
    const localPart = email.split('@')[0];
    const parts = localPart.split(/[._-]/);
    
    if (parts.length > 1) {
      // Capitalize first letter of each part
      return parts
        .map(part => part.charAt(0).toUpperCase() + part.slice(1))
        .join(' ');
    }
    
    return 'there';
  }

  /**
   * Send email with retry logic
   * @param {string} to - Recipient email address
   * @param {string} subject - Email subject
   * @param {string} text - Plain text body
   * @param {string} html - HTML body
   * @param {string} email_id - Related email ID for logging
   * @returns {Promise<Object>} Send result
   */
  async sendWithRetry(to, subject, text, html, email_id) {
    let lastError;
    
    for (let attempt = 1; attempt <= this.maxRetries + 1; attempt++) {
      try {
        console.log(`Sending email to ${to} (attempt ${attempt}/${this.maxRetries + 1})...`);

        const info = await this.transporter.sendMail({
          from: this.fromAddress,
          to,
          subject,
          text,
          html
        });

        console.log(`✅ Email sent successfully: ${info.messageId}`);

        // Log success
        await auditLogger.logEmailSent(email_id, to, info.messageId);

        return {
          success: true,
          messageId: info.messageId,
          attempt
        };

      } catch (error) {
        lastError = error;
        console.error(`❌ Email send attempt ${attempt} failed:`, error.message);

        if (attempt < this.maxRetries + 1) {
          const delay = Math.pow(2, attempt - 1) * 1000; // 1s, 2s
          console.log(`   Retrying in ${delay}ms...`);
          await new Promise(resolve => setTimeout(resolve, delay));
        }
      }
    }

    // All retries failed
    console.error(`❌ All email send attempts failed for ${to}`);
    
    // Log failure
    await auditLogger.logEmailSendFailed(email_id, to, lastError);

    return {
      success: false,
      error: lastError.message,
      attempts: this.maxRetries + 1
    };
  }

  /**
   * Send RFQ acknowledgment email
   * @param {string} email_id - Email ID
   * @param {string} recipientEmail - Recipient email address
   * @param {string} originalSubject - Original email subject
   * @param {Object} projectDetails - Project details from AI analysis
   * @returns {Promise<Object>} Send result
   */
  async sendRFQAcknowledgment(email_id, recipientEmail, originalSubject, projectDetails = {}) {
    try {
      const senderName = this.extractSenderName(recipientEmail);
      const template = this.getRFQTemplate(originalSubject, senderName, projectDetails);

      const result = await this.sendWithRetry(
        recipientEmail,
        template.subject,
        template.text,
        template.html,
        email_id
      );

      return result;

    } catch (error) {
      console.error('Failed to send RFQ acknowledgment:', error.message);
      return {
        success: false,
        error: error.message
      };
    }
  }

  /**
   * Send invoice acknowledgment email
   * @param {string} email_id - Email ID
   * @param {string} recipientEmail - Recipient email address
   * @param {string} originalSubject - Original email subject
   * @returns {Promise<Object>} Send result
   */
  async sendInvoiceAcknowledgment(email_id, recipientEmail, originalSubject) {
    try {
      const senderName = this.extractSenderName(recipientEmail);
      const template = this.getInvoiceTemplate(originalSubject, senderName);

      const result = await this.sendWithRetry(
        recipientEmail,
        template.subject,
        template.text,
        template.html,
        email_id
      );

      return result;

    } catch (error) {
      console.error('Failed to send invoice acknowledgment:', error.message);
      return {
        success: false,
        error: error.message
      };
    }
  }

  /**
   * Verify SMTP connection
   * @returns {Promise<boolean>} True if connection successful
   */
  async verifyConnection() {
    try {
      await this.transporter.verify();
      console.log('✅ SMTP connection verified');
      return true;
    } catch (error) {
      console.error('❌ SMTP connection failed:', error.message);
      return false;
    }
  }
}

// Export singleton instance
const emailSender = new EmailSender();
export default emailSender;
