-- Migration: Create all required tables for construction email automation
-- Date: 2026-01-16
-- Description: Creates emails, email_analysis, workflows, and audit_logs tables

-- Enable UUID extension if not already enabled
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- Table: emails
-- Stores all incoming emails received via webhook
CREATE TABLE IF NOT EXISTS emails (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  from_email VARCHAR(255) NOT NULL,
  subject TEXT NOT NULL,
  body TEXT NOT NULL,
  received_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  status VARCHAR(50) NOT NULL DEFAULT 'Received',
  priority VARCHAR(20),
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Indexes for emails table
CREATE INDEX IF NOT EXISTS idx_emails_status ON emails(status);
CREATE INDEX IF NOT EXISTS idx_emails_received_at ON emails(received_at);
CREATE INDEX IF NOT EXISTS idx_emails_priority ON emails(priority);
CREATE INDEX IF NOT EXISTS idx_emails_from_email ON emails(from_email);

-- Table: email_analysis
-- Stores AI analysis results for each email
CREATE TABLE IF NOT EXISTS email_analysis (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  email_id UUID NOT NULL REFERENCES emails(id) ON DELETE CASCADE,
  email_type VARCHAR(50) NOT NULL,
  urgency VARCHAR(20) NOT NULL,
  confidence_score DECIMAL(3,2) NOT NULL CHECK (confidence_score >= 0 AND confidence_score <= 1),
  extracted_data JSONB,
  reasoning TEXT,
  analyzed_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  UNIQUE(email_id)
);

-- Indexes for email_analysis table
CREATE INDEX IF NOT EXISTS idx_email_analysis_email_id ON email_analysis(email_id);
CREATE INDEX IF NOT EXISTS idx_email_analysis_email_type ON email_analysis(email_type);
CREATE INDEX IF NOT EXISTS idx_email_analysis_confidence ON email_analysis(confidence_score);

-- Table: workflows
-- Stores workflow execution records
CREATE TABLE IF NOT EXISTS workflows (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  email_id UUID NOT NULL REFERENCES emails(id) ON DELETE CASCADE,
  workflow_type VARCHAR(50) NOT NULL,
  automation_used BOOLEAN NOT NULL,
  executed_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  actions_taken JSONB,
  success BOOLEAN NOT NULL DEFAULT true
);

-- Indexes for workflows table
CREATE INDEX IF NOT EXISTS idx_workflows_email_id ON workflows(email_id);
CREATE INDEX IF NOT EXISTS idx_workflows_executed_at ON workflows(executed_at);
CREATE INDEX IF NOT EXISTS idx_workflows_type ON workflows(workflow_type);

-- Table: audit_logs
-- Stores all system actions for traceability
CREATE TABLE IF NOT EXISTS audit_logs (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  action_type VARCHAR(50) NOT NULL,
  related_email_id UUID REFERENCES emails(id) ON DELETE SET NULL,
  description TEXT NOT NULL,
  timestamp TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  success BOOLEAN NOT NULL,
  metadata JSONB,
  error_details TEXT
);

-- Indexes for audit_logs table
CREATE INDEX IF NOT EXISTS idx_audit_logs_action_type ON audit_logs(action_type);
CREATE INDEX IF NOT EXISTS idx_audit_logs_timestamp ON audit_logs(timestamp);
CREATE INDEX IF NOT EXISTS idx_audit_logs_related_email_id ON audit_logs(related_email_id);
CREATE INDEX IF NOT EXISTS idx_audit_logs_success ON audit_logs(success);

-- Comments for documentation
COMMENT ON TABLE emails IS 'Stores all incoming emails received via webhook';
COMMENT ON TABLE email_analysis IS 'Stores AI analysis results for each email';
COMMENT ON TABLE workflows IS 'Stores workflow execution records';
COMMENT ON TABLE audit_logs IS 'Stores all system actions for traceability';

COMMENT ON COLUMN emails.status IS 'Email processing status: Received, Analyzing, Pending Review, Finance Review, Escalated, Manual Review';
COMMENT ON COLUMN emails.priority IS 'Email priority: Low, Medium, High, Critical';
COMMENT ON COLUMN email_analysis.confidence_score IS 'AI confidence score between 0 and 1';
COMMENT ON COLUMN email_analysis.extracted_data IS 'JSON object containing extracted information (project_type, location, deadline, etc.)';
COMMENT ON COLUMN workflows.automation_used IS 'Whether automated actions were taken';
COMMENT ON COLUMN workflows.actions_taken IS 'JSON array of actions performed during workflow execution';
COMMENT ON COLUMN audit_logs.metadata IS 'JSON object containing additional context for the action';
