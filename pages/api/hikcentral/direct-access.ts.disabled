import { NextApiRequest, NextApiResponse } from 'next';
import puppeteer, { Browser, Page } from 'puppeteer';

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { action, data } = req.body;
  let browser: Browser | null = null;
  
  try {
    console.log('🚀 Starting direct HikCentral access...');
    
    // Launch browser in headless mode
    browser = await puppeteer.launch({
      headless: true,
      ignoreHTTPSErrors: true,
      args: [
        '--no-sandbox',
        '--disable-setuid-sandbox',
        '--disable-dev-shm-usage',
        '--ignore-certificate-errors',
        '--allow-insecure-localhost',
        '--disable-web-security',
        '--disable-features=IsolateOrigins,site-per-process'
      ],
      defaultViewport: { width: 1280, height: 800 }
    });

    const page = await browser.newPage();
    
    // Enable request interception to capture API calls
    await page.setRequestInterception(true);
    
    let apiToken = null;
    let sessionCookie = null;
    
    page.on('request', request => {
      // Capture authorization headers
      const headers = request.headers();
      if (headers['authorization']) {
        apiToken = headers['authorization'];
        console.log('Captured API token:', apiToken);
      }
      request.continue();
    });
    
    page.on('response', response => {
      // Capture session cookies
      const headers = response.headers();
      if (headers['set-cookie']) {
        sessionCookie = headers['set-cookie'];
        console.log('Captured session cookie');
      }
    });
    
    console.log('📍 Navigating to HikCentral...');
    await page.goto('https://127.0.0.1/portal', {
      waitUntil: 'networkidle2',
      timeout: 30000
    });

    // Wait a bit
    await new Promise(resolve => setTimeout(resolve, 2000));
    
    console.log('🔐 Performing login...');
    
    // Type credentials directly
    await page.evaluate(() => {
      // Try to find and fill username field
      const usernameInputs = document.querySelectorAll('input[type="text"], input[name="username"], input[id="username"]');
      for (const input of usernameInputs) {
        (input as HTMLInputElement).value = 'admin';
        input.dispatchEvent(new Event('input', { bubbles: true }));
        input.dispatchEvent(new Event('change', { bubbles: true }));
      }
      
      // Try to find and fill password field
      const passwordInputs = document.querySelectorAll('input[type="password"], input[name="password"], input[id="password"]');
      for (const input of passwordInputs) {
        (input as HTMLInputElement).value = 'Index2016';
        input.dispatchEvent(new Event('input', { bubbles: true }));
        input.dispatchEvent(new Event('change', { bubbles: true }));
      }
    });
    
    // Submit form
    await page.evaluate(() => {
      // Try to find and click submit button
      const buttons = document.querySelectorAll('button[type="submit"], input[type="submit"], button');
      for (const button of buttons) {
        const text = button.textContent?.toLowerCase() || '';
        if (text.includes('login') || text.includes('entrar') || text.includes('sign') || buttons.length === 1) {
          (button as HTMLElement).click();
          break;
        }
      }
    });
    
    // Wait for navigation
    await new Promise(resolve => setTimeout(resolve, 5000));
    
    console.log('📋 Checking login status...');
    
    const currentUrl = page.url();
    const pageTitle = await page.title();
    const isLoggedIn = !currentUrl.includes('login');
    
    if (isLoggedIn) {
      console.log('✅ Login successful, executing action...');
      
      // Get cookies for API calls
      const cookies = await page.cookies();
      const cookieString = cookies.map(c => `${c.name}=${c.value}`).join('; ');
      
      // Try to execute requested action
      let result = null;
      
      switch (action) {
        case 'addVisitor':
          result = await addVisitorDirect(page, data);
          break;
          
        case 'enableAPI':
          result = await enableAPIDirect(page);
          break;
          
        case 'getInfo':
          result = await getSystemInfo(page);
          break;
          
        default:
          // Try to add person via JavaScript injection
          result = await page.evaluate(async (personData) => {
            try {
              // Try to call internal API functions if available
              const response = await fetch('/portal/api/visitor/add', {
                method: 'POST',
                headers: {
                  'Content-Type': 'application/json',
                  'Accept': 'application/json'
                },
                body: JSON.stringify({
                  visitorName: personData.name,
                  visitorIdCard: personData.cpf,
                  phoneNo: personData.phone,
                  email: personData.email,
                  validTimes: 1,
                  beginTime: new Date().toISOString(),
                  endTime: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString()
                })
              });
              
              return await response.json();
            } catch (error: any) {
              return { error: error.message };
            }
          }, data || {});
      }
      
      await browser.close();
      
      return res.status(200).json({
        success: true,
        message: 'Action executed',
        isLoggedIn: true,
        currentUrl: currentUrl,
        pageTitle: pageTitle,
        cookies: cookieString,
        apiToken: apiToken,
        result: result,
        timestamp: new Date().toISOString()
      });
      
    } else {
      throw new Error('Login failed');
    }

  } catch (error: any) {
    console.error('❌ Direct access error:', error);
    
    if (browser) {
      await browser.close();
    }
    
    return res.status(500).json({
      success: false,
      error: error.message
    });
  }
}

async function addVisitorDirect(page: Page, data: any) {
  return await page.evaluate(async (visitorData) => {
    try {
      // Navigate to visitor section programmatically
      if (window.location.hash !== '#/visitor') {
        window.location.hash = '#/visitor';
        await new Promise(resolve => setTimeout(resolve, 2000));
      }
      
      // Try to trigger add visitor modal
      const addButtons = document.querySelectorAll('button');
      for (const button of addButtons) {
        const text = button.textContent?.toLowerCase() || '';
        if (text.includes('add') || text.includes('new') || text.includes('novo')) {
          (button as HTMLElement).click();
          break;
        }
      }
      
      return { message: 'Visitor section accessed' };
    } catch (error: any) {
      return { error: error.message };
    }
  }, data);
}

async function enableAPIDirect(page: Page) {
  return await page.evaluate(async () => {
    try {
      // Navigate to settings
      window.location.hash = '#/settings';
      await new Promise(resolve => setTimeout(resolve, 2000));
      
      // Look for API settings
      const links = document.querySelectorAll('a, button');
      for (const link of links) {
        const text = link.textContent?.toLowerCase() || '';
        if (text.includes('api') || text.includes('rest')) {
          (link as HTMLElement).click();
          await new Promise(resolve => setTimeout(resolve, 1000));
          
          // Look for enable checkbox
          const checkboxes = document.querySelectorAll('input[type="checkbox"]');
          for (const checkbox of checkboxes) {
            if (!(checkbox as HTMLInputElement).checked) {
              (checkbox as HTMLElement).click();
            }
          }
          
          // Save settings
          const saveButtons = document.querySelectorAll('button');
          for (const button of saveButtons) {
            const text = button.textContent?.toLowerCase() || '';
            if (text.includes('save') || text.includes('apply') || text.includes('salvar')) {
              (button as HTMLElement).click();
              break;
            }
          }
          
          return { message: 'API settings updated' };
        }
      }
      
      return { message: 'API settings not found' };
    } catch (error: any) {
      return { error: error.message };
    }
  });
}

async function getSystemInfo(page: Page) {
  return await page.evaluate(() => {
    return {
      title: document.title,
      url: window.location.href,
      hash: window.location.hash,
      localStorage: Object.keys(localStorage),
      sessionStorage: Object.keys(sessionStorage)
    };
  });
}