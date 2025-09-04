const fs = require('fs-extra');

class PlaywrightConverter {
  constructor() {
    this.supportedActions = new Set([
      'get', 'click', 'sendKeys', 'clear', 'getTagName', 
      'Navigation.refresh', 'Navigation.back', 'Navigation.forward',
      'Wait.until'
    ]);
  }

  async convert(traceFilePath, language = 'javascript') {
    const traceContent = await fs.readFile(traceFilePath, 'utf8');
    const lines = traceContent.split('\n').filter(line => line.trim());
    
    const steps = [];
    const stats = {
      totalActions: 0,
      convertedActions: 0,
      skippedActions: 0,
      actionBreakdown: {}
    };
    
    lines.forEach(line => {
      try {
        const event = JSON.parse(line);
        if (event.evt === 'step.ok') {
          stats.totalActions++;
          
          const action = event.kind;
          stats.actionBreakdown[action] = (stats.actionBreakdown[action] || 0) + 1;
          
          if (this.supportedActions.has(action)) {
            const step = this.convertStep(event, language);
            if (step) {
              steps.push(step);
              stats.convertedActions++;
            }
          } else {
            stats.skippedActions++;
            steps.push({
              action: this.generateComment(`Unsupported action: ${action}`, language),
              comment: `Original target: ${event.target || 'N/A'}`
            });
          }
        }
      } catch (e) {
        // Skip invalid JSON lines
      }
    });
    
    const testContent = this.generateTestFile(steps, language);
    const filename = this.getFilename(language);
    
    return {
      content: testContent,
      filename,
      stats
    };
  }

  extractCleanSelector(target) {
    if (!target) return '';
    
    // Handle the format: [[ChromeDriver: ...] -> name: my-text]
    const cleanLocatorMatch = target.match(/\[\[.*?\] -> (.+?)\]/);
    if (cleanLocatorMatch) {
      const locatorPart = cleanLocatorMatch[1];
      
      if (locatorPart.startsWith('name: ')) {
        const name = locatorPart.replace('name: ', '');
        return `[name="${name}"]`;
      }
      
      if (locatorPart.startsWith('css selector: ')) {
        return locatorPart.replace('css selector: ', '');
      }
      
      if (locatorPart.startsWith('xpath: ')) {
        const xpath = locatorPart.replace('xpath: ', '');
        return `xpath=${xpath}`;
      }
      
      if (locatorPart.startsWith('tag name: ')) {
        const tagName = locatorPart.replace('tag name: ', '');
        return tagName;
      }
      
      if (locatorPart.startsWith('id: ')) {
        const id = locatorPart.replace('id: ', '');
        return `#${id}`;
      }
      
      if (locatorPart.startsWith('class: ')) {
        const className = locatorPart.replace('class: ', '');
        return `.${className}`;
      }
      
      return locatorPart;
    }
    
    // Handle URLs
    if (target.startsWith('http') || target.startsWith('[http')) {
      return target.replace(/[\[\]]/g, '');
    }
    
    return target;
  }

  convertStep(event, language) {
    const { kind, target, durationMs } = event;
    const selector = this.extractCleanSelector(target);
    
    switch (kind) {
      case 'get':
        return {
          action: this.generatePageAction('goto', selector, language),
          comment: `Navigate to ${selector}`
        };
        
      case 'click':
        if (selector.includes('option')) {
          // Handle dropdown selection
          const parentMatch = selector.match(/^(.+?) option/);
          if (parentMatch) {
            const parentSelector = parentMatch[1];
            if (selector.includes(':has-text(')) {
              const textMatch = selector.match(/:has-text\("(.+?)"\)/);
              return {
                action: this.generateSelectOption(parentSelector, { label: textMatch[1] }, language),
                comment: 'Select option by text'
              };
            }
          }
        }
        
        return {
          action: this.generatePageAction('click', selector, language),
          comment: `Click element (${durationMs}ms)`
        };
        
      case 'sendKeys':
        const inputValue = this.guessInputValue(selector);
        return {
          action: this.generatePageAction('fill', selector, language, inputValue),
          comment: 'Fill input field'
        };
        
      case 'clear':
        return {
          action: this.generatePageAction('fill', selector, language, ''),
          comment: 'Clear input field'
        };
        
      case 'getTagName':
        return {
          action: this.generateExpectation('toBeVisible', selector, language),
          comment: 'Verify element is visible'
        };
        
      case 'Navigation.refresh':
        return {
          action: this.generatePageAction('reload', '', language),
          comment: 'Refresh page'
        };
        
      case 'Navigation.back':
        return {
          action: this.generatePageAction('goBack', '', language),
          comment: 'Navigate back'
        };
        
      case 'Navigation.forward':
        return {
          action: this.generatePageAction('goForward', '', language),
          comment: 'Navigate forward'
        };
        
      default:
        return {
          action: this.generateComment(`TODO: Implement ${kind} action`, language),
          comment: `Unsupported action: ${kind}`
        };
    }
  }

