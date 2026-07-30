#!/usr/bin/env node

import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function updatePaymentStatus() {
  try {
    console.log('🔄 Updating payment statuses...');
    
    // Update completed payments to confirmed status
    const completedResult = await prisma.topUp.updateMany({
      where: {
        completed: true,
        status: 'pending'
      },
      data: {
        status: 'confirmed'
      }
    });
    
    console.log(`✅ Updated ${completedResult.count} completed payments to 'confirmed' status`);
    
    // Check for payments older than 24 hours that are still pending
    const expiredDate = new Date(Date.now() - 24 * 60 * 60 * 1000);
    const expiredResult = await prisma.topUp.updateMany({
      where: {
        completed: false,
        status: 'pending',
        createdAt: {
          lt: expiredDate
        }
      },
      data: {
        status: 'expired'
      }
    });
    
    console.log(`⏰ Marked ${expiredResult.count} old payments as 'expired'`);
    
    // Show current status distribution
    const statusCounts = await prisma.topUp.groupBy({
      by: ['status'],
      _count: {
        status: true
      }
    });
    
    console.log('\n📊 Current payment status distribution:');
    statusCounts.forEach(({ status, _count }) => {
      console.log(`  ${status}: ${_count.status} payments`);
    });
    
  } catch (error) {
    console.error('❌ Error updating payment statuses:', error);
  } finally {
    await prisma.$disconnect();
  }
}

updatePaymentStatus();
