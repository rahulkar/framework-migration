class FrameworkMigrationApp {
    constructor() {
        this.currentStep = 1;
        this.jobId = null;
        this.selectedFramework = null;
        this.selectedLanguage = null;
        this.frameworks = {};
        
        this.init();
    }
    
    init() {
        this.setupEventListeners();
        this.loadFrameworks();
    }
    
    setupEventListeners() {
        // File upload
        const fileInput = document.getElementById('fileInput');
        fileInput.addEventListener('change', (e) => this.handleFileUpload(e));
        
        // Drag and drop
        const dropZone = fileInput.parentElement;
        dropZone.addEventListener('dragover', (e) => {
            e.preventDefault();
            dropZone.classList.add('border-blue-400');
        });
        
        dropZone.addEventListener('dragleave', (e) => {
            e.preventDefault();
            dropZone.classList.remove('border-blue-400');
        });
        
        dropZone.addEventListener('drop', (e) => {
            e.preventDefault();
            dropZone.classList.remove('border-blue-400');
            const files = e.dataTransfer.files;
            if (files.length > 0) {
                this.uploadFile(files[0]);
            }
        });
        
        // Navigation buttons
        document.getElementById('proceedToConvert').addEventListener('click', () => {
            this.showStep(3);
        });
        
        document.getElementById('startConversion').addEventListener('click', () => {
            this.startConversion();
        });
        
        document.getElementById('downloadTest').addEventListener('click', () => {
            this.downloadTest();
        });
        
        document.getElementById('executeTest').addEventListener('click', () => {
            this.executeTest();
        });
        
        document.getElementById('startNew').addEventListener('click', () => {
            this.resetApp();
        });
        
        document.getElementById('refreshLogs').addEventListener('click', () => {
            this.fetchServerLogs();
        });
    }
    
    async loadFrameworks() {
        try {
            const response = await fetch('/api/frameworks');
            this.frameworks = await response.json();
            this.renderFrameworkOptions();
        } catch (error) {
            console.error('Error loading frameworks:', error);
            this.showError('Failed to load framework options');
        }
    }
    
    renderFrameworkOptions() {
        const container = document.getElementById('frameworkOptions');
        container.innerHTML = '';
        
        const frameworkIcons = {
            'playwright': 'fas fa-theater-masks',
            'cypress': 'fas fa-tree'
        };
        
        Object.entries(this.frameworks).forEach(([framework, config]) => {
            const option = document.createElement('div');
            option.className = 'framework-option bg-gray-50 border-2 border-gray-200 rounded-lg p-6 cursor-pointer hover:border-blue-400 transition-colors';
            option.dataset.framework = framework;
            
            option.innerHTML = `
                <div class="text-center">
                    <i class="${frameworkIcons[framework] || 'fas fa-cogs'} text-4xl text-gray-600 mb-4"></i>
                    <h3 class="text-xl font-semibold text-gray-800 mb-2">${config.name}</h3>
                    <p class="text-gray-600 text-sm mb-4">${config.description}</p>
                    <div class="flex flex-wrap justify-center gap-2">
                        ${config.languages.map(lang => `
                            <span class="bg-blue-100 text-blue-800 text-xs px-2 py-1 rounded">${lang.name}</span>
                        `).join('')}
                    </div>
                </div>
            `;
            
            option.addEventListener('click', () => this.selectFramework(framework));
            container.appendChild(option);
        });
    }
    
    selectFramework(framework) {
        // Remove previous selection
        document.querySelectorAll('.framework-option').forEach(el => {
            el.classList.remove('border-blue-500', 'bg-blue-50');
            el.classList.add('border-gray-200', 'bg-gray-50');
        });
        
        // Add selection to clicked option
        const selectedOption = document.querySelector(`[data-framework="${framework}"]`);
        selectedOption.classList.remove('border-gray-200', 'bg-gray-50');
        selectedOption.classList.add('border-blue-500', 'bg-blue-50');
        
        this.selectedFramework = framework;
        this.renderLanguageOptions();
        document.getElementById('languageSelection').classList.remove('hidden');
    }
    
    renderLanguageOptions() {
        const container = document.getElementById('languageOptions');
        container.innerHTML = '';
        
        const languages = this.frameworks[this.selectedFramework].languages;
        
        languages.forEach(language => {
            const option = document.createElement('div');
            option.className = 'language-option bg-white border-2 border-gray-200 rounded-lg p-4 cursor-pointer hover:border-blue-400 transition-colors text-center';
            option.dataset.language = language.code;
            
            const languageIcons = {
                'javascript': 'fab fa-js-square text-yellow-500',
                'typescript': 'fab fa-js-square text-blue-500',
                'python': 'fab fa-python text-green-500'
            };
            
            option.innerHTML = `
                <i class="${languageIcons[language.code] || 'fas fa-code'} text-2xl mb-2"></i>
                <div class="font-semibold text-gray-800">${language.name}</div>
            `;
            
            option.addEventListener('click', () => this.selectLanguage(language.code));
            container.appendChild(option);
        });
    }
    
    selectLanguage(language) {
        // Remove previous selection
        document.querySelectorAll('.language-option').forEach(el => {
            el.classList.remove('border-blue-500', 'bg-blue-50');
            el.classList.add('border-gray-200', 'bg-white');
        });
        
        // Add selection to clicked option
        const selectedOption = document.querySelector(`[data-language="${language}"]`);
        selectedOption.classList.remove('border-gray-200', 'bg-white');
        selectedOption.classList.add('border-blue-500', 'bg-blue-50');
        
        this.selectedLanguage = language;
        document.getElementById('startConversion').disabled = false;
    }
    
    handleFileUpload(event) {
        const file = event.target.files[0];
        if (file) {
            this.uploadFile(file);
        }
    }
    
    async uploadFile(file) {
        if (!file.name.endsWith('.json') && !file.name.endsWith('.ndjson')) {
            this.showError('Please upload a JSON or NDJSON file');
            return;
        }
        
        const formData = new FormData();
        formData.append('trace', file);
        
        this.showProgress();
        
        try {
            const response = await fetch('/api/upload', {
                method: 'POST',
                body: formData
            });
            
            if (!response.ok) {
                throw new Error(`Upload failed: ${response.statusText}`);
            }
            
            const result = await response.json();
            this.jobId = result.jobId;
            this.displayAnalysisResults(result.analysis);
            this.showStep(2);
        } catch (error) {
            console.error('Upload error:', error);
            this.showError('Failed to upload and analyze file');
        } finally {
            this.hideProgress();
        }
    }
    
    displayAnalysisResults(analysis) {
        document.getElementById('totalSteps').textContent = analysis.totalSteps;
        document.getElementById('supportedSteps').textContent = analysis.supportedSteps;
        document.getElementById('conversionRate').textContent = 
            `${Math.round((analysis.supportedSteps / analysis.totalSteps) * 100)}%`;
        
        const breakdown = document.getElementById('actionBreakdown');
        breakdown.innerHTML = '';
        
        Object.entries(analysis.actionTypes).forEach(([action, count]) => {
            const item = document.createElement('div');
            item.className = 'flex justify-between items-center bg-gray-50 px-4 py-2 rounded';
            item.innerHTML = `
                <span class="font-medium">${action}</span>
                <span class="bg-blue-100 text-blue-800 px-2 py-1 rounded text-sm">${count}</span>
            `;
            breakdown.appendChild(item);
        });
    }
    
    async startConversion() {
        if (!this.jobId || !this.selectedFramework || !this.selectedLanguage) {
            this.showError('Please complete all steps before converting');
            return;
        }
        
        try {
            const response = await fetch(`/api/convert/${this.jobId}`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                    framework: this.selectedFramework,
                    language: this.selectedLanguage
                })
            });
            
            if (!response.ok) {
                const errorData = await response.json().catch(() => ({ error: response.statusText }));
                throw new Error(errorData.error || `Conversion failed: ${response.statusText}`);
            }
            
            const result = await response.json();
            this.displayConversionResults(result);
            this.showStep(4);
        } catch (error) {
            console.error('Conversion error:', error);
            this.showError(`Failed to convert test: ${error.message}`);
        }
    }
    
    displayConversionResults(result) {
        // Display conversion statistics
        const statsContainer = document.getElementById('conversionStats');
        statsContainer.innerHTML = `
            <div class="flex justify-between items-center bg-gray-50 px-4 py-2 rounded">
                <span>Framework:</span>
                <span class="font-semibold">${result.framework} (${result.language})</span>
            </div>
            <div class="flex justify-between items-center bg-gray-50 px-4 py-2 rounded">
                <span>Total Actions:</span>
                <span class="font-semibold">${result.stats.totalActions}</span>
            </div>
            <div class="flex justify-between items-center bg-gray-50 px-4 py-2 rounded">
                <span>Converted Actions:</span>
                <span class="font-semibold">${result.stats.convertedActions}</span>
            </div>
            <div class="flex justify-between items-center bg-gray-50 px-4 py-2 rounded">
                <span>Success Rate:</span>
                <span class="font-semibold">${Math.round((result.stats.convertedActions / result.stats.totalActions) * 100)}%</span>
            </div>
        `;
        
        // Display generated code preview
        const codePreview = document.getElementById('generatedCode');
        const lines = result.generatedCode.split('\n');
        const preview = lines.slice(0, 20).join('\n');
        codePreview.textContent = preview + (lines.length > 20 ? '\n\n... (truncated)' : '');
    }
    
    async downloadTest() {
        if (!this.jobId) return;
        
        try {
            const response = await fetch(`/api/job/${this.jobId}`);
            const job = await response.json();
            
            const content = job.output?.content || job.generatedCode || 'No content available';
            const filename = job.output?.filename || 'migrated-test.js';
            
            const blob = new Blob([content], { type: 'text/plain' });
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = filename;
            document.body.appendChild(a);
            a.click();
            document.body.removeChild(a);
            URL.revokeObjectURL(url);
        } catch (error) {
            console.error('Download error:', error);
            this.showError('Failed to download test file');
        }
    }
    
    async executeTest() {
        console.log('Execute test clicked, jobId:', this.jobId);
        if (!this.jobId) {
            console.log('No jobId found, returning early');
            this.showError('No test available to execute. Please upload and convert a test first.');
            return;
        }
        
        try {
            console.log('Starting test execution for jobId:', this.jobId);
            
            // Get headless option
            const headlessToggle = document.getElementById('headlessToggle');
            const headless = headlessToggle ? headlessToggle.checked : true;
            
            // Start execution
            const response = await fetch(`/api/execute/${this.jobId}`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({ headless })
            });
            
            if (!response.ok) {
                const errorData = await response.json().catch(() => ({ error: response.statusText }));
                throw new Error(errorData.error || `Execution failed: ${response.statusText}`);
            }
            
            const result = await response.json();
            
            // Show execution started message
            this.showInfo('Test execution started. Please wait...');
            
            // Poll for execution results
            this.pollExecutionResults();
            
        } catch (error) {
            console.error('Execution error:', error);
            this.showError(`Failed to execute test: ${error.message}`);
        }
    }
    
    async pollExecutionResults() {
        const maxAttempts = 30; // 30 seconds timeout
        let attempts = 0;
        
        const poll = async () => {
            try {
                const response = await fetch(`/api/job/${this.jobId}`);
                const job = await response.json();
                
                if (job.status === 'execution_completed') {
                    this.displayExecutionResults(job.execution);
                    return;
                } else if (job.status === 'failed') {
                    this.showError(`Execution failed: ${job.error || 'Unknown error'}`);
                    return;
                }
                
                attempts++;
                if (attempts < maxAttempts) {
                    setTimeout(poll, 1000); // Poll every second
                } else {
                    this.showError('Execution timeout. Please check the server logs.');
                }
            } catch (error) {
                console.error('Polling error:', error);
                this.showError('Failed to get execution results');
            }
        };
        
        poll();
    }
    
    displayExecutionResults(execution) {
        const resultsContainer = document.getElementById('executionResults');
        const outputElement = document.getElementById('executionOutput');
        
        let displayText = '';
        if (execution.success) {
            displayText = `✅ Test execution completed successfully (Exit code: ${execution.exitCode})\n\n`;
        } else {
            displayText = `❌ Test execution failed (Exit code: ${execution.exitCode})\n\n`;
        }
        
        if (execution.output) {
            displayText += `Output:\n${execution.output}\n\n`;
        }
        
        if (execution.error) {
            displayText += `Errors:\n${execution.error}`;
        }
        
        if (!execution.output && !execution.error) {
            displayText += 'No output available';
        }
        
        outputElement.textContent = displayText;
        resultsContainer.classList.remove('hidden');
        
        // Show server logs
        this.showServerLogs();
        this.fetchServerLogs();
        
        // Scroll to results
        resultsContainer.scrollIntoView({ behavior: 'smooth' });
    }
    
    showStep(stepNumber) {
        // Hide all steps
        document.querySelectorAll('.step-content').forEach(el => {
            el.classList.add('hidden');
        });
        
        // Show current step
        const stepMap = {
            1: 'step-upload',
            2: 'step-analysis',
            3: 'step-framework',
            4: 'step-results'
        };
        
        document.getElementById(stepMap[stepNumber]).classList.remove('hidden');
        
        // Update step indicators
        document.querySelectorAll('.step-indicator').forEach((el, index) => {
            el.classList.remove('active', 'completed');
            if (index + 1 < stepNumber) {
                el.classList.add('completed');
            } else if (index + 1 === stepNumber) {
                el.classList.add('active');
            }
        });
        
        this.currentStep = stepNumber;
    }
    
    showProgress() {
        document.getElementById('uploadProgress').classList.remove('hidden');
        const progressBar = document.querySelector('.progress-bar');
        progressBar.style.width = '100%';
    }
    
    hideProgress() {
        document.getElementById('uploadProgress').classList.add('hidden');
        const progressBar = document.querySelector('.progress-bar');
        progressBar.style.width = '0%';
    }
    
    showError(message) {
        this.showMessage(message, 'error');
    }
    
    showInfo(message) {
        this.showMessage(message, 'info');
    }
    
    showMessage(message, type = 'info') {
        // Create or update message
        let messageDiv = document.getElementById('statusMessage');
        if (!messageDiv) {
            messageDiv = document.createElement('div');
            messageDiv.id = 'statusMessage';
            messageDiv.className = 'fixed top-4 right-4 px-6 py-3 rounded-lg shadow-lg z-50';
            document.body.appendChild(messageDiv);
        }
        
        // Set appropriate styling based on type
        if (type === 'error') {
            messageDiv.className = 'fixed top-4 right-4 bg-red-500 text-white px-6 py-3 rounded-lg shadow-lg z-50';
        } else if (type === 'info') {
            messageDiv.className = 'fixed top-4 right-4 bg-blue-500 text-white px-6 py-3 rounded-lg shadow-lg z-50';
        } else if (type === 'success') {
            messageDiv.className = 'fixed top-4 right-4 bg-green-500 text-white px-6 py-3 rounded-lg shadow-lg z-50';
        }
        
        messageDiv.textContent = message;
        messageDiv.style.display = 'block';
        
        // Auto-hide after 5 seconds for info messages, 8 seconds for errors
        const hideDelay = type === 'error' ? 8000 : 5000;
        setTimeout(() => {
            if (messageDiv) {
                messageDiv.style.display = 'none';
            }
        }, hideDelay);
    }
    
    showServerLogs() {
        const serverLogsContainer = document.getElementById('serverLogs');
        serverLogsContainer.classList.remove('hidden');
    }
    
    async fetchServerLogs() {
        try {
            const response = await fetch('/api/logs');
            if (response.ok) {
                const logs = await response.json();
                const logsOutput = document.getElementById('serverLogsOutput');
                logsOutput.textContent = logs.content || 'No logs available';
            } else {
                console.error('Failed to fetch server logs');
            }
        } catch (error) {
            console.error('Error fetching server logs:', error);
            const logsOutput = document.getElementById('serverLogsOutput');
            logsOutput.textContent = 'Error fetching server logs';
        }
    }
    
    resetApp() {
        this.currentStep = 1;
        this.jobId = null;
        this.selectedFramework = null;
        this.selectedLanguage = null;
        
        // Reset form
        document.getElementById('fileInput').value = '';
        document.getElementById('languageSelection').classList.add('hidden');
        document.getElementById('startConversion').disabled = true;
        document.getElementById('executionResults').classList.add('hidden');
        
        // Reset selections
        document.querySelectorAll('.framework-option, .language-option').forEach(el => {
            el.classList.remove('border-blue-500', 'bg-blue-50');
            el.classList.add('border-gray-200');
        });
        
        this.showStep(1);
    }
}

// Initialize the app when DOM is loaded
document.addEventListener('DOMContentLoaded', () => {
    new FrameworkMigrationApp();
});