#!/usr/bin/env node

/**
 * 檢查資料庫實際結構腳本
 */

const { Client } = require('pg');
require('dotenv').config();

async function checkSchema() {
  const client = new Client({
    connectionString: process.env.DATABASE_URL,
    ssl: { rejectUnauthorized: false }
  });

  try {
    await client.connect();
    console.log('✅ 資料庫連接成功\n');

    // 檢查orders表結構
    const ordersSchema = await client.query(`
      SELECT column_name, data_type, is_nullable, column_default
      FROM information_schema.columns
      WHERE table_name = 'orders'
      ORDER BY ordinal_position;
    `);

    console.log('📋 Orders表結構:');
    console.log('='.repeat(80));
    ordersSchema.rows.forEach(col => {
      console.log(`${col.column_name.padEnd(20)} | ${col.data_type.padEnd(15)} | ${col.is_nullable.padEnd(8)} | ${col.column_default || 'NULL'}`);
    });

    // 檢查order_items表結構
    console.log('\n📋 Order_Items表結構:');
    console.log('='.repeat(80));
    const orderItemsSchema = await client.query(`
      SELECT column_name, data_type, is_nullable, column_default
      FROM information_schema.columns
      WHERE table_name = 'order_items'
      ORDER BY ordinal_position;
    `);

    orderItemsSchema.rows.forEach(col => {
      console.log(`${col.column_name.padEnd(20)} | ${col.data_type.padEnd(15)} | ${col.is_nullable.padEnd(8)} | ${col.column_default || 'NULL'}`);
    });

    // 檢查現有訂單數量
    const orderCount = await client.query('SELECT COUNT(*) FROM orders');
    console.log(`\n📊 現有訂單數量: ${orderCount.rows[0].count}`);

    // 檢查現有商品
    const products = await client.query('SELECT id, name, price, is_priced_item FROM products LIMIT 10');
    console.log('\n🛒 前10個商品:');
    products.rows.forEach(p => {
      console.log(`${p.id}: ${p.name} - ${p.price || '計價'} (${p.is_priced_item ? '計價商品' : '固定價格'})`);
    });

  } catch (error) {
    console.error('❌ 錯誤:', error.message);
  } finally {
    await client.end();
  }
}

checkSchema();