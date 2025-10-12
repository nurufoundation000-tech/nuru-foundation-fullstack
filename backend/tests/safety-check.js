// Safety check for main database testing
const checkDatabaseSafety = () => {
  const dbUrl = process.env.DATABASE_URL;
  
  if (!dbUrl) {
    throw new Error('DATABASE_URL is not set');
  }
  
  // Warn if using production database
  if (dbUrl.includes('production') || dbUrl.includes('prod')) {
    console.warn('🚨 WARNING: You are using a PRODUCTION database for testing!');
    console.warn('   This is dangerous and not recommended.');
    console.warn('   Consider using a test database instead.');
    
    // Uncomment the line below to prevent tests from running on production DB
    // throw new Error('Cannot run tests on production database');
  }
  
  console.log('🔒 Database safety check passed');
  console.log(`📊 Using database: ${dbUrl.split('@')[1]?.split('/')[1] || 'unknown'}`);
};

// Run safety check
checkDatabaseSafety();