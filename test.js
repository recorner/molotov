import Database from 'sqlite3';

const db = new Database('./store.db');

console.log('All Categories:');
const categories = db.prepare('SELECT id, name, parent_id FROM categories ORDER BY parent_id, id').all();

categories.forEach(cat => {
  const parentInfo = cat.parent_id ? `(parent: ${cat.parent_id})` : '(root)';
  console.log(`ID: ${cat.id}, Name: "${cat.name}" ${parentInfo}`);
});

db.close();