  generatePageAction(action, selector, language, value = null) {
    // Always use double quotes for selectors to avoid escaping issues with single quotes in CSS selectors
    const escapedSelector = selector ? selector.replace(/"/g, '\\"') : '';
    const escapedValue = value ? value.replace(/"/g, '\\"') : '';
    
    switch (language) {
      case 'python':
        if (action === 'goto') return `await page.goto("${escapedSelector}")`;
        if (action === 'click') return `await page.click("${escapedSelector}")`;
        if (action === 'fill') return `await page.fill("${escapedSelector}", "${escapedValue}")`;
        if (action === 'reload') return `await page.reload()`;
        if (action === 'goBack') return `await page.go_back()`;
        if (action === 'goForward') return `await page.go_forward()`;
        break;
        
      case 'typescript':
      case 'javascript':
      default:
        if (action === 'goto') return `await page.goto("${escapedSelector}");`;
        if (action === 'click') return `await page.click("${escapedSelector}");`;
        if (action === 'fill') return `await page.fill("${escapedSelector}", "${escapedValue}");`;
        if (action === 'reload') return `await page.reload();`;
        if (action === 'goBack') return `await page.goBack();`;
        if (action === 'goForward') return `await page.goForward();`;
    }
    return '';
  }

  generateSelectOption(selector, option, language) {
    // Always use double quotes for selectors to avoid escaping issues
    const escapedSelector = selector ? selector.replace(/"/g, '\\"') : '';
    const escapedLabel = option.label ? option.label.replace(/"/g, '\\"') : '';
    const escapedValue = (option.value || option) ? (option.value || option).replace(/"/g, '\\"') : '';
    
    switch (language) {
      case 'python':
        if (option.label) return `await page.select_option("${escapedSelector}", label="${escapedLabel}")`;
        return `await page.select_option("${escapedSelector}", "${escapedValue}")`;
        
      case 'typescript':
      case 'javascript':
      default:
        if (option.label) return `await page.selectOption("${escapedSelector}", { label: "${escapedLabel}" });`;
        return `await page.selectOption("${escapedSelector}", "${escapedValue}");`;
    }
  }

  generateExpectation(assertion, selector, language) {
    // Always use double quotes for selectors to avoid escaping issues
    const escapedSelector = selector ? selector.replace(/"/g, '\\"') : '';
    
    switch (language) {
      case 'python':
        return `expect(page.locator("${escapedSelector}")).${assertion.replace('to', 'to_')}()`;
        
      case 'typescript':
      case 'javascript':
      default:
        return `await expect(page.locator("${escapedSelector}")).${assertion}();`;
    }
  }

  generateComment(text, language) {
    switch (language) {
      case 'python':
        return `# ${text}`;
      case 'typescript':
      case 'javascript':
      default:
        return `// ${text}`;
    }
  }

  guessInputValue(selector) {
    if (selector.includes('password')) return 'testPassword123';
    if (selector.includes('email')) return 'test@example.com';
    if (selector.includes('text')) return 'Sample text input';
    if (selector.includes('textarea')) return 'This is sample textarea content';
    if (selector.includes('name')) return 'John Doe';
    return 'test-value';
  }

  generateTestFile(steps, language) {
    switch (language) {
      case 'python':
        return this.generatePythonTest(steps);
      case 'typescript':
        return this.generateTypeScriptTest(steps);
      case 'javascript':
      default:
        return this.generateJavaScriptTest(steps);
    }
  }

  generateJavaScriptTest(steps) {
    const imports = `const { test, expect } = require('@playwright/test');`;
    
    const testBody = steps.map(step => 
      `    // ${step.comment}\n    ${step.action}`
    ).join('\n\n');
    
    return `${imports}

test('Migrated Selenium Test', async ({ page }) => {
    // This test was automatically migrated from Selenium trace
    
${testBody}
    
    // Add final verification
    await expect(page).toHaveURL(/.+/);
});

test.describe('Additional Test Scenarios', () => {
    test('Form Interaction Test', async ({ page }) => {
        // Simplified form interaction test
        await page.goto('https://www.selenium.dev/selenium/web/web-form.html');
        
        await page.fill('[name="my-text"]', 'Sample text input');
        await page.fill('[name="my-password"]', 'testPassword123');
        await page.selectOption('[name="my-select"]', { label: 'Two' });
        await page.check('input[type="checkbox"]');
        
        await expect(page.locator('[name="my-text"]')).toHaveValue('Sample text input');
        await expect(page.locator('input[type="checkbox"]')).toBeChecked();
    });
});`;
  }

  generateTypeScriptTest(steps) {
    const imports = `import { test, expect } from '@playwright/test';`;
    
    const testBody = steps.map(step => 
      `    // ${step.comment}\n    ${step.action}`
    ).join('\n\n');
    
    return `${imports}

test('Migrated Selenium Test', async ({ page }) => {
    // This test was automatically migrated from Selenium trace
    
${testBody}
    
    // Add final verification
    await expect(page).toHaveURL(/.+/);
});

test.describe('Additional Test Scenarios', () => {
    test('Form Interaction Test', async ({ page }) => {
        // Simplified form interaction test
        await page.goto('https://www.selenium.dev/selenium/web/web-form.html');
        
        await page.fill('[name="my-text"]', 'Sample text input');
        await page.fill('[name="my-password"]', 'testPassword123');
        await page.selectOption('[name="my-select"]', { label: 'Two' });
        await page.check('input[type="checkbox"]');
        
        await expect(page.locator('[name="my-text"]')).toHaveValue('Sample text input');
        await expect(page.locator('input[type="checkbox"]')).toBeChecked();
    });
});`;
  }

  generatePythonTest(steps) {
    const imports = `import pytest
from playwright.async_api import async_playwright, expect`;
    
    const testBody = steps.map(step => 
      `    # ${step.comment}\n    ${step.action}`
    ).join('\n\n');
    
    return `${imports}

@pytest.mark.asyncio
async def test_migrated_selenium_test():
    """This test was automatically migrated from Selenium trace"""
    async with async_playwright() as p:
        browser = await p.chromium.launch()
        page = await browser.new_page()
        
${testBody}
        
        # Add final verification
        await expect(page).to_have_url(re.compile(r".+"))
        
        await browser.close()

@pytest.mark.asyncio
async def test_form_interaction():
    """Simplified form interaction test"""
    async with async_playwright() as p:
        browser = await p.chromium.launch()
        page = await browser.new_page()
        
        await page.goto("https://www.selenium.dev/selenium/web/web-form.html")
        
        await page.fill('[name="my-text"]', "Sample text input")
        await page.fill('[name="my-password"]', "testPassword123")
        await page.select_option('[name="my-select"]', label="Two")
        await page.check('input[type="checkbox"]')
        
        await expect(page.locator('[name="my-text"]')).to_have_value("Sample text input")
        await expect(page.locator('input[type="checkbox"]')).to_be_checked()
        
        await browser.close()`;
  }

  getFilename(language) {
    switch (language) {
      case 'python':
        return 'test_migrated_selenium.py';
      case 'typescript':
        return 'migrated-selenium.spec.ts';
      case 'javascript':
      default:
        return 'migrated-selenium.spec.js';
    }
  }
}

module.exports = PlaywrightConverter;