# Framework Migration Tool

A comprehensive web-based tool for migrating Selenium test traces to modern testing frameworks like Playwright and Cypress. This tool analyzes Selenium trace files (NDJSON format) and automatically converts them into equivalent test scripts for your target framework.

## Features

- **Multi-Framework Support**: Convert Selenium tests to Playwright or Cypress
- **Multiple Languages**: Support for JavaScript, TypeScript, and Python (Playwright only)
- **Web Interface**: User-friendly drag-and-drop interface
- **Test Analysis**: Detailed analysis of conversion statistics and supported actions
- **Test Execution**: Built-in test execution with real-time results
- **Download Generated Tests**: Export converted test files for your projects

## Supported Actions

### Playwright Converter
- Element interactions: `get`, `click`, `sendKeys`, `clear`, `getTagName`
- Navigation: `Navigation.refresh`, `Navigation.back`, `Navigation.forward`
- Waits: `Wait.until`

### Cypress Converter
- Element interactions: `get`, `click`, `sendKeys`, `clear`, `getTagName`
- Navigation: `Navigation.refresh`, `Navigation.back`, `Navigation.forward`

## Prerequisites

- Node.js (version 14 or higher)
- npm or yarn package manager

## Installation

### 1. Clone the Repository
```bash
git clone <repository-url>
cd framework-migration
```

### 2. Install Dependencies

#### Option A: Install all dependencies at once
```bash
npm run install-all
```

#### Option B: Install manually
```bash
# Install backend dependencies
npm install

# Install frontend dependencies (if applicable)
cd frontend && npm install
```

### 3. Start the Application

#### Development Mode
```bash
npm run dev
```
This will start both the backend server and frontend development server concurrently.

#### Production Mode
```bash
npm start
```
This will start only the backend server serving the static frontend files.

#### Server Only
```bash
npm run server
```
Starts the backend server with nodemon for development.

## Usage

### 1. Access the Application
Open your web browser and navigate to:
```
http://localhost:3001
```

### 2. Upload Selenium Trace File
- Click on the upload area or drag and drop your Selenium trace file (`.ndjson` format)
- The tool will analyze the trace file and show conversion statistics
- Supported file formats: JSON and NDJSON

### 3. Select Target Framework
Choose your target testing framework:
- **Playwright**: Modern, fast, and reliable testing framework
- **Cypress**: Popular end-to-end testing framework

### 4. Select Programming Language
Choose your preferred programming language:
- **JavaScript**: Standard JavaScript syntax
- **TypeScript**: TypeScript with type definitions
- **Python**: Python syntax (Playwright only)

### 5. Convert Tests
- Click "Start Conversion" to begin the migration process
- View conversion results including:
  - Total actions processed
  - Successfully converted actions
  - Skipped/unsupported actions
  - Action breakdown statistics

### 6. Download or Execute Tests
- **Download**: Get the converted test file for use in your project
- **Execute**: Run the test directly in the tool's environment to verify functionality

## API Endpoints

The tool provides several REST API endpoints for programmatic access:

### Upload Trace File
```http
POST /api/upload
Content-Type: multipart/form-data

Body: trace file
```

### Get Available Frameworks
```http
GET /api/frameworks
```

### Convert Test
```http
POST /api/convert/:jobId
Content-Type: application/json

{
  "framework": "playwright|cypress",
  "language": "javascript|typescript|python"
}
```

### Execute Test
```http
POST /api/execute/:jobId
```

### Get Job Status
```http
GET /api/job/:jobId
```

### Get Server Logs
```http
GET /api/logs
```

## File Structure

```
framework-migration/
├── backend/
│   └── server.js              # Express server and API endpoints
├── converters/
│   ├── cypress-converter.js   # Cypress conversion logic
│   └── playwright-converter.js # Playwright conversion logic
├── frontend/                  # Frontend application (if separate)
├── public/
│   ├── index.html            # Main web interface
│   └── app.js                # Frontend JavaScript
├── uploads/                  # Uploaded trace files storage
├── package.json              # Project dependencies and scripts
└── README.md                 # This file
```

## Configuration

### Environment Variables
- `PORT`: Server port (default: 3001)

### File Upload Settings
- Maximum file size: Configured in multer settings
- Allowed file types: JSON and NDJSON files
- Upload directory: `./uploads/`

## Troubleshooting

### Common Issues

1. **Port already in use**
   ```bash
   # Change the port
   PORT=3002 npm start
   ```

2. **File upload fails**
   - Ensure the file is in NDJSON format
   - Check file size limits
   - Verify file permissions

3. **Conversion errors**
   - Check that the trace file contains valid Selenium events
   - Ensure the trace file has `step.ok` events
   - Review unsupported actions in the conversion results

4. **Test execution fails**
   - Verify the target framework is installed in the execution environment
   - Check network connectivity for web-based tests
   - Review execution logs for specific error details

### Debug Mode
Start the server with additional logging:
```bash
DEBUG=* npm start
```

## Contributing

1. Fork the repository
2. Create a feature branch
3. Make your changes
4. Add tests if applicable
5. Submit a pull request

## License

MIT License - see the LICENSE file for details.

## Support

For issues and questions:
1. Check the troubleshooting section
2. Review server logs at `/api/logs`
3. Create an issue in the repository

---

**Note**: This tool converts Selenium trace files to equivalent test scripts. The quality of conversion depends on the completeness and format of the original trace files. Always review and test the generated scripts before using them in production environments.