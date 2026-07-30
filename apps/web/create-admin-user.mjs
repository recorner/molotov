#!/usr/bin/env node

import { PrismaClient } from '@prisma/client';
import argon from 'argon2';
import { config } from 'dotenv';

// Load environment variables
config();

const prisma = new PrismaClient();

async function createAdminUser() {
  try {
    console.log('🔨 Creating admin user "bolton"...');

    // Check if user already exists
    const existingUser = await prisma.user.findUnique({
      where: { username: 'bolton' },
    });

    if (existingUser) {
      console.log('⚠️  User "bolton" already exists. Updating to admin role...');
      
      // Update existing user to admin role
      const updatedUser = await prisma.user.update({
        where: { username: 'bolton' },
        data: {
          role: ['ADMIN'],
        },
      });

      console.log('✅ Successfully updated user "bolton" to admin role');
      console.log(`   User ID: ${updatedUser.id}`);
      console.log(`   Username: ${updatedUser.username}`);
      console.log(`   Role: ${updatedUser.role.join(', ')}`);
      return;
    }

    // Generate M2FA codes
    const md2faCodes = [];
    for (let i = 0; i < 10; i++) {
      const code = 'bigfat' + generateRandomString(20);
      md2faCodes.push(code);
    }
    md2faCodes.sort();

    // Hash the M2FA codes
    const hashedMd2faCodes = await Promise.all(md2faCodes.map(code => argon.hash(code)));

    // Create the admin user
    const adminUser = await prisma.user.create({
      data: {
        username: 'bolton',
        password: await argon.hash('admin123'), // Default password
        role: ['ADMIN'],
        md2faCodes: hashedMd2faCodes,
        balance: 1000, // Give admin some initial balance
      },
    });

    console.log('✅ Successfully created admin user "bolton"');
    console.log(`   User ID: ${adminUser.id}`);
    console.log(`   Username: ${adminUser.username}`);
    console.log(`   Role: ${adminUser.role.join(', ')}`);
    console.log(`   Default Password: admin123`);
    console.log(`   Initial Balance: $${adminUser.balance}`);
    console.log('\n📋 M2FA Backup Codes (save these securely):');
    md2faCodes.forEach((code, index) => {
      console.log(`   ${index + 1}: ${code}`);
    });

  } catch (error) {
    console.error('❌ Error creating admin user:', error);
  } finally {
    await prisma.$disconnect();
  }
}

// Function to generate a random string of given length
function generateRandomString(length) {
  const charset = 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
  let result = '';
  for (let i = 0; i < length; i++) {
    const randomIndex = Math.floor(Math.random() * charset.length);
    result += charset[randomIndex];
  }
  return result;
}

createAdminUser();
