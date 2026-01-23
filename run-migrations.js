/**
 * Database Migration Runner
 * Executes SQL migration files against Supabase database
 */

import { createClient } from '@supabase/supabase-js';
import { readFileSync } from 'fs';
import dotenv from 'dotenv';

dotenv.config();

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_KEY
);

async function runMigration(filePath) {
  console.log(`\n📄 Running migration: ${filePath}`);
  
  try {
    // Read SQL file
    const sql = readFileSync(filePath, 'utf8');
    
    // Split by semicolons to execute statements individually
    const statements = sql
      .split(';')
      .map(s => s.trim())
      .filter(s => s.length > 0 && !s.startsWith('--'));
    
    console.log(`   Found ${statements.length} SQL statements`);
    
    // Execute each statement
    for (let i = 0; i < statements.length; i++) {
      const statement = statements[i];
      
      // Skip comments and empty statements
      if (statement.startsWith('--') || statement.length === 0) {
        continue;
      }
      
      try {
        const { error } = await supabase.rpc('exec_sql', { sql_query: statement + ';' });
        
        if (error) {
          // Try direct execution if RPC fails
          console.log(`   Statement ${i + 1}: Executing directly...`);
          // Note: Supabase JS client doesn't support raw SQL execution
          // We'll need to use the REST API or SQL editor
          console.log(`   ⚠️  Please run this migration manually in Supabase SQL Editor`);
          console.log(`   Migration file: ${filePath}`);
          return false;
        }
        
        console.log(`   ✅ Statement ${i + 1} executed`);
      } catch (err) {
        console.error(`   ❌ Statement ${i + 1} failed:`, err.message);
        return false;
      }
    }
    
    console.log(`   ✅ Migration completed successfully`);
    return true;
    
  } catch (error) {
    console.error(`   ❌ Migration failed:`, error.message);
    return false;
  }
}

async function main() {
  console.log('🚀 Database Migration Runner\n');
  console.log('=' .repeat(80));
  
  // Check connection
  console.log('Checking database connection...');
  const { data, error } = await supabase.from('_migrations').select('*').limit(1);
  
  if (error && !error.message.includes('does not exist')) {
    console.error('❌ Cannot connect to database:', error.message);
    console.log('\n⚠️  Please run the migration manually:');
    console.log('   1. Open Supabase Dashboard');
    console.log('   2. Go to SQL Editor');
    console.log('   3. Copy and paste the contents of: database/migrations/001_create_tables.sql');
    console.log('   4. Click "Run"\n');
    process.exit(1);
  }
  
  console.log('✅ Database connection successful\n');
  
  // Run migrations
  const migrations = [
    'database/migrations/001_create_tables.sql',
    'database/migrations/002_add_attachment_fields.sql'
  ];
  
  let allSuccess = true;
  
  for (const migration of migrations) {
    const success = await runMigration(migration);
    if (!success) {
      allSuccess = false;
    }
  }
  
  console.log('=' .repeat(80));
  
  if (allSuccess) {
    console.log('\n✅ All migrations completed successfully!\n');
  } else {
    console.log('\n⚠️  Some migrations need to be run manually in Supabase SQL Editor');
    console.log('   Files: database/migrations/001_create_tables.sql');
    console.log('          database/migrations/002_add_attachment_fields.sql\n');
    process.exit(1);
  }
}

main().catch(error => {
  console.error('Migration runner failed:', error);
  process.exit(1);
});
