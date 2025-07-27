// scripts/setup-admin-system.js
// Script to set up the dynamic admin system
import adminManager from '../utils/adminManager.js';
import { BOT_TOKEN, ADMIN_GROUP } from '../config.js';
import TelegramBot from 'node-telegram-bot-api';
import '../database.js'; // Initialize database

async function setupAdminSystem() {
  console.log('🔧 Setting up dynamic admin system...');
  
  if (!BOT_TOKEN) {
    console.error('❌ BOT_TOKEN not found in environment variables');
    process.exit(1);
  }

  if (!ADMIN_GROUP) {
    console.error('❌ ADMIN_GROUP not found in environment variables');
    console.log('💡 Please add ADMIN_GROUP=your_group_chat_id to your .env file');
    process.exit(1);
  }

  try {
    // Create bot instance
    const bot = new TelegramBot(BOT_TOKEN, { polling: false });
    
    // Add admin group
    console.log(`📝 Adding admin group: ${ADMIN_GROUP}`);
    const groupAdded = await adminManager.addAdminGroup(ADMIN_GROUP, 'Main Admin Group');
    
    if (groupAdded) {
      console.log('✅ Admin group added successfully');
      
      // Update admins from the group
      console.log('👥 Updating admin list from Telegram group...');
      const adminCount = await adminManager.updateAdminsFromGroup(bot, ADMIN_GROUP);
      console.log(`✅ Updated ${adminCount} admins from the group`);
      
      // Display current admins
      const allAdmins = await adminManager.getAllAdmins();
      console.log('\n📊 Current Admin Status:');
      console.log(`👑 Total Admins: ${allAdmins.length}`);
      
      if (allAdmins.length > 0) {
        console.log('\n👥 Admin List:');
        allAdmins.forEach((admin, index) => {
          console.log(`  ${index + 1}. ${admin.first_name} ${admin.username ? `(@${admin.username})` : ''} - ID: ${admin.user_id}`);
        });
      }
      
      console.log('\n🎉 Dynamic admin system setup completed!');
      console.log('💡 The bot will now recognize all administrators from your Telegram group');
      console.log('🔄 Admin list will be automatically updated when the bot starts');
      
    } else {
      console.error('❌ Failed to add admin group');
    }
    
  } catch (error) {
    console.error('❌ Setup failed:', error.message);
  }
  
  process.exit(0);
}

setupAdminSystem();
