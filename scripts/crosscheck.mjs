import dotenv from 'dotenv'; dotenv.config({path:'/root/molotov/.env'});
import { PrismaClient } from '@prisma/client';
const { default: db } = await import('/root/molotov/apps/bot/db/pgCompat.js');
const prisma = new PrismaClient();
const get=(s,p)=>new Promise((r,j)=>db.get(s,p,(e,x)=>e?j(e):r(x)));
const run=(s,p)=>new Promise((r,j)=>db.run(s,p,function(e){e?j(e):r(this)}));

// 1. Web (Prisma) creates a product
const seller = await prisma.user.findFirst({ where: { username: 'system' } });
const cat = await prisma.category.findFirst({ where: { parentId: { not: null } } });
const p = await prisma.product.create({
  data: { name: 'Cross-check widget', description: 'made by web', price: 12.34,
          userId: seller.id, categoryId: cat.id, type: 'LICENSE', stock: 'KEY-1\nKEY-2' }
});
console.log(`web  → created product #${p.id} "${p.name}" in category "${cat.name}"`);

// 2. Bot (raw SQL) sees it and updates it
const seen = await get('SELECT id, name, price, category_id FROM products WHERE id = ?', [p.id]);
console.log(`bot  → reads   #${seen.id} "${seen.name}" $${seen.price}`);
await run('UPDATE products SET price = ?, status = ? WHERE id = ?', [99.5, 'active', p.id]);
console.log('bot  → updated price to 99.5');

// 3. Web sees the bot's change
const after = await prisma.product.findUnique({ where: { id: p.id }, include:{ seller:true } });
console.log(`web  → sees    $${after.price}, type=${after.type}, seller=${after.seller.username}`);
console.log(after.price === 99.5 ? '\n✓ BIDIRECTIONAL SHARING CONFIRMED' : '\n✗ MISMATCH');

await prisma.product.delete({ where: { id: p.id } });
await prisma.$disconnect(); db.close();
