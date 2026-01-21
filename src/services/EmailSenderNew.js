import nodemailer from 'nodemailer';
import OpenAI from 'openai';
import { config } from '../config/index.js';
import auditLogger from './AuditLogger.js';

class EmailSenderNew {
  constructor() {
    this.transporter = nodemailer.createTransport({
      host: config.smtp.host,
      port: config.smtp.port,
      secure: config.smtp.port === 465,
      auth: {
        user: config.smtp.user,
        pass: config.smtp.password
      }
    });

    this.groqClient = new OpenAI({
      apiKey: config.openai.apiKey,
      baseURL: 'https://api.groq.com/openai/v1',
      timeout: 10000
    });

    this.fromAddress = config.smtp.from;
    this.maxRetries = 2;
  }

  extractSenderName(email) {
    if (!email) return 'there';
    const localPart = email.split('@')[0];
    const parts = localPart.split(/[._-]/);
    if (parts.length > 1) {
      return parts.map(part => part.charAt(0).toUpperCase() + part.slice(1)).join(' ');
    }
    return 'there';
  }

  convertToHTML(text) {
    return text.split('\n\n').map(paragraph => `<p>${paragraph.replace(/\n/g, '<br>')}</p>`).join('\n');
  }

  async generateAIResponse(originalSubject, originalBody, senderEmail, emailType, projectDetails = {}) {
    try {
      console.log(`🤖 Generating AI response for ${emailType} email...`);
      const senderName = this.extractSenderName(senderEmail);
      
      const prompt = `You are a professional customer service representative for InvexTech, a construction company.

COMPANY INFO:
- Company: InvexTech
- Address: 30 N Gould St, Ste N, Sheridan, WY 82801, United States
- Phone: +1 (787) 710-2725
- Email: info@invextech.com

INCOMING EMAIL:
- From: ${senderEmail}
- Subject: ${originalSubject}
- Type: ${emailType}
- Content: ${originalBody.substring(0, 500)}...

Generate a personalized email response. Address sender as "${senderName}". Acknowledge their specific request. Keep professional but warm. Maximum 150 words. Generate ONLY the email body text.`;

      const completion = await this.groqClient.chat.completions.create({
        model: 'llama-3.1-8b-instant',
        messages: [
          { role: 'system', content: 'You are a professional customer service representative.' },
          { role: 'user', content: prompt }
        ],
        temperature: 0.7,
        max_tokens: 300
      });

      const aiResponse = completion.choices[0]?.message?.content;
      if (!aiResponse) throw new Error('Empty response from Groq API');

      return {
        subject: `Re: ${originalSubject}`,
        text: aiResponse,
        html: this.convertToHTML(aiResponse)
      };

    } catch (error) {
      console.error('❌ AI response generation failed:', error.message);
      const senderName = this.extractSenderName(senderEmail);
      const fallbackText = `Dear ${senderName},

Thank you for contacting InvexTech. We have received your message and our team will review it promptly.

We aim to respond to all inquiries within 24 hours.

Best regards,

InvexTech
30 N Gould St, Ste N, Sheridan, WY 82801, United States
Phone: +1 (787) 710-2725
Email: info@invextech.com`;

      return {
        subject: `Re: ${originalSubject}`,
        text: fallbackText,
        html: this.convertToHTML(fallbackText)
      };
    }
  }

  async sendWithRetry(to, subject, text, html, email_id) {
    let lastError;
    for (let attempt = 1; attempt <= this.maxRetries + 1; attempt++) {
      try {
        console.log(`Sending email to ${to} (attempt ${attempt}/${this.maxRetries + 1})...`);
        const info = await this.transporter.sendMail({
          from: this.fromAddress,
          to, subject, text, html
        });
        console.log(`✅ Email sent successfully: ${info.messageId}`);
        await auditLogger.logEmailSent(email_id, to, info.messageId);
        return { success: true, messageId: info.messageId, attempt };
      } catch (error) {
        lastError = error;
        console.error(`❌ Email send attempt ${attempt} failed:`, error.message);
        if (attempt < this.maxRetries + 1) {
          const delay = Math.pow(2, attempt - 1) * 1000;
          console.log(`   Retrying in ${delay}ms...`);
          await new Promise(resolve => setTimeout(resolve, delay));
        }
      }
    }
    console.error(`❌ All email send attempts failed for ${to}`);
    await auditLogger.logEmailSendFailed(email_id, to, lastError);
    return { success: false, error: lastError.message, attempts: this.maxRetries + 1 };
  }

  async sendAIResponse(email_id, recipientEmail, originalSubject, originalBody, emailType, projectDetails = {}) {
    try {
      console.log(`📧 NEW EmailSender - sendAIResponse called for email ${email_id}`);
      console.log(`   Recipient: ${recipientEmail}`);
      console.log(`   Subject: ${originalSubject}`);
      console.log(`   Type: ${emailType}`);

      const template = await this.generateAIResponse(originalSubject, originalBody, recipientEmail, emailType, projectDetails);
      console.log(`📧 Generated template:`, template.subject);

      const result = await this.sendWithRetry(recipientEmail, template.subject, template.text, template.html, email_id);
      console.log(`📧 Final send result:`, result);
      return result;

    } catch (error) {
      console.error('Failed to send AI response:', error.message);
      return { success: false, error: error.message };
    }
  }
}

const emailSenderNew = new EmailSenderNew();
export default emailSenderNew;