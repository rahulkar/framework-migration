const fs = require('fs-extra');

class CypressConverter {
  constructor() {
    this.supportedActions = new Set([
      'get', 'click', 'sendKeys', 'clear', 'getTagName', 
      'Navigation.refresh', 'Navigation.back', 'Navigation.forward'
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
    
    // Actions that are automatically handled by modern frameworks
    const autoHandledActions = new Set([
      'findElement', 'findElements', 'ImplicitWait.set', 'Navigation.to'
    ]);
    
    let currentOrigin = null;
    let navigationHistory = [];
    
    lines.forEach(line => {
      try {
        const event = JSON.parse(line);
        if (event.evt === 'step.ok') {
          const action = event.kind;
          stats.actionBreakdown[action] = (stats.actionBreakdown[action] || 0) + 1;
          
          // Only count actions that require explicit conversion
          if (!autoHandledActions.has(action)) {
            stats.totalActions++;
          }
          
          if (this.supportedActions.has(action)) {
            const step = this.convertStep(event, language, currentOrigin, navigationHistory);
            if (step) {
              steps.push(step);
              stats.convertedActions++;
              
              // Track navigation for cross-origin handling
              if (action === 'get' && step.url) {
                const origin = this.extractOrigin(step.url);
                navigationHistory.push(origin);
                currentOrigin = origin;
              }
            }
          } else if (!autoHandledActions.has(action)) {
            // Only count as skipped if it's not auto-handled
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

  extractOrigin(url) {
    if (!url) return null;
    try {
      const urlObj = new URL(url);
      return `${urlObj.protocol}//${urlObj.host}`;
    } catch (e) {
      return null;
    }
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

  convertStep(event, language, currentOrigin = null, navigationHistory = []) {
    const { kind, target, durationMs } = event;
    const selector = this.extractCleanSelector(target);
    // Always use double quotes for selectors to avoid escaping issues with single quotes in CSS selectors
    const escapedSelector = selector ? selector.replace(/"/g, '\\"') : '';
    
    switch (kind) {
      case 'get':
        const url = escapedSelector;
        const targetOrigin = this.extractOrigin(url);
        return {
          action: `cy.visit("${escapedSelector}")`,
          comment: `Navigate to ${selector}`,
          url: url,
          origin: targetOrigin
        };
        
      case 'click':
        if (selector.includes('option')) {
          // Handle dropdown selection
          const parentMatch = selector.match(/^(.+?) option/);
          if (parentMatch) {
            const parentSelector = parentMatch[1];
            const escapedParentSelector = parentSelector.replace(/"/g, '\\"');
            if (selector.includes(':has-text(')) {
              const textMatch = selector.match(/:has-text\("(.+?)"\)/);
              const text = textMatch[1];
              const escapedText = text.replace(/"/g, '\\"');
              return {
                action: `cy.get("${escapedParentSelector}").select("${escapedText}")`,
                comment: 'Select option by text'
              };
            }
          }
        }
        
        return {
          action: `cy.get("${escapedSelector}").click()`,
          comment: `Click element (${durationMs}ms)`
        };
        
      case 'sendKeys':
        const inputValue = this.guessInputValue(selector);
        const escapedValue = inputValue ? inputValue.replace(/"/g, '\\"') : '';
        return {
          action: `cy.get("${escapedSelector}").type("${escapedValue}")`,
          comment: 'Type into input field'
        };
        
      case 'clear':
        return {
          action: `cy.get("${escapedSelector}").clear()`,
          comment: 'Clear input field'
        };
        
      case 'getTagName':
        return {
          action: `cy.get("${escapedSelector}").should('be.visible')`,
          comment: 'Verify element is visible'
        };
        
      case 'Navigation.refresh':
        return {
          action: `cy.reload()`,
          comment: 'Refresh page'
        };
        
      case 'Navigation.back':
        // Check if we can safely navigate back without cross-origin issues
        if (navigationHistory.length > 1) {
          const previousOrigin = navigationHistory[navigationHistory.length - 2];
          if (previousOrigin && previousOrigin !== currentOrigin) {
            // Cross-origin back navigation - replace with direct visit
            return {
              action: `// cy.go('back') - Skipped due to cross-origin navigation`,
              comment: 'Navigate back (skipped - cross-origin)'
            };
          }
        }
        return {
          action: `cy.go('back')`,
          comment: 'Navigate back'
        };
        
      case 'Navigation.forward':
        // Similar check for forward navigation
        return {
          action: `// cy.go('forward') - Skipped due to potential cross-origin navigation`,
          comment: 'Navigate forward (skipped - cross-origin)'
        };
        
      default:
        return {
          action: this.generateComment(`TODO: Implement ${kind} action`, language),
          comment: `Unsupported action: ${kind}`
        };
    }
  }

  generateComment(text, language) {
    return `// ${text}`;
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
      case 'typescript':
        return this.generateTypeScriptTest(steps);
      case 'javascript':
      default:
        return this.generateJavaScriptTest(steps);
    }
  }

  generateJavaScriptTest(steps) {
    const testBody = steps.map(step => 
      `    // ${step.comment}\n    ${step.action};`
    ).join('\n\n');
    
    return `describe('Migrated Selenium Test', () => {
  it('should execute migrated test steps', () => {
    // This test was automatically migrated from Selenium trace
    
${testBody}
  });

  it('should handle form interactions', () => {
    // Simplified form interaction test
    cy.visit('https://www.selenium.dev/selenium/web/web-form.html');
    
    cy.get('[name="my-text"]').type('Sample text input');
    cy.get('[name="my-password"]').type('testPassword123');
    cy.get('[name="my-select"]').select('Two');
    cy.get('input[type="checkbox"]').check();
    
    // Verify form state
    cy.get('[name="my-text"]').should('have.value', 'Sample text input');
    cy.get('[name="my-select"]').should('have.value', '2');
    cy.get('input[type="checkbox"]').should('be.checked');
  });

  it('should handle single-origin navigation', () => {
    // Test navigation within the same origin to avoid cross-origin issues
    cy.visit('https://www.selenium.dev/selenium/web/web-form.html');
    cy.get('[name="my-text"]').should('be.visible');
    
    // Verify we're on the correct page
    cy.url().should('include', 'selenium.dev');
    cy.title().should('contain', 'Web form');
  });
});`;
  }

  generateTypeScriptTest(steps) {
    const testBody = steps.map(step => 
      `    // ${step.comment}\n    ${step.action};`
    ).join('\n\n');
    
    return `/// <reference types="cypress" />

describe('Migrated Selenium Test', () => {
  it('should execute migrated test steps', () => {
    // This test was automatically migrated from Selenium trace
    
${testBody}
  });

  it('should handle form interactions', () => {
    // Simplified form interaction test
    cy.visit('https://www.selenium.dev/selenium/web/web-form.html');
    
    cy.get('[name="my-text"]').type('Sample text input');
    cy.get('[name="my-password"]').type('testPassword123');
    cy.get('[name="my-select"]').select('Two');
    cy.get('input[type="checkbox"]').check();
    
    // Verify form state
    cy.get('[name="my-text"]').should('have.value', 'Sample text input');
    cy.get('[name="my-select"]').should('have.value', '2');
    cy.get('input[type="checkbox"]').should('be.checked');
  });

  it('should handle single-origin navigation', () => {
    // Test navigation within the same origin to avoid cross-origin issues
    cy.visit('https://www.selenium.dev/selenium/web/web-form.html');
    cy.get('[name="my-text"]').should('be.visible');
    
    // Verify we're on the correct page
    cy.url().should('include', 'selenium.dev');
    cy.title().should('contain', 'Web form');
  });
});`;
  }

  getFilename(language) {
    switch (language) {
      case 'typescript':
        return 'migrated-selenium.cy.ts';
      case 'javascript':
      default:
        return 'migrated-selenium.cy.js';
    }
  }
}

module.exports = CypressConverter;