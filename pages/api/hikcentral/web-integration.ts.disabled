import { NextApiRequest, NextApiResponse } from 'next';
import puppeteer from 'puppeteer';

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { action, data } = req.body;

  let browser;
  
  try {
    console.log('Launching browser for HikCentral integration...');
    
    // Launch headless browser
    browser = await puppeteer.launch({
      headless: true,
      ignoreHTTPSErrors: true, // Ignore self-signed certificate
      args: [
        '--no-sandbox',
        '--disable-setuid-sandbox',
        '--disable-dev-shm-usage',
        '--disable-accelerated-2d-canvas',
        '--no-first-run',
        '--no-zygote',
        '--disable-gpu'
      ]
    });

    const page = await browser.newPage();
    
    // Set viewport
    await page.setViewport({ width: 1280, height: 800 });
    
    // Navigate to HikCentral
    console.log('Navigating to HikCentral...');
    await page.goto('https://127.0.0.1/portal', {
      waitUntil: 'networkidle2',
      timeout: 30000
    });

    // Check if we're on login page
    const isLoginPage = await page.evaluate(() => {
      return document.querySelector('input[type="password"]') !== null;
    });

    if (isLoginPage) {
      console.log('Login required, attempting to authenticate...');
      
      // Find and fill username field
      await page.type('input[name="username"], input[id="username"], input[placeholder*="user"]', 'admin');
      
      // Find and fill password field
      await page.type('input[type="password"]', 'Index2016');
      
      // Submit login form
      await Promise.all([
        page.waitForNavigation({ waitUntil: 'networkidle2' }),
        page.click('button[type="submit"], input[type="submit"], button:has-text("Login")')
      ]);
      
      console.log('Login submitted, checking result...');
      
      // Check if login was successful
      const loginSuccess = await page.evaluate(() => {
        return !document.querySelector('input[type="password"]');
      });
      
      if (!loginSuccess) {
        throw new Error('Login failed - check credentials');
      }
    }

    // Now perform the requested action
    let result;
    
    switch (action) {
      case 'addVisitor':
        result = await addVisitor(page, data);
        break;
        
      case 'searchPerson':
        result = await searchPerson(page, data);
        break;
        
      case 'getStatus':
        result = await getSystemStatus(page);
        break;
        
      default:
        throw new Error(`Unknown action: ${action}`);
    }

    await browser.close();
    
    return res.status(200).json({
      success: true,
      action: action,
      result: result,
      timestamp: new Date().toISOString()
    });

  } catch (error: any) {
    console.error('HikCentral web integration error:', error);
    
    if (browser) {
      await browser.close();
    }
    
    return res.status(500).json({
      success: false,
      error: error.message,
      action: action
    });
  }
}

// Add visitor through web interface
async function addVisitor(page: any, data: any) {
  console.log('Navigating to visitor management...');
  
  // Navigate to visitor section
  await page.goto('https://127.0.0.1/portal#/visitor', {
    waitUntil: 'networkidle2'
  });
  
  // Wait for page to load
  await page.waitForTimeout(2000);
  
  // Click Add button
  await page.click('button:has-text("Add"), button:has-text("New")');
  
  // Fill visitor form
  await page.type('input[name="visitorName"]', data.name);
  await page.type('input[name="idCard"]', data.cpf);
  await page.type('input[name="phone"]', data.phone || '');
  await page.type('input[name="email"]', data.email || '');
  
  // Set validity period
  const today = new Date();
  const nextYear = new Date(today.getTime() + 365 * 24 * 60 * 60 * 1000);
  
  await page.type('input[name="validFrom"]', today.toISOString().split('T')[0]);
  await page.type('input[name="validTo"]', nextYear.toISOString().split('T')[0]);
  
  // Submit form
  await page.click('button:has-text("Save"), button:has-text("OK")');
  
  // Wait for confirmation
  await page.waitForTimeout(2000);
  
  return {
    message: 'Visitor added successfully',
    name: data.name,
    cpf: data.cpf
  };
}

// Search for person
async function searchPerson(page: any, data: any) {
  console.log('Searching for person...');
  
  // Navigate to person/visitor search
  await page.goto('https://127.0.0.1/portal#/person', {
    waitUntil: 'networkidle2'
  });
  
  // Wait for page to load
  await page.waitForTimeout(2000);
  
  // Enter search criteria
  await page.type('input[placeholder*="Search"], input[name="search"]', data.cpf);
  
  // Trigger search
  await page.keyboard.press('Enter');
  
  // Wait for results
  await page.waitForTimeout(2000);
  
  // Get results
  const results = await page.evaluate(() => {
    const rows = document.querySelectorAll('table tbody tr');
    return Array.from(rows).map(row => {
      const cells = row.querySelectorAll('td');
      return {
        name: cells[1]?.textContent,
        code: cells[2]?.textContent,
        department: cells[3]?.textContent
      };
    });
  });
  
  return {
    found: results.length > 0,
    results: results
  };
}

// Get system status
async function getSystemStatus(page: any) {
  console.log('Getting system status...');
  
  const status = await page.evaluate(() => {
    return {
      title: document.title,
      url: window.location.href,
      isLoggedIn: !document.querySelector('input[type="password"]')
    };
  });
  
  return status;
}