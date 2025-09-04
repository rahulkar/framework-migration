const express = require('express');
const multer = require('multer');
const cors = require('cors');
const fs = require('fs-extra');
const path = require('path');
const { v4: uuidv4 } = require('uuid');
const { spawn } = require('child_process');

const app = express();
const PORT = process.env.PORT || 3001;

// Middleware
app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, '../public')));

// Configure multer for file uploads
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    const uploadDir = path.join(__dirname, '../uploads');
    fs.ensureDirSync(uploadDir);
    cb(null, uploadDir);
  },
  filename: (req, file, cb) => {
    const uniqueName = `${uuidv4()}-${file.originalname}`;
    cb(null, uniqueName);
  }
});

const upload = multer({ 
  storage,
  fileFilter: (req, file, cb) => {
    if (file.mimetype === 'application/json' || file.originalname.endsWith('.ndjson')) {
      cb(null, true);
    } else {
      cb(new Error('Only JSON and NDJSON files are allowed'), false);
    }
  }
});

// Store conversion jobs
const conversionJobs = new Map();

// Helper function to create test environment
async function createTestEnvironment(outputDir, framework, language) {
  if (framework === 'playwright') {
    const packageJson = {
      "name": "migrated-playwright-test",
      "version": "1.0.0",
      "description": "Migrated Selenium test for Playwright",
      "scripts": {
        "test": "playwright test",
        "test:headed": "playwright test --headed",
        "test:debug": "playwright test --debug"
      },
      "devDependencies": {
        "@playwright/test": "^1.40.0"
      }
    };
    
    if (language === 'python') {
      packageJson.scripts = {
        "test": "python -m pytest -v",
        "install": "pip install playwright pytest"
      };
      packageJson.devDependencies = {};
      
      // Create requirements.txt for Python
      const requirements = "playwright\npytest\npytest-playwright";
      await fs.writeFile(path.join(outputDir, 'requirements.txt'), requirements);
    }
    
    await fs.writeFile(path.join(outputDir, 'package.json'), JSON.stringify(packageJson, null, 2));
    
    // Create playwright.config.js
    const playwrightConfig = `module.exports = {
  testDir: './',
  timeout: 30000,
  expect: {
    timeout: 5000
  },
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  workers: process.env.CI ? 1 : undefined,
  reporter: 'html',
  use: {
    baseURL: 'https://www.selenium.dev/selenium/web/',
    trace: 'on-first-retry',
    screenshot: 'only-on-failure'
  },
  projects: [
    {
      name: 'chromium',
      use: { ...require('@playwright/test').devices['Desktop Chrome'] }
    }
  ]
};`;
    
    await fs.writeFile(path.join(outputDir, 'playwright.config.js'), playwrightConfig);
    
  } else if (framework === 'cypress') {
    const packageJson = {
      "name": "migrated-cypress-test",
      "version": "1.0.0",
      "description": "Migrated Selenium test for Cypress",
      "scripts": {
        "test": "cypress run",
        "test:headed": "cypress open"
      },
      "devDependencies": {
        "cypress": "^13.0.0"
      }
    };
    
    await fs.writeFile(path.join(outputDir, 'package.json'), JSON.stringify(packageJson, null, 2));
    
    // Create cypress.config.js
    const cypressConfig = `const { defineConfig } = require('cypress');

module.exports = defineConfig({
  e2e: {
    baseUrl: 'https://www.selenium.dev/selenium/web/',
    supportFile: false,
    specPattern: '*.cy.js',
    video: false,
    screenshot: false
  }
});`;
    
    await fs.writeFile(path.join(outputDir, 'cypress.config.js'), cypressConfig);
  }
}

// API Routes

// Get supported frameworks and languages
app.get('/api/frameworks', (req, res) => {
  const frameworks = {
    playwright: {
      name: 'Playwright',
      description: 'Modern end-to-end testing framework',
      languages: [
        { code: 'javascript', name: 'JavaScript', extension: '.spec.js' },
        { code: 'typescript', name: 'TypeScript', extension: '.spec.ts' },
        { code: 'python', name: 'Python', extension: '_test.py' }
      ],
      features: ['Cross-browser', 'Auto-wait', 'Network interception', 'Mobile testing']
    },
    cypress: {
      name: 'Cypress',
      description: 'Fast, easy and reliable testing for anything that runs in a browser',
      languages: [
        { code: 'javascript', name: 'JavaScript', extension: '.cy.js' },
        { code: 'typescript', name: 'TypeScript', extension: '.cy.ts' }
      ],
      features: ['Real-time reloads', 'Time travel', 'Network stubbing', 'Visual testing']
    }
  };
  
  res.json(frameworks);
});

