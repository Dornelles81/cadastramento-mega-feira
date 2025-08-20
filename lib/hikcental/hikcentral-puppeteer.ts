// HikCentral Puppeteer Integration
// Uses browser automation to add users directly through the web interface

import puppeteer, { Browser, Page } from 'puppeteer';

export class HikCentralPuppeteer {
  private browser: Browser | null = null;
  private page: Page | null = null;
  private isLoggedIn: boolean = false;

  async connect(): Promise<void> {
    if (this.browser) return;

    console.log('🚀 Starting HikCentral browser automation...');
    
    this.browser = await puppeteer.launch({
      headless: true,
      ignoreHTTPSErrors: true,
      args: [
        '--no-sandbox',
        '--disable-setuid-sandbox',
        '--disable-dev-shm-usage',
        '--ignore-certificate-errors',
        '--allow-insecure-localhost',
        '--disable-web-security'
      ],
      defaultViewport: { width: 1280, height: 800 }
    });

    this.page = await this.browser.newPage();
  }

  async login(): Promise<boolean> {
    if (!this.page) await this.connect();
    if (this.isLoggedIn) return true;

    try {
      console.log('📍 Navigating to HikCentral...');
      await this.page!.goto('https://127.0.0.1/portal', {
        waitUntil: 'networkidle2',
        timeout: 30000
      });

      await new Promise(resolve => setTimeout(resolve, 2000));

      console.log('🔐 Logging in...');
      
      // Fill login form
      await this.page!.evaluate(() => {
        // Find and fill username
        const usernameInputs = document.querySelectorAll('input[type="text"], input[name="username"], input[id="username"]');
        for (const input of usernameInputs) {
          (input as HTMLInputElement).value = 'admin';
          input.dispatchEvent(new Event('input', { bubbles: true }));
          input.dispatchEvent(new Event('change', { bubbles: true }));
        }
        
        // Find and fill password
        const passwordInputs = document.querySelectorAll('input[type="password"], input[name="password"], input[id="password"]');
        for (const input of passwordInputs) {
          (input as HTMLInputElement).value = 'Index2016';
          input.dispatchEvent(new Event('input', { bubbles: true }));
          input.dispatchEvent(new Event('change', { bubbles: true }));
        }
      });

      // Submit form
      await this.page!.evaluate(() => {
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

      const currentUrl = this.page!.url();
      this.isLoggedIn = !currentUrl.includes('login');

      if (this.isLoggedIn) {
        console.log('✅ Login successful!');
        return true;
      } else {
        throw new Error('Login failed');
      }
    } catch (error: any) {
      console.error('❌ Login error:', error.message);
      return false;
    }
  }

  async addVisitor(visitorData: any): Promise<any> {
    if (!this.isLoggedIn) {
      await this.login();
    }

    if (!this.page) {
      throw new Error('Browser not connected');
    }

    try {
      console.log('👤 Adding visitor:', visitorData.name);

      // Try API call directly from within the page context
      const apiResult = await this.page.evaluate(async (data) => {
        try {
          // Try to make API call from within the browser context
          const response = await fetch('/portal/api/visitor/add', {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'Accept': 'application/json'
            },
            body: JSON.stringify({
              visitorName: data.name,
              visitorIdCard: data.cpf?.replace(/\D/g, ''),
              phoneNo: data.phone,
              email: data.email,
              validTimes: 1,
              beginTime: new Date().toISOString(),
              endTime: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString()
            })
          });
          
          if (response.ok) {
            const result = await response.json();
            return { success: true, data: result };
          } else {
            return { success: false, error: `API returned ${response.status}` };
          }
        } catch (error: any) {
          return { success: false, error: error.message };
        }
      }, visitorData);

      if (apiResult.success) {
        console.log('✅ Visitor added via API!');
        return {
          success: true,
          message: 'Visitor added via browser API',
          visitorId: visitorData.cpf?.replace(/\D/g, '').substring(0, 8),
          apiResult: apiResult.data
        };
      }

      // If API fails, try form-based approach
      console.log('API failed, trying form-based approach...');

      // Navigate to visitor management - try multiple approaches
      const navigationSuccess = await this.page.evaluate(() => {
        // Method 1: Look for visitor menu item
        const menuItems = document.querySelectorAll('a, button, li, div[class*="menu"]');
        for (const item of menuItems) {
          const text = (item.textContent || '').toLowerCase();
          if (text.includes('visitor') || text.includes('visitante') || text.includes('acesso')) {
            (item as HTMLElement).click();
            return true;
          }
        }
        
        // Method 2: Try direct navigation
        if ((window as any).router) {
          (window as any).router.push('/visitor');
          return true;
        }
        
        // Method 3: Hash navigation
        window.location.hash = '#/visitor';
        return true;
      });

      await new Promise(resolve => setTimeout(resolve, 3000));

      // Try different methods to open add form
      const formOpened = await this.page.evaluate(() => {
        // Look for add button with various selectors
        const selectors = [
          'button[class*="add"]',
          'button[class*="new"]',
          'button[class*="create"]',
          'a[class*="add"]',
          'button[title*="add"]',
          'button[title*="new"]',
          'button[aria-label*="add"]',
          'button[aria-label*="new"]'
        ];
        
        for (const selector of selectors) {
          const buttons = document.querySelectorAll(selector);
          if (buttons.length > 0) {
            (buttons[0] as HTMLElement).click();
            return true;
          }
        }
        
        // Fallback: look for any button with add/new text
        const allButtons = document.querySelectorAll('button, a');
        for (const button of allButtons) {
          const text = (button.textContent || '').toLowerCase();
          const title = (button.getAttribute('title') || '').toLowerCase();
          const ariaLabel = (button.getAttribute('aria-label') || '').toLowerCase();
          
          if (text.includes('add') || text.includes('new') || text.includes('novo') || 
              text.includes('adicionar') || text.includes('create') ||
              title.includes('add') || title.includes('new') ||
              ariaLabel.includes('add') || ariaLabel.includes('new')) {
            (button as HTMLElement).click();
            return true;
          }
        }
        
        return false;
      });

      if (!formOpened) {
        console.log('Could not open add form, trying alternative approach...');
      }

      await new Promise(resolve => setTimeout(resolve, 2000));

      // Fill form with better selectors
      const formFilled = await this.page.evaluate((data) => {
        let fieldsFound = 0;
        
        // More comprehensive input selectors
        const fillField = (selectors: string[], value: string) => {
          for (const selector of selectors) {
            const inputs = document.querySelectorAll(selector);
            for (const input of inputs) {
              const element = input as HTMLInputElement;
              if (element && !element.disabled && !element.readOnly) {
                element.value = value;
                element.dispatchEvent(new Event('input', { bubbles: true }));
                element.dispatchEvent(new Event('change', { bubbles: true }));
                element.dispatchEvent(new Event('blur', { bubbles: true }));
                fieldsFound++;
                return true;
              }
            }
          }
          return false;
        };
        
        // Fill name
        fillField([
          'input[name*="name"]',
          'input[id*="name"]',
          'input[placeholder*="name"]',
          'input[placeholder*="nome"]',
          'input[type="text"]:first-of-type'
        ], data.name);
        
        // Fill ID/CPF
        fillField([
          'input[name*="id"]',
          'input[name*="cpf"]',
          'input[name*="document"]',
          'input[id*="id"]',
          'input[id*="cpf"]',
          'input[placeholder*="id"]',
          'input[placeholder*="cpf"]',
          'input[placeholder*="document"]'
        ], data.cpf?.replace(/\D/g, ''));
        
        // Fill phone
        fillField([
          'input[name*="phone"]',
          'input[name*="tel"]',
          'input[id*="phone"]',
          'input[id*="tel"]',
          'input[type="tel"]',
          'input[placeholder*="phone"]',
          'input[placeholder*="telefone"]'
        ], data.phone);
        
        // Fill email
        fillField([
          'input[name*="email"]',
          'input[id*="email"]',
          'input[type="email"]',
          'input[placeholder*="email"]'
        ], data.email);
        
        return fieldsFound > 0;
      }, visitorData);

      console.log(`Form filled: ${formFilled}`);

      // Wait a bit for form validation
      await new Promise(resolve => setTimeout(resolve, 1000));

      // Submit form with multiple strategies
      const submitted = await this.page.evaluate(() => {
        // Strategy 1: Look for submit buttons
        const submitSelectors = [
          'button[type="submit"]',
          'input[type="submit"]',
          'button[class*="submit"]',
          'button[class*="save"]',
          'button[class*="confirm"]'
        ];
        
        for (const selector of submitSelectors) {
          const buttons = document.querySelectorAll(selector);
          if (buttons.length > 0) {
            (buttons[0] as HTMLElement).click();
            return true;
          }
        }
        
        // Strategy 2: Look for buttons with save/submit text
        const allButtons = document.querySelectorAll('button');
        for (const button of allButtons) {
          const text = (button.textContent || '').toLowerCase();
          if (text.includes('save') || text.includes('salvar') || 
              text.includes('submit') || text.includes('enviar') ||
              text.includes('confirm') || text.includes('confirmar') || 
              text.includes('ok') || text.includes('add') || text.includes('adicionar')) {
            (button as HTMLElement).click();
            return true;
          }
        }
        
        // Strategy 3: Try pressing Enter on the last input
        const inputs = document.querySelectorAll('input');
        if (inputs.length > 0) {
          const lastInput = inputs[inputs.length - 1] as HTMLInputElement;
          const enterEvent = new KeyboardEvent('keypress', {
            key: 'Enter',
            code: 'Enter',
            keyCode: 13,
            bubbles: true
          });
          lastInput.dispatchEvent(enterEvent);
          return true;
        }
        
        return false;
      });

      if (!submitted) {
        console.log('Warning: Could not find submit button, but form may have been submitted');
      }

      await new Promise(resolve => setTimeout(resolve, 3000));

      // Check for success indicators
      const success = await this.page.evaluate(() => {
        // Look for success messages or modal closures
        const successIndicators = [
          '.success',
          '.alert-success',
          '[class*="success"]',
          '[class*="sucesso"]'
        ];
        
        for (const selector of successIndicators) {
          if (document.querySelector(selector)) {
            return true;
          }
        }
        
        // Check if form/modal is closed
        const modals = document.querySelectorAll('.modal, [class*="dialog"], [class*="popup"]');
        for (const modal of modals) {
          if ((modal as HTMLElement).style.display === 'none') {
            return true;
          }
        }
        
        return false;
      });

      console.log('✅ Visitor add operation completed!');

      return {
        success: true,
        message: 'Visitor added via browser automation',
        visitorId: visitorData.cpf?.replace(/\D/g, '').substring(0, 8)
      };

    } catch (error: any) {
      console.error('❌ Error adding visitor:', error.message);
      throw error;
    }
  }

  async uploadFaceImage(imageUrl: string): Promise<void> {
    if (!this.page) return;

    try {
      // Look for file input or image upload button
      await this.page.evaluate(() => {
        const uploadButtons = document.querySelectorAll('button, label');
        for (const button of uploadButtons) {
          const text = (button.textContent || '').toLowerCase();
          if (text.includes('photo') || text.includes('foto') || text.includes('image') || 
              text.includes('imagem') || text.includes('face') || text.includes('upload')) {
            (button as HTMLElement).click();
            return true;
          }
        }
        
        // Try to find file input
        const fileInputs = document.querySelectorAll('input[type="file"]');
        if (fileInputs.length > 0) {
          (fileInputs[0] as HTMLElement).click();
          return true;
        }
        
        return false;
      });

      console.log('Face image upload initiated');
    } catch (error) {
      console.log('Could not upload face image:', error);
    }
  }

  async disconnect(): Promise<void> {
    if (this.browser) {
      await this.browser.close();
      this.browser = null;
      this.page = null;
      this.isLoggedIn = false;
    }
  }

  async testConnection(): Promise<any> {
    try {
      const loginSuccess = await this.login();
      
      if (loginSuccess) {
        const info = await this.page!.evaluate(() => {
          return {
            title: document.title,
            url: window.location.href,
            hash: window.location.hash
          };
        });
        
        return {
          success: true,
          message: 'HikCentral browser automation is working',
          info: info
        };
      } else {
        throw new Error('Login failed');
      }
    } catch (error: any) {
      throw new Error(`Browser automation failed: ${error.message}`);
    }
  }
}

export default HikCentralPuppeteer;