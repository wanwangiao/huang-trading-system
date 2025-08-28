#!/usr/bin/env node

/**
 * Render Database Connection Test Script
 * 專門測試 Render 環境下的資料庫連線
 */

const { Pool } = require('pg');
const dns = require('dns');
const { promisify } = require('util');

// 設置 IPv4 優先
dns.setDefaultResultOrder('ipv4first');
process.env.FORCE_IPV4 = '1';
process.env.NODE_OPTIONS = '--dns-result-order=ipv4first';

console.log('🔧 Render Database Connection Test');
console.log('=====================================');

const resolve4 = promisify(dns.resolve4);
const resolve6 = promisify(dns.resolve6);

async function testDNSResolution() {
  console.log('\n📡 DNS Resolution Test');
  console.log('----------------------');
  
  const hostname = 'db.cywcuzgbuqmxjxwyrrsp.supabase.co';
  
  try {
    // Test IPv4 resolution
    const ipv4Addresses = await resolve4(hostname);
    console.log('✅ IPv4 addresses:', ipv4Addresses);
    
    // Test IPv6 resolution
    try {
      const ipv6Addresses = await resolve6(hostname);
      console.log('🔍 IPv6 addresses:', ipv6Addresses);
    } catch (ipv6Error) {
      console.log('ℹ️  IPv6 resolution failed (normal):', ipv6Error.code);
    }
    
    return ipv4Addresses[0];
  } catch (error) {
    console.log('❌ DNS resolution failed:', error.message);
    return null;
  }
}

async function testConnection(method, config) {
  console.log(`\n🔌 Testing: ${method}`);
  console.log('---------------------------');
  
  try {
    const pool = new Pool(config);
    const start = Date.now();
    
    const result = await pool.query('SELECT NOW() as current_time, version() as db_version');
    const duration = Date.now() - start;
    
    console.log(`✅ ${method} SUCCESS (${duration}ms)`);
    console.log('   Connection time:', result.rows[0].current_time);
    console.log('   Database version:', result.rows[0].db_version.substring(0, 50) + '...');
    
    await pool.end();
    return true;
  } catch (error) {
    console.log(`❌ ${method} FAILED`);
    console.log('   Error code:', error.code);
    console.log('   Error message:', error.message);
    console.log('   Address attempted:', error.address || 'N/A');
    return false;
  }
}

async function runTests() {
  console.log('Environment:', process.env.NODE_ENV || 'development');
  console.log('Platform:', process.platform);
  console.log('Node version:', process.version);
  
  // Test DNS resolution first
  const ipv4Address = await testDNSResolution();
  
  const tests = [
    {
      method: '1. Environment Variable (DATABASE_URL)',
      config: {
        connectionString: process.env.DATABASE_URL,
        ssl: { rejectUnauthorized: false },
        connectionTimeoutMillis: 30000,
        family: 4
      }
    },
    {
      method: '2. Direct IPv4 Host Configuration',
      config: {
        host: 'db.cywcuzgbuqmxjxwyrrsp.supabase.co',
        port: 5432,
        database: 'postgres',
        user: 'postgres',
        password: 'Chengyivegetable2025!',
        ssl: { rejectUnauthorized: false },
        connectionTimeoutMillis: 30000,
        family: 4
      }
    }
  ];
  
  // Add IP direct connection if we have the address
  if (ipv4Address) {
    tests.push({
      method: '3. Direct IP Address Connection',
      config: {
        host: ipv4Address,
        port: 5432,
        database: 'postgres',
        user: 'postgres',
        password: 'Chengyivegetable2025!',
        ssl: { rejectUnauthorized: false },
        connectionTimeoutMillis: 30000,
        family: 4
      }
    });
  }
  
  console.log('\n🧪 Running Connection Tests');
  console.log('============================');
  
  let successCount = 0;
  for (const test of tests) {
    const success = await testConnection(test.method, test.config);
    if (success) successCount++;
  }
  
  console.log('\n📊 Test Summary');
  console.log('================');
  console.log(`✅ Successful connections: ${successCount}/${tests.length}`);
  
  if (successCount === 0) {
    console.log('\n🚨 ALL CONNECTIONS FAILED');
    console.log('   Possible issues:');
    console.log('   1. Render network restrictions');
    console.log('   2. Supabase database not accessible');
    console.log('   3. IPv6/IPv4 routing problems');
    console.log('   4. Environment variable not set correctly');
  } else {
    console.log('\n🎉 At least one connection method works!');
  }
  
  process.exit(successCount > 0 ? 0 : 1);
}

// Handle uncaught errors
process.on('uncaughtException', (error) => {
  console.error('💥 Uncaught Exception:', error.message);
  process.exit(1);
});

process.on('unhandledRejection', (reason, promise) => {
  console.error('💥 Unhandled Promise Rejection:', reason);
  process.exit(1);
});

// Run the tests
runTests().catch(error => {
  console.error('💥 Test runner failed:', error.message);
  process.exit(1);
});