// Upload trace file
app.post('/api/upload', upload.single('trace'), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: 'No file uploaded' });
    }

    const jobId = uuidv4();
    const filePath = req.file.path;
    
    // Analyze the uploaded file
    const fileContent = await fs.readFile(filePath, 'utf8');
    const lines = fileContent.split('\n').filter(line => line.trim());
    
    let totalSteps = 0;
    let supportedSteps = 0;
    const actionTypes = {};
    
    lines.forEach(line => {
      try {
        const event = JSON.parse(line);
        if (event.evt === 'step.ok') {
          totalSteps++;
          
          // Count action types
          if (actionTypes[event.kind]) {
            actionTypes[event.kind]++;
          } else {
            actionTypes[event.kind] = 1;
          }
          
          // Check if action is supported
          const supportedActions = ['get', 'click', 'sendKeys', 'clear', 'getTagName', 'Navigation.refresh', 'Navigation.back', 'Navigation.forward'];
          if (supportedActions.includes(event.kind)) {
            supportedSteps++;
          }
        }
      } catch (e) {
        // Skip invalid JSON lines
      }
    });
    
    const analysis = {
      totalSteps,
      supportedSteps,
      unsupportedSteps: totalSteps - supportedSteps,
      conversionRate: totalSteps > 0 ? Math.round((supportedSteps / totalSteps) * 100) : 0,
      actionTypes,
      fileSize: req.file.size,
      fileName: req.file.originalname
    };
    
    // Store job info
    conversionJobs.set(jobId, {
      id: jobId,
      filePath,
      analysis,
      status: 'analyzed',
      createdAt: new Date()
    });
    
    res.json({
      jobId,
      analysis
    });
    
  } catch (error) {
    console.error('Upload error:', error);
    res.status(500).json({ error: 'Failed to process uploaded file' });
  }
});

// Get job status
app.get('/api/job/:jobId', (req, res) => {
  const job = conversionJobs.get(req.params.jobId);
  if (!job) {
    return res.status(404).json({ error: 'Job not found' });
  }
  res.json(job);
});

// Convert trace to target framework
app.post('/api/convert/:jobId', async (req, res) => {
  try {
    const { jobId } = req.params;
    const { framework, language } = req.body;
    
    const job = conversionJobs.get(jobId);
    if (!job) {
      return res.status(404).json({ error: 'Job not found' });
    }
    
    // Update job status
    job.status = 'converting';
    job.framework = framework;
    job.language = language;
    conversionJobs.set(jobId, job);
    
    // Load the appropriate converter
    const converterPath = path.join(__dirname, '../converters', `${framework}-converter.js`);
    const Converter = require(converterPath);
    
    const converter = new Converter();
    const result = await converter.convert(job.filePath, language);
    
    // Save converted test
    const outputDir = path.join(__dirname, '../outputs', jobId);
    await fs.ensureDir(outputDir);
    
    const outputFile = path.join(outputDir, result.filename);
    await fs.writeFile(outputFile, result.content);
    
    // Create package.json and configuration files for the test to run
    await createTestEnvironment(outputDir, framework, language);
    
    // Update job with results
    job.status = 'completed';
    job.output = {
      filename: result.filename,
      content: result.content,
      path: outputFile,
      stats: result.stats
    };
    conversionJobs.set(jobId, job);
    
    res.json({
      success: true,
      framework: job.framework,
      language: job.language,
      stats: result.stats,
      generatedCode: result.content,
      output: job.output
    });
    
  } catch (error) {
    console.error('Conversion error:', error);
    
    // Update job status to failed
    const job = conversionJobs.get(req.params.jobId);
    if (job) {
      job.status = 'failed';
      job.error = error.message;
      conversionJobs.set(req.params.jobId, job);
    }
    
    res.status(500).json({ error: 'Conversion failed: ' + error.message });
  }
});

