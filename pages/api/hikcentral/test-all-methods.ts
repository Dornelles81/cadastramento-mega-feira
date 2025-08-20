import { NextApiRequest, NextApiResponse } from 'next';
import HikCentralISAPI from '../../../lib/hikcental/hikcentral-isapi';
import HikCentralWebAPI from '../../../lib/hikcental/hikcentral-api';
import HikCentralClient from '../../../lib/hikcental/hikcentral-client';

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const results: any = {
    timestamp: new Date().toISOString(),
    methods: {}
  };

  console.log('\n=== Testing All HikCentral Integration Methods ===\n');

  // Test 1: ISAPI Method
  console.log('1. Testing ISAPI Method...');
  try {
    const isapi = new HikCentralISAPI();
    const isapiTest = await isapi.testConnection();
    
    results.methods.isapi = {
      status: 'success',
      message: 'ISAPI connection successful',
      details: isapiTest
    };
    console.log('✅ ISAPI method works!');
  } catch (error: any) {
    results.methods.isapi = {
      status: 'failed',
      message: error.message
    };
    console.log('❌ ISAPI method failed:', error.message);
  }

  // Test 2: Web API Method
  console.log('\n2. Testing Web API Method...');
  try {
    const webApi = new HikCentralWebAPI();
    const canConnect = await webApi.testConnection();
    
    if (canConnect) {
      const loginSuccess = await webApi.login('admin', 'Index2016');
      
      results.methods.webApi = {
        status: loginSuccess ? 'success' : 'auth_failed',
        message: loginSuccess ? 'Web API login successful' : 'Login failed',
        canConnect: true
      };
      console.log(loginSuccess ? '✅ Web API method works!' : '⚠️ Web API accessible but login failed');
    } else {
      results.methods.webApi = {
        status: 'no_connection',
        message: 'Cannot connect to HikCentral web interface'
      };
      console.log('❌ Web API not accessible');
    }
  } catch (error: any) {
    results.methods.webApi = {
      status: 'failed',
      message: error.message
    };
    console.log('❌ Web API method failed:', error.message);
  }

  // Test 3: Original Artemis API Method
  console.log('\n3. Testing Artemis API Method...');
  try {
    const artemis = new HikCentralClient();
    const artemisTest = await artemis.testConnection();
    
    results.methods.artemis = {
      status: 'success',
      message: 'Artemis API connection successful',
      details: artemisTest
    };
    console.log('✅ Artemis API method works!');
  } catch (error: any) {
    results.methods.artemis = {
      status: 'failed',
      message: error.message
    };
    console.log('❌ Artemis API method failed:', error.message);
  }

  // Test 4: Check if HikCentral is accessible at all
  console.log('\n4. Testing Direct HTTPS Access...');
  try {
    const https = require('https');
    const axios = require('axios');
    
    const httpsAgent = new https.Agent({
      rejectUnauthorized: false
    });
    
    const response = await axios.get('https://127.0.0.1/portal', {
      httpsAgent,
      timeout: 5000,
      validateStatus: () => true
    });
    
    results.methods.directHttps = {
      status: 'accessible',
      httpStatus: response.status,
      message: `HikCentral Professional is running (HTTP ${response.status})`,
      url: 'https://127.0.0.1/portal'
    };
    console.log(`✅ HikCentral Professional is accessible (HTTP ${response.status})`);
  } catch (error: any) {
    results.methods.directHttps = {
      status: 'not_accessible',
      message: 'Cannot reach HikCentral Professional',
      error: error.message
    };
    console.log('❌ Direct HTTPS access failed:', error.message);
  }

  // Analyze results
  const workingMethods = Object.keys(results.methods).filter(
    key => results.methods[key].status === 'success' || results.methods[key].status === 'accessible'
  );

  results.summary = {
    totalMethods: Object.keys(results.methods).length,
    workingMethods: workingMethods.length,
    recommendedMethod: workingMethods.length > 0 ? workingMethods[0] : 'none',
    hikCentralStatus: workingMethods.length > 0 ? 'online' : 'offline'
  };

  results.recommendations = [];
  
  if (results.methods.directHttps?.status === 'accessible') {
    results.recommendations.push('HikCentral Professional is running on https://127.0.0.1');
    
    if (results.methods.directHttps.httpStatus === 403 || results.methods.directHttps.httpStatus === 401) {
      results.recommendations.push('Authentication is required - credentials may need to be verified');
    }
  }

  if (workingMethods.length === 0) {
    results.recommendations.push('No API methods are currently working');
    results.recommendations.push('Please verify HikCentral Professional is properly configured for API access');
    results.recommendations.push('Check if API services are enabled in HikCentral settings');
  } else {
    results.recommendations.push(`Use ${workingMethods[0]} method for integration`);
  }

  console.log('\n=== Test Complete ===\n');
  console.log('Summary:', results.summary);

  return res.status(200).json(results);
}