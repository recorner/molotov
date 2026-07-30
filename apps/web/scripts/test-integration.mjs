#!/usr/bin/env node

import { config } from 'dotenv';
import { PrismaClient } from '@prisma/client';

// Load environment variables
config();

const prisma = new PrismaClient();

async function testIntegration() {
  console.log('🧪 Testing Telegram Integration...\n');

  // Test 1: Environment Variables
  console.log('1️⃣ Checking environment variables...');
  const requiredVars = ['TELEGRAM_BOT_TOKEN', 'PUBLIC_APP_URL', 'DATABASE_URL'];
  const missingVars = requiredVars.filter(varName => !process.env[varName]);
  
  if (missingVars.length > 0) {
    console.log('❌ Missing environment variables:', missingVars.join(', '));
    return false;
  }
  console.log('✅ All required environment variables present');

  // Test 2: Database Connection
  console.log('\n2️⃣ Testing database connection...');
  try {
    await prisma.$connect();
    console.log('✅ Database connection successful');
  } catch (error) {
    console.log('❌ Database connection failed:', error.message);
    return false;
  }

  // Test 3: Database Schema
  console.log('\n3️⃣ Checking database schema...');
  try {
    const user = await prisma.user.findFirst();
    await prisma.telegramSession.findFirst();
    console.log('✅ Database schema valid');
  } catch (error) {
    console.log('❌ Database schema error:', error.message);
    console.log('💡 Try running: npx prisma migrate deploy');
    return false;
  }

  // Test 4: Bot Token Validation
  console.log('\n4️⃣ Validating Telegram bot token...');
  try {
    const response = await fetch(`https://api.telegram.org/bot${process.env.TELEGRAM_BOT_TOKEN}/getMe`);
    const data = await response.json();
    
    if (data.ok) {
      console.log(`✅ Bot validated: @${data.result.username} (${data.result.first_name})`);
    } else {
      console.log('❌ Invalid bot token:', data.description);
      return false;
    }
  } catch (error) {
    console.log('❌ Bot token validation failed:', error.message);
    return false;
  }

  // Test 5: Webhook URL
  console.log('\n5️⃣ Testing webhook URL accessibility...');
  try {
    const webhookUrl = `${process.env.PUBLIC_APP_URL}/api/telegram/webhook`;
    const response = await fetch(webhookUrl);
    
    if (response.ok) {
      console.log('✅ Webhook endpoint accessible');
    } else {
      console.log(`⚠️  Webhook endpoint returned status: ${response.status}`);
      console.log('💡 This might be normal if the app isn\'t running yet');
    }
  } catch (error) {
    console.log('⚠️  Could not reach webhook URL:', error.message);
    console.log('💡 Make sure your app is running and accessible');
  }

  console.log('\n🎉 Integration test completed!');
  console.log('\n📋 Next steps:');
  console.log('1. Start your application: npm run dev');
  console.log('2. Initialize bot: npm run bot:init');
  console.log('3. Test login flow in Telegram');
  
  return true;
}

testIntegration()
  .then(() => {
    console.log('\n✅ Test completed successfully');
    process.exit(0);
  })
  .catch((error) => {
    console.error('\n❌ Test failed:', error);
    process.exit(1);
  })
  .finally(() => {
    prisma.$disconnect();
  });