// Execute generated test
app.post('/api/execute/:jobId', async (req, res) => {
  try {
    const { jobId } = req.params;
    const { headless = true } = req.body;
    const job = conversionJobs.get(jobId);
    
    if (!job || !job.output) {
      return res.status(404).json({ error: 'Job or output not found' });
    }
    
    job.status = 'executing';
    conversionJobs.set(jobId, job);
    
    const outputDir = path.dirname(job.output.path);
    
    // First install dependencies
    let installSuccess = false;
    try {
      if (job.framework === 'playwright') {
        if (job.language === 'python') {
          // Install Python dependencies
          await new Promise((resolve, reject) => {
            const install = spawn('python', ['-m', 'pip', 'install', '-r', 'requirements.txt'], { 
              cwd: outputDir,
              stdio: 'pipe',
              shell: true
            });
            install.on('error', (err) => {
              reject(new Error(`pip install spawn error: ${err.message}`));
            });
            install.on('close', (code) => {
              if (code === 0) resolve();
              else reject(new Error(`pip install failed with code ${code}`));
            });
          });
        } else {
          // Install Node.js dependencies
          await new Promise((resolve, reject) => {
            const install = spawn('npm.cmd', ['install'], { 
              cwd: outputDir,
              stdio: 'pipe',
              shell: true
            });
            install.on('error', (err) => {
              reject(new Error(`npm install spawn error: ${err.message}`));
            });
            install.on('close', (code) => {
              if (code === 0) resolve();
              else reject(new Error(`npm install failed with code ${code}`));
            });
          });
          
          // Install Playwright browsers
          await new Promise((resolve, reject) => {
            const installBrowsers = spawn('npx.cmd', ['playwright', 'install'], { 
              cwd: outputDir,
              stdio: 'pipe',
              shell: true
            });
            installBrowsers.on('error', (err) => {
              reject(new Error(`playwright install spawn error: ${err.message}`));
            });
            installBrowsers.on('close', (code) => {
              if (code === 0) resolve();
              else reject(new Error(`playwright install failed with code ${code}`));
            });
          });
        }
      } else if (job.framework === 'cypress') {
        // Install Node.js dependencies for Cypress
         await new Promise((resolve, reject) => {
           const install = spawn('npm.cmd', ['install'], { 
             cwd: outputDir,
             stdio: 'pipe',
             shell: true
           });
           install.on('error', (err) => {
             reject(new Error(`npm install spawn error: ${err.message}`));
           });
          install.on('close', (code) => {
            if (code === 0) resolve();
            else reject(new Error(`npm install failed with code ${code}`));
          });
        });
      }
      installSuccess = true;
    } catch (installError) {
      job.status = 'failed';
      job.error = `Dependency installation failed: ${installError.message}`;
      conversionJobs.set(jobId, job);
      return res.status(500).json({ error: job.error });
    }
    
    // Execute the test based on framework
    let command, args;
    
    if (job.framework === 'playwright') {
      if (job.language === 'python') {
        command = 'python';
        args = ['-m', 'pytest', job.output.filename, '-v'];
        if (!headless) {
          args.push('--headed');
        }
      } else {
        command = 'npx.cmd';
        args = ['playwright', 'test', job.output.filename];
        if (!headless) {
          args.push('--headed');
        }
      }
    } else if (job.framework === 'cypress') {
      command = 'npx.cmd';
      args = ['cypress', 'run', '--spec', job.output.filename];
      if (!headless) {
        args.push('--headed');
      }
    }
    
    const execution = spawn(command, args, { 
      cwd: outputDir,
      stdio: 'pipe',
      shell: true
    });
    
    execution.on('error', (err) => {
      job.status = 'execution_failed';
      job.execution = {
        success: false,
        exitCode: -1,
        output: '',
        error: `Test execution spawn error: ${err.message}`
      };
      conversionJobs.set(jobId, job);
    });
    
    let output = '';
    let error = '';
    
    execution.stdout.on('data', (data) => {
      output += data.toString();
    });
    
    execution.stderr.on('data', (data) => {
      error += data.toString();
    });
    
    execution.on('close', (code) => {
      job.status = 'execution_completed';
      job.execution = {
        exitCode: code,
        output,
        error,
        success: code === 0
      };
      conversionJobs.set(jobId, job);
    });
    
    // Return immediately with execution started status
    res.json({
      success: true,
      message: 'Test execution started',
      executionId: jobId
    });
    
  } catch (error) {
    console.error('Execution error:', error);
    res.status(500).json({ error: 'Failed to execute test: ' + error.message });
  }
});

// Get all jobs (for dashboard)
app.get('/api/jobs', (req, res) => {
  const jobs = Array.from(conversionJobs.values())
    .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
  res.json(jobs);
});

// Server logs endpoint
app.get('/api/logs', (req, res) => {
  try {
    // In a real application, you might read from actual log files
    // For now, we'll return recent console output or job-related logs
    const recentJobs = Array.from(conversionJobs.values())
      .slice(-5) // Get last 5 jobs
      .map(job => {
        let logEntry = `[${new Date().toISOString()}] Job ${job.id}: ${job.status}`;
        if (job.framework) logEntry += ` (${job.framework})`;
        if (job.error) logEntry += ` - Error: ${job.error}`;
        if (job.execution) {
          logEntry += `\n  Execution: ${job.execution.success ? 'SUCCESS' : 'FAILED'} (exit code: ${job.execution.exitCode})`;
        }
        return logEntry;
      })
      .join('\n\n');
    
    const serverInfo = `Framework Migration Server - Port ${PORT}\nUpload Directory: ${path.join(__dirname, '../uploads')}\nOutput Directory: ${path.join(__dirname, '../outputs')}\n\nRecent Activity:\n${recentJobs || 'No recent activity'}`;
    
    res.json({ content: serverInfo });
  } catch (error) {
    console.error('Error fetching logs:', error);
    res.status(500).json({ error: 'Failed to fetch server logs' });
  }
});

// Serve React app
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, '../public/index.html'));
});

// Error handling middleware
app.use((error, req, res, next) => {
  if (error instanceof multer.MulterError) {
    return res.status(400).json({ error: 'File upload error: ' + error.message });
  }
  res.status(500).json({ error: 'Internal server error' });
});

app.listen(PORT, () => {
  console.log(`🚀 Framework Migration Server running on port ${PORT}`);
  console.log(`📁 Upload directory: ${path.join(__dirname, '../uploads')}`);
  console.log(`📤 Output directory: ${path.join(__dirname, '../outputs')}`);
});