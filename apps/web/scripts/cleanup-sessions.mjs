#!/usr/bin/env node

import { PrismaClient } from '@prisma/client';
import { config } from 'dotenv';

// Load environment variables
config();

const prisma = new PrismaClient();

async function cleanupExpiredSessions() {
  try {
    console.log('🧹 Starting Telegram session cleanup...');
    
    const result = await prisma.telegramSession.deleteMany({
      where: {
        expiresAt: { lt: new Date() }
      }
    });
    
    console.log(`✅ Cleaned up ${result.count} expired sessions`);
    
    // Also clean up inactive sessions older than 24 hours
    const inactiveResult = await prisma.telegramSession.deleteMany({
      where: {
        isActive: false,
        createdAt: { lt: new Date(Date.now() - 24 * 60 * 60 * 1000) }
      }
    });
    
    console.log(`✅ Cleaned up ${inactiveResult.count} old inactive sessions`);
    
  } catch (error) {
    console.error('❌ Session cleanup failed:', error);
    process.exit(1);
  } finally {
    await prisma.$disconnect();
  }
}

cleanupExpiredSessions();
