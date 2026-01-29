/**
 * Simple Admin Setup Script
 * Sets up database and creates test data
 */

require('dotenv').config({ path: require('path').join(__dirname, '../../.env') });
const bcrypt = require('bcryptjs');
const { pool, initializeDatabase } = require('../../config/database');

const colors = {
  reset: '\x1b[0m',
  green: '\x1b[32m',
  red: '\x1b[31m',
  yellow: '\x1b[33m',
  cyan: '\x1b[36m',
  blue: '\x1b[34m'
};

function log(message, color = 'reset') {
  console.log(`${colors[color]}${message}${colors.reset}`);
}

async function setup() {
  try {
    log('\n🚀 ADMIN DASHBOARD SETUP\n', 'cyan');

    // Step 1: Initialize database
    log('📦 Step 1: Initializing database...', 'yellow');
    await initializeDatabase();
    log('✅ Database initialized', 'green');

    // Step 2: Update users table
    log('\n📝 Step 2: Updating users table with admin role...', 'yellow');
    try {
      await pool.query(`
        ALTER TABLE users 
        MODIFY COLUMN role ENUM('client', 'companion', 'admin') NOT NULL DEFAULT 'client'
      `);
      log('✅ Users table updated', 'green');
    } catch (error) {
      if (error.message.includes('Duplicate')) {
        log('⚠️  Users table already has admin role', 'yellow');
      } else {
        throw error;
      }
    }

    // Step 3: Create admin user
    log('\n👤 Step 3: Creating admin user...', 'yellow');
    const adminEmail = 'admin@meytle.com';
    const adminPassword = 'admin123';
    const hashedPassword = await bcrypt.hash(adminPassword, 10);

    const [existing] = await pool.query(
      'SELECT id, role FROM users WHERE email = ?',
      [adminEmail]
    );

    if (existing.length > 0) {
      await pool.query(
        `UPDATE users SET role = 'admin', password = ? WHERE email = ?`,
        [hashedPassword, adminEmail]
      );
      log(`✅ Updated existing user to admin (ID: ${existing[0].id})`, 'green');
    } else {
      const [result] = await pool.query(
        `INSERT INTO users (name, email, password, role) VALUES (?, ?, ?, ?)`,
        ['Admin User', adminEmail, hashedPassword, 'admin']
      );
      log(`✅ Created new admin user (ID: ${result.insertId})`, 'green');
    }

    // Step 4: Create test companion users
    log('\n🎭 Step 4: Creating test companion users...', 'yellow');
    const testPassword = await bcrypt.hash('test123', 10);
    const testUsers = [
      { name: 'Sarah Johnson', email: 'sarah@test.com', dob: '1995-03-15', idNum: 'ID-123456789' },
      { name: 'Mike Chen', email: 'mike@test.com', dob: '1992-07-22', idNum: 'ID-987654321' },
      { name: 'Emma Davis', email: 'emma@test.com', dob: '1998-11-05', idNum: 'ID-555444333' }
    ];

    for (const user of testUsers) {
      const [existingUser] = await pool.query(
        'SELECT id FROM users WHERE email = ?',
        [user.email]
      );

      let userId;
      if (existingUser.length > 0) {
        userId = existingUser[0].id;
      } else {
        const [result] = await pool.query(
          `INSERT INTO users (name, email, password, role) VALUES (?, ?, ?, ?)`,
          [user.name, user.email, testPassword, 'client']
        );
        userId = result.insertId;
        log(`  ✅ Created user: ${user.name}`, 'green');
      }

      // Create/update companion application
      const [existingApp] = await pool.query(
        'SELECT id FROM companion_applications WHERE user_id = ?',
        [userId]
      );

      if (existingApp.length > 0) {
        await pool.query(
          `UPDATE companion_applications 
           SET status = 'pending', 
               date_of_birth = ?, 
               government_id_number = ?,
               profile_photo_url = ?,
               government_id_url = ?
           WHERE user_id = ?`,
          [
            user.dob, 
            user.idNum,
            `/uploads/profiles/${user.name.toLowerCase().replace(' ', '-')}.jpg`,
            `/uploads/documents/${user.name.toLowerCase().replace(' ', '-')}-id.jpg`,
            userId
          ]
        );
      } else {
        await pool.query(
          `INSERT INTO companion_applications (
            user_id, 
            profile_photo_url,
            government_id_url,
            date_of_birth, 
            government_id_number,
            status
          ) VALUES (?, ?, ?, ?, ?, ?)`,
          [
            userId,
            `/uploads/profiles/${user.name.toLowerCase().replace(' ', '-')}.jpg`,
            `/uploads/documents/${user.name.toLowerCase().replace(' ', '-')}-id.jpg`,
            user.dob,
            user.idNum,
            'pending'
          ]
        );
        log(`  ✅ Created application for: ${user.name}`, 'green');
      }
    }

    // Step 5: Show summary
    log('\n📊 SETUP COMPLETE! Summary:\n', 'cyan');
    
    const [users] = await pool.query(
      'SELECT COUNT(*) as count FROM users WHERE role = "admin"'
    );
    log(`👑 Admin Users: ${users[0].count}`, 'blue');

    const [apps] = await pool.query(
      'SELECT COUNT(*) as count FROM companion_applications WHERE status = "pending"'
    );
    log(`📄 Pending Applications: ${apps[0].count}`, 'blue');

    const [allUsers] = await pool.query(
      'SELECT COUNT(*) as count FROM users'
    );
    log(`👥 Total Users: ${allUsers[0].count}`, 'blue');

    log('\n🔐 ADMIN CREDENTIALS:', 'cyan');
    log('═'.repeat(50), 'cyan');
    log(`📧 Email: ${adminEmail}`, 'green');
    log(`🔑 Password: ${adminPassword}`, 'green');
    log('═'.repeat(50), 'cyan');

    log('\n🌐 NEXT STEPS:', 'yellow');
    log('1. Make sure backend is running: npm start', 'blue');
    log('2. Open browser: http://localhost:5173/signin', 'blue');
    log('3. Login with admin credentials above', 'blue');
    log('4. You should see the admin dashboard with test applications\n', 'blue');

    process.exit(0);

  } catch (error) {
    log(`\n❌ Setup failed: ${error.message}`, 'red');
    log('\nPlease ensure:', 'yellow');
    log('  1. MySQL is running', 'yellow');
    log('  2. Database credentials are correct in config\n', 'yellow');
    process.exit(1);
  }
}

setup();






















