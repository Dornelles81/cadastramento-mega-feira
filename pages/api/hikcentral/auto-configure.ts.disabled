import { NextApiRequest, NextApiResponse } from 'next';
import puppeteer, { Browser, Page } from 'puppeteer';

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  let browser: Browser | null = null;
  
  try {
    console.log('🚀 Starting HikCentral auto-configuration...');
    
    // Launch browser
    browser = await puppeteer.launch({
      headless: false, // Set to false to see what's happening
      ignoreHTTPSErrors: true,
      args: [
        '--no-sandbox',
        '--disable-setuid-sandbox',
        '--disable-dev-shm-usage',
        '--disable-blink-features=AutomationControlled',
        '--ignore-certificate-errors',
        '--allow-insecure-localhost'
      ],
      defaultViewport: { width: 1280, height: 800 }
    });

    const page = await browser.newPage();
    
    // Set user agent to appear more like a real browser
    await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36');
    
    console.log('📍 Navigating to HikCentral...');
    await page.goto('https://127.0.0.1/portal', {
      waitUntil: 'networkidle2',
      timeout: 30000
    });

    // Take screenshot for debugging
    await page.screenshot({ path: 'hikcentral-login.png' });
    
    // Wait for login form
    await new Promise(resolve => setTimeout(resolve, 2000));
    
    console.log('🔐 Attempting login...');
    
    // Try different selectors for username field
    const usernameSelectors = [
      'input[name="username"]',
      'input[id="username"]',
      'input[placeholder*="user" i]',
      'input[type="text"]'
    ];
    
    let usernameField = null;
    for (const selector of usernameSelectors) {
      try {
        usernameField = await page.$(selector);
        if (usernameField) {
          console.log(`Found username field with selector: ${selector}`);
          await usernameField.type('admin', { delay: 100 });
          break;
        }
      } catch (e) {
        continue;
      }
    }
    
    // Try different selectors for password field
    const passwordSelectors = [
      'input[type="password"]',
      'input[name="password"]',
      'input[id="password"]'
    ];
    
    let passwordField = null;
    for (const selector of passwordSelectors) {
      try {
        passwordField = await page.$(selector);
        if (passwordField) {
          console.log(`Found password field with selector: ${selector}`);
          await passwordField.type('Index2016', { delay: 100 });
          break;
        }
      } catch (e) {
        continue;
      }
    }
    
    // Try to find and click login button
    const loginButtonSelectors = [
      'button[type="submit"]',
      'input[type="submit"]',
      'button:contains("Login")',
      'button:contains("login")',
      'button:contains("Entrar")',
      'button',
      '.login-button',
      '#loginBtn'
    ];
    
    let loginClicked = false;
    for (const selector of loginButtonSelectors) {
      try {
        const button = await page.$(selector);
        if (button) {
          console.log(`Found login button with selector: ${selector}`);
          await button.click();
          loginClicked = true;
          break;
        }
      } catch (e) {
        continue;
      }
    }
    
    if (!loginClicked) {
      // Try pressing Enter
      await page.keyboard.press('Enter');
    }
    
    // Wait for navigation after login
    await new Promise(resolve => setTimeout(resolve, 5000));
    
    // Take screenshot after login
    await page.screenshot({ path: 'hikcentral-after-login.png' });
    
    console.log('📋 Checking if login was successful...');
    
    // Check if we're logged in
    const currentUrl = page.url();
    const isLoggedIn = !currentUrl.includes('login') && !await page.$('input[type="password"]');
    
    if (!isLoggedIn) {
      throw new Error('Login failed - please check credentials');
    }
    
    console.log('✅ Login successful!');
    
    // Now navigate to settings
    console.log('⚙️ Looking for API settings...');
    
    // Try to find settings menu
    const settingsSelectors = [
      'a[href*="settings"]',
      'a[href*="config"]',
      'a:contains("Settings")',
      'a:contains("Configuration")',
      'a:contains("Configurações")',
      '[class*="settings"]',
      '[class*="config"]'
    ];
    
    let foundSettings = false;
    for (const selector of settingsSelectors) {
      try {
        const settingsLink = await page.$(selector);
        if (settingsLink) {
          console.log(`Found settings with selector: ${selector}`);
          await settingsLink.click();
          foundSettings = true;
          await new Promise(resolve => setTimeout(resolve, 3000));
          break;
        }
      } catch (e) {
        continue;
      }
    }
    
    // Look for API configuration
    const apiSelectors = [
      'a[href*="api"]',
      'a:contains("API")',
      'a:contains("REST")',
      'a:contains("OpenAPI")',
      '[class*="api"]'
    ];
    
    for (const selector of apiSelectors) {
      try {
        const apiLink = await page.$(selector);
        if (apiLink) {
          console.log(`Found API settings with selector: ${selector}`);
          await apiLink.click();
          await new Promise(resolve => setTimeout(resolve, 3000));
          
          // Look for enable checkbox
          const enableCheckbox = await page.$('input[type="checkbox"]');
          if (enableCheckbox) {
            const isChecked = await page.evaluate(el => el.checked, enableCheckbox);
            if (!isChecked) {
              await enableCheckbox.click();
              console.log('✅ API enabled!');
            } else {
              console.log('ℹ️ API already enabled');
            }
          }
          
          // Look for save button
          const saveButton = await page.$('button:contains("Save"), button:contains("Apply")');
          if (saveButton) {
            await saveButton.click();
            console.log('💾 Settings saved!');
          }
          
          break;
        }
      } catch (e) {
        continue;
      }
    }
    
    // Take final screenshot
    await page.screenshot({ path: 'hikcentral-configured.png' });
    
    // Get page content for analysis
    const pageContent = await page.content();
    const pageTitle = await page.title();
    
    await browser.close();
    
    return res.status(200).json({
      success: true,
      message: 'HikCentral configuration attempted',
      details: {
        loggedIn: isLoggedIn,
        currentUrl: currentUrl,
        pageTitle: pageTitle,
        foundSettings: foundSettings,
        screenshots: [
          'hikcentral-login.png',
          'hikcentral-after-login.png',
          'hikcentral-configured.png'
        ]
      },
      timestamp: new Date().toISOString()
    });

  } catch (error: any) {
    console.error('❌ Auto-configuration error:', error);
    
    if (browser) {
      await browser.close();
    }
    
    return res.status(500).json({
      success: false,
      error: error.message,
      suggestion: 'You may need to configure HikCentral manually',
      manualSteps: [
        '1. Access https://127.0.0.1/portal',
        '2. Login with admin / Index2016',
        '3. Go to Settings → System → API',
        '4. Enable REST API',
        '5. Save settings'
      ]
    });
  }
}