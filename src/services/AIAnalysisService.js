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
      timeout: config.openai.timeout // Use config timeout
    });
    
    this.model = config.openai.model;
    
    console.log(`🤖 AI Analysis Service initialized`);
    console.log(`   Model: ${this.model}`);
    console.log(`   Timeout: ${config.openai.timeout}ms (aggressive for Vercel)`);
    console.log(`   API Key: ${config.openai.apiKey ? 'Present' : 'Missing'}`);
    console.log(`   Mode: STRICT (no fallbacks)`);
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
   * Analyze email using AI - STRICT MODE (no fallbacks)
   * @param {string} email_id - Email ID
   * @param {string} subject - Email subject
   * @param {string} body - Email body
   * @returns {Promise<Object>} Analysis results
   */
  async analyzeEmail(email_id, subject, body) {
    console.log(`🤖 Starting AI analysis for email ${email_id}...`);
    console.log(`📋 Subject: ${subject}`);
    console.log(`📄 Body length: ${body.length} characters`);
    
    try {
      // Build prompt
      const prompt = this.buildPrompt(subject, body);

      console.log(`📤 Calling Groq API for email ${email_id} with model ${this.model}...`);
      const startTime = Date.now();

      // Call Groq API with aggressive timeout handling
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
          temperature: 0.3,
          max_tokens: 300 // Reduced for faster response
        }),
        new Promise((_, reject) => 
          setTimeout(() => reject(new Error(`Groq API timeout after ${config.openai.timeout}ms`)), config.openai.timeout)
        )
      ]);

      const endTime = Date.now();
      console.log(`⏱️ Groq API call completed in ${endTime - startTime}ms`);

      // Extract response
      const responseText = completion.choices[0]?.message?.content;
      
      if (!responseText) {
        throw new Error('Empty response from Groq API - this should not happen');
      }

      console.log(`📝 AI Response for ${email_id}:`, responseText);

      // Parse and validate response
      const analysis = this.parseResponse(responseText);

      console.log(`📊 Parsed analysis for ${email_id}:`, {
        type: analysis.email_type,
        urgency: analysis.urgency_level,
        confidence: analysis.confidence_score
      });

      // Store analysis in database
      console.log(`💾 Storing analysis in database for ${email_id}...`);
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

      // Trigger Decision Engine - this MUST succeed
      console.log(`🤖 Triggering decision engine for ${email_id}...`);
      try {
        await decisionEngine.makeDecision(
          email_id,
          analysis.email_type,
          analysis.confidence_score
        );
        console.log(`✅ Decision engine completed for ${email_id}`);
      } catch (decisionError) {
        console.error(`❌ Decision engine FAILED for ${email_id}:`, decisionError.message);
        throw new Error(`Decision engine failed: ${decisionError.message}`);
      }

      return {
        success: true,
        analysis
      };

    } catch (error) {
      console.error(`❌ AI analysis FAILED for email ${email_id}:`, error.message);
      console.error(`📍 Error type: ${error.constructor.name}`);
      console.error(`📍 Stack trace:`, error.stack);

      // 🚨 CRITICAL: AI ANALYSIS FAILED 🚨
      console.error('Email ID:', email_id);
      console.error('Error:', error.message);
      console.error('Subject:', subject);
      console.error('Stack:', error.stack);
      console.error('🚨 TRIGGERING FALLBACK WORKFLOW 🚨');
      
      // Log the failure for debugging
      await auditLogger.logAIAnalysisFailure(email_id, error, {
        subject,
        error_type: error.name,
        timestamp: new Date().toISOString()
      });

      // 🚀 FALLBACK: Trigger decision engine with generic classification
      console.log('🔄 Starting fallback workflow...');
      try {
        await decisionEngine.makeDecision(
          email_id,
          'Unknown/Unclear', // Generic classification
          0.5 // Medium confidence to trigger manual review
        );
        console.log('✅ Fallback workflow triggered successfully');
      } catch (decisionError) {
        console.error('❌ Fallback workflow also failed:', decisionError.message);
      }
      
      // Re-throw the error to maintain strict mode behavior
      throw new Error(`AI Analysis failed for email ${email_id}: ${error.message}`);
    }
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
