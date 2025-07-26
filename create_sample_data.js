// create_sample_data.js - Create sample categories and products for testing
import { db } from './database.js';

function createSampleData() {
  console.log('Creating sample data...');
  
  // Create root categories
  const categories = [
    { name: 'Digital Products', parent_id: null },
    { name: 'Proxy Services', parent_id: null },
    { name: 'Account Access', parent_id: null }
  ];
  
  categories.forEach((cat, index) => {
    db.run(
      'INSERT OR IGNORE INTO categories (id, name, parent_id) VALUES (?, ?, ?)',
      [index + 1, cat.name, cat.parent_id],
      (err) => {
        if (err) {
          console.error('Category insert error:', err.message);
        } else {
          console.log(`✅ Created category: ${cat.name}`);
        }
      }
    );
  });
  
  // Create subcategories
  const subcategories = [
    { name: 'Software Licenses', parent_id: 1 },
    { name: 'Premium Apps', parent_id: 1 },
    { name: 'Private Proxies', parent_id: 2 },
    { name: 'Residential Proxies', parent_id: 2 },
    { name: 'Social Media', parent_id: 3 },
    { name: 'Streaming Services', parent_id: 3 }
  ];
  
  subcategories.forEach((cat, index) => {
    db.run(
      'INSERT OR IGNORE INTO categories (id, name, parent_id) VALUES (?, ?, ?)',
      [index + 10, cat.name, cat.parent_id],
      (err) => {
        if (err) {
          console.error('Subcategory insert error:', err.message);
        } else {
          console.log(`✅ Created subcategory: ${cat.name}`);
        }
      }
    );
  });
  
  // Create sample products
  const products = [
    { name: 'Premium VPN License', description: 'Lifetime VPN access with unlimited bandwidth', price: 29.99, category_id: 10 },
    { name: 'Photo Editor Pro', description: 'Professional photo editing software', price: 49.99, category_id: 11 },
    { name: 'High-Speed Private Proxy', description: '1Gbps dedicated proxy server', price: 15.99, category_id: 12 },
    { name: 'Residential Proxy Pool', description: '100+ rotating residential IPs', price: 89.99, category_id: 13 },
    { name: 'Instagram Verified Account', description: 'High-quality Instagram account with followers', price: 199.99, category_id: 14 },
    { name: 'Netflix Premium Account', description: '1-year Netflix subscription access', price: 39.99, category_id: 15 }
  ];
  
  products.forEach((product, index) => {
    db.run(
      'INSERT OR IGNORE INTO products (id, name, description, price, category_id) VALUES (?, ?, ?, ?, ?)',
      [index + 1, product.name, product.description, product.price, product.category_id],
      (err) => {
        if (err) {
          console.error('Product insert error:', err.message);
        } else {
          console.log(`✅ Created product: ${product.name}`);
        }
      }
    );
  });
  
  console.log('✅ Sample data creation completed!');
}

createSampleData();
