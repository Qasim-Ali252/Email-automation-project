import OpenAI from 'openai';
import { config } from '../config/index.js';
import databaseService from './DatabaseService.js';
import auditLogger from './AuditLogger.js';
import decisionEngine from './DecisionEngine.js';

/**
 * AI Analysis Service
 * Uses Groq API (OpenAI-compatible) to classify emails and extract structured information
 */
class AIAnalysisService {
  constructor() {
    // Initialize OpenAI client (compatible with Groq)
    this.client = new OpenAI({
      apiKey: config.openai.apiKey,
      baseURL: 'https://api.groq.com/openai/v1', // Groq API endpoint
      timeout: 15000 // Reduced timeout to 15 seconds
    });
    
    this.model = config.openai.model;
  }

  /**
   * Build structured prompt for email classification
   * @param {string} subject - Email subject
   * @param {string} body - Email body
   * @returns {string} Formatted prompt
   */
  buildPrompt(subject, body) {
    return `You are an AI assistant analyzing construction-related emails.

Classify the email into one of these types:
- RFQ/Bid Request: Requests for quotes or bids on construction projects
- Urgent Site Issue: Critical problems requiring immediate attention (safety issues, emergencies, critical failures)
- Invoice/Billing: Payment requests or billing inquiries
- Unknown/Unclear: Cannot be confidently classified

Extract the following information if present:
- project_type: Type of construction project (e.g., "Office Building", "Residential", "Infrastructure")
- location: Project location (city, address, or general area)
- estimated_value: Estimated project value in dollars (numeric value only, no currency symbols)
- deadline: Any mentioned deadlines (in ISO date format if possible, or as mentioned)
- urgency_level: Low, Medium, or High

Provide a confidence_score (0-1) indicating how confident you are in your classification.
Provide reasoning explaining your classification decision.

Email Subject: ${subject}
Email Body: ${body}

Respond ONLY with valid JSON in this exact format:
{
  "email_type": "RFQ/Bid Request" | "Urgent Site Issue" | "Invoice/Billing" | "Unknown/Unclear",
  "project_type": "string or null",
  "location": "string or null",
  "estimated_value": number or null,
  "deadline": "string or null",
  "urgency_level": "Low" | "Medium" | "High",
  "confidence_score": number between 0 and 1,
  "reasoning": "string explaining your classification"
}`;
  }

  /**
   * Parse and validate AI response
   * @param {string} responseText - Raw response from AI
   * @returns {Object} Parsed and validated analysis result
   */
  parseResponse(responseText) {
    try {
      // Try to extract JSON from response (in case there's extra text)
      const jsonMatch = responseText.match(/\{[\s\S]*\}/);
      if (!jsonMatch) {
        throw new Error('No JSON found in response');
      }

      const parsed = JSON.parse(jsonMatch[0]);

      // Validate required fields
      if (!parsed.email_type) {
        throw new Error('Missing email_type in response');
      }

      if (!parsed.urgency_level) {
        throw new Error('Missing urgency_level in response');
      }

      if (typeof parsed.confidence_score !== 'number') {
        throw new Error('Missing or invalid confidence_score in response');
      }

      // Ensure confidence_score is between 0 and 1
      parsed.confidence_score = Math.max(0, Math.min(1, parsed.confidence_score));

      // Validate email_type
      const validTypes = ['RFQ/Bid Request', 'Urgent Site Issue', 'Invoice/Billing', 'Unknown/Unclear'];
      if (!validTypes.includes(parsed.email_type)) {
        parsed.email_type = 'Unknown/Unclear';
        parsed.confidence_score = 0;
      }

      // Validate urgency_level
      const validUrgency = ['Low', 'Medium', 'High'];
      if (!validUrgency.includes(parsed.urgency_level)) {
        parsed.urgency_level = 'Medium';
      }

      // Ensure reasoning exists
      if (!parsed.reasoning) {
        parsed.reasoning = 'No reasoning provided';
      }

      return parsed;

    } catch (error) {
      console.error('Failed to parse AI response:', error.message);
      console.error('Response text:', responseText);
      
      // Return safe default
      return {
        email_type: 'Unknown/Unclear',
        project_type: null,
        location: null,
        estimated_value: null,
        deadline: null,
        urgency_level: 'Medium',
        confidence_score: 0,
        reasoning: `Failed to parse AI response: ${error.message}`
      };
    }
  }

