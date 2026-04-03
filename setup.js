#!/usr/bin/env node

const fs = require('fs');
const path = require('path');
const readline = require('readline');

const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout
});

const question = (query) => new Promise((resolve) => rl.question(query, resolve));

async function setup() {
  console.log('🎰 Lucky Casino Backend Setup');
  console.log('==============================\n');

  try {
    // Check if .env already exists
    const envPath = path.join(__dirname, '.env');
    if (fs.existsSync(envPath)) {
      const overwrite = await question('⚠️  .env file already exists. Overwrite? (y/N): ');
      if (overwrite.toLowerCase() !== 'y') {
        console.log('Setup cancelled.');
        rl.close();
        return;
      }
    }

    console.log('📝 Please provide the following information:\n');

    // Database configuration
    const dbHost = await question('Database Host (default: localhost): ') || 'localhost';
    const dbUser = await question('Database Username (default: root): ') || 'root';
    const dbPassword = await question('Database Password: ');
    const dbName = await question('Database Name (default: lucky_casino): ') || 'lucky_casino';
    const dbPort = await question('Database Port (default: 3306): ') || '3306';

    // Server configuration
    const port = await question('Server Port (default: 3001): ') || '3001';
    const nodeEnv = await question('Environment (default: development): ') || 'development';

    // JWT configuration
    const jwtSecret = await question('JWT Secret (default: lucky_casino_secret_key_2024): ') || 'lucky_casino_secret_key_2024';
    const jwtExpiresIn = await question('JWT Expiration (default: 24h): ') || '24h';

    // CORS configuration
    const frontendUrl = await question('Frontend URL (default: http://localhost:3000): ') || 'http://localhost:3000';

    // Create .env content
    const envContent = `# Database Configuration
DB_HOST=${dbHost}
DB_USER=${dbUser}
DB_PASSWORD=${dbPassword}
DB_NAME=${dbName}
DB_PORT=${dbPort}

# Server Configuration
PORT=${port}
NODE_ENV=${nodeEnv}

# JWT Configuration
JWT_SECRET=${jwtSecret}
JWT_EXPIRES_IN=${jwtExpiresIn}

# CORS Configuration
FRONTEND_URL=${frontendUrl}
`;

    // Write .env file
    fs.writeFileSync(envPath, envContent);
    console.log('\n✅ .env file created successfully!');

    // Create database setup script
    const dbSetupScript = `-- Lucky Casino Database Setup
-- Run this script in your MySQL client

CREATE DATABASE IF NOT EXISTS ${dbName};
USE ${dbName};

-- The tables will be created automatically when you start the server
-- You can also run the server to initialize the database

-- To manually create tables, run the server once and check the console output
`;

    const dbSetupPath = path.join(__dirname, 'database-setup.sql');
    fs.writeFileSync(dbSetupPath, dbSetupScript);
    console.log('✅ Database setup script created: database-setup.sql');

    // Create startup instructions
    const instructions = `# Lucky Casino Backend Setup Complete!

## Next Steps:

1. **Install Dependencies:**
   \`\`\`bash
   npm install
   \`\`\`

2. **Set up MySQL Database:**
   - Make sure MySQL is running
   - Create the database: \`CREATE DATABASE ${dbName};\`
   - Or run the provided script: \`mysql -u ${dbUser} -p < database-setup.sql\`

3. **Start the Server:**
   \`\`\`bash
   # Development mode
   npm run dev

   # Production mode
   npm start
   \`\`\`

4. **Test the API:**
   - Health check: http://localhost:${port}/health
   - API docs: http://localhost:${port}/api

5. **Frontend Integration:**
   - Copy the examples/frontend-integration.js file to your frontend
   - Update the API_BASE_URL to match your server URL

## Environment Variables:
- Database: ${dbHost}:${dbPort}/${dbName}
- Server: http://localhost:${port}
- Frontend: ${frontendUrl}

## Security Notes:
- Change the JWT_SECRET in production
- Use strong database passwords
- Configure proper CORS settings for production

Happy coding! 🎰
`;

    const instructionsPath = path.join(__dirname, 'SETUP_INSTRUCTIONS.md');
    fs.writeFileSync(instructionsPath, instructions);
    console.log('✅ Setup instructions created: SETUP_INSTRUCTIONS.md');

    console.log('\n🎉 Setup completed successfully!');
    console.log('\n📋 Quick Start:');
    console.log('1. npm install');
    console.log('2. Create MySQL database');
    console.log('3. npm run dev');
    console.log('4. Check http://localhost:' + port + '/health');

  } catch (error) {
    console.error('❌ Setup failed:', error.message);
  } finally {
    rl.close();
  }
}

// Run setup if this file is executed directly
if (require.main === module) {
  setup();
}

module.exports = { setup }; 