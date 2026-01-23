-- Migration: Add attachment fields to emails table
-- Date: 2026-01-21
-- Description: Adds has_attachments and attachment_info fields to support email attachments

-- Add attachment fields to emails table
ALTER TABLE emails 
ADD COLUMN IF NOT EXISTS has_attachments BOOLEAN DEFAULT FALSE,
ADD COLUMN IF NOT EXISTS attachment_info JSONB DEFAULT '[]'::jsonb;

-- Add indexes for attachment fields
CREATE INDEX IF NOT EXISTS idx_emails_has_attachments ON emails(has_attachments);
CREATE INDEX IF NOT EXISTS idx_emails_attachment_info ON emails USING GIN(attachment_info);

-- Comments for documentation
COMMENT ON COLUMN emails.has_attachments IS 'Whether the email contains attachments';
COMMENT ON COLUMN emails.attachment_info IS 'JSON array containing attachment metadata (name, contentType, size)';