  /**
   * Analyze email using AI with retry logic
   * @param {string} email_id - Email ID
   * @param {string} subject - Email subject
   * @param {string} body - Email body
   * @returns {Promise<Object>} Analysis results
   */
  async analyzeEmail(email_id, subject, body) {
    const maxRetries = 2;
    let lastError;

    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      try {
        console.log(`Analyzing email ${email_id}... (attempt ${attempt}/${maxRetries})`);

        // Build prompt
        const prompt = this.buildPrompt(subject, body);

        // Call Groq API with timeout handling
        const completion = await Promise.race([
          this.client.chat.completions.create({
            model: this.model,
            messages: [
              {
                role: 'system',
                content: 'You are an expert at analyzing construction-related emails. Always respond with valid JSON only.'
              },
              {
                role: 'user',
                content: prompt
              }
            ],
            temperature: 0.3, // Lower temperature for more consistent results
            max_tokens: 500
          }),
          new Promise((_, reject) => 
            setTimeout(() => reject(new Error('API call timeout after 15 seconds')), 15000)
          )
        ]);

        // Extract response
        const responseText = completion.choices[0]?.message?.content;
        
        if (!responseText) {
          throw new Error('Empty response from AI');
        }

        console.log('AI Response:', responseText);

        // Parse and validate response
        const analysis = this.parseResponse(responseText);

        // Store analysis in database
        await databaseService.insertAnalysis({
          email_id,
          email_type: analysis.email_type,
          urgency: analysis.urgency_level,
          confidence_score: analysis.confidence_score,
          extracted_data: {
            project_type: analysis.project_type,
            location: analysis.location,
            estimated_value: analysis.estimated_value,
            deadline: analysis.deadline
          },
          reasoning: analysis.reasoning
        });

        // Log success
        await auditLogger.logAIAnalysisSuccess(email_id, {
          email_type: analysis.email_type,
          urgency: analysis.urgency_level,
          confidence_score: analysis.confidence_score
        });

        console.log(`✅ Analysis complete for email ${email_id}: ${analysis.email_type} (confidence: ${analysis.confidence_score})`);

        // Trigger Decision Engine (non-blocking)
        decisionEngine.makeDecision(
          email_id,
          analysis.email_type,
          analysis.confidence_score
        ).catch(error => {
          console.error('Decision engine failed:', error.message);
        });

        return {
          success: true,
          analysis
        };

      } catch (error) {
        lastError = error;
        console.error(`❌ AI analysis attempt ${attempt} failed for email ${email_id}:`, error.message);
        
        // If this is not the last attempt, wait before retrying
        if (attempt < maxRetries) {
          console.log(`⏳ Retrying in 2 seconds...`);
          await new Promise(resolve => setTimeout(resolve, 2000));
        }
      }
    }

    // All attempts failed
    console.error(`❌ AI analysis failed for email ${email_id} after ${maxRetries} attempts:`, lastError.message);

    // Log failure
    await auditLogger.logAIAnalysisFailure(email_id, lastError, {
      subject,
      error_type: lastError.name,
      attempts: maxRetries
    });

    // Store failed analysis with confidence_score = 0
    try {
      await databaseService.insertAnalysis({
        email_id,
        email_type: 'Unknown/Unclear',
        urgency: 'Medium',
        confidence_score: 0,
        extracted_data: {},
        reasoning: `AI analysis failed after ${maxRetries} attempts: ${lastError.message}`
      });
    } catch (dbError) {
      console.error('Failed to store failed analysis:', dbError.message);
    }

    return {
      success: false,
      error: lastError.message,
      analysis: {
        email_type: 'Unknown/Unclear',
        urgency_level: 'Medium',
        confidence_score: 0,
        reasoning: `AI analysis failed after ${maxRetries} attempts: ${lastError.message}`
      }
    };
  }

  /**
   * Get analysis for an email
   * @param {string} email_id - Email ID
   * @returns {Promise<Object>} Analysis record
   */
  async getAnalysis(email_id) {
    return databaseService.getAnalysisByEmailId(email_id);
  }
}

// Export singleton instance
const aiAnalysisService = new AIAnalysisService();
export default aiAnalysisService;
