document.addEventListener('DOMContentLoaded', () => {
    
    const tabBtns = document.querySelectorAll('.tab-btn');
    const tabContents = document.querySelectorAll('.tab-content');
    const dropZone = document.getElementById('dropZone');
    const fileInput = document.getElementById('fileInput');
    const fileInfo = document.getElementById('fileInfo');
    const filenameDisplay = fileInfo.querySelector('.filename');
    const removeFileBtn = document.getElementById('removeFile');
    const resumeText = document.getElementById('resumeText');
    const analyzeBtn = document.getElementById('analyzeBtn');
    const resultsSection = document.getElementById('resultsSection');
    const analysisContent = document.getElementById('analysisContent');
    const btnText = analyzeBtn.querySelector('.btn-text');
    const loader = analyzeBtn.querySelector('.loader');

    // State
    let currentFile = null;
    let extractedText = '';

    // Hardcoded API Key for Public Demo
    // WARNING: This key is visible in client-side code. 
    // For a real production app, use a backend proxy.
    const API_KEY = 'AIzaSyCxeuYd6xjhBonQyup44tNxxi4IgLWWGPA';

    // Initialize
    checkAnalyzeButtonState();

    // Tab Switching
    tabBtns.forEach(btn => {
        btn.addEventListener('click', () => {
            tabBtns.forEach(b => b.classList.remove('active'));
            tabContents.forEach(c => c.classList.remove('active'));
            btn.classList.add('active');
            document.getElementById(`${btn.dataset.tab}-tab`).classList.add('active');
            checkAnalyzeButtonState();
        });
    });

    // File Upload Handling
    dropZone.addEventListener('click', () => fileInput.click());

    dropZone.addEventListener('dragover', (e) => {
        e.preventDefault();
        dropZone.classList.add('drag-over');
    });

    dropZone.addEventListener('dragleave', () => {
        dropZone.classList.remove('drag-over');
    });

    dropZone.addEventListener('drop', (e) => {
        e.preventDefault();
        dropZone.classList.remove('drag-over');
        if (e.dataTransfer.files.length) {
            handleFile(e.dataTransfer.files[0]);
        }
    });

    fileInput.addEventListener('change', (e) => {
        if (e.target.files.length) {
            handleFile(e.target.files[0]);
        }
    });

    removeFileBtn.addEventListener('click', () => {
        currentFile = null;
        extractedText = '';
        fileInput.value = '';
        dropZone.classList.remove('hidden');
        fileInfo.classList.add('hidden');
        checkAnalyzeButtonState();
    });

    resumeText.addEventListener('input', checkAnalyzeButtonState);

    analyzeBtn.addEventListener('click', performAnalysis);

    // Functions
    async function handleFile(file) {
        if (file.type !== 'application/pdf') {
            alert('Please upload a PDF file.');
            return;
        }

        currentFile = file;
        filenameDisplay.textContent = file.name;
        dropZone.classList.add('hidden');
        fileInfo.classList.remove('hidden');

        // Extract text from PDF
        try {
            extractedText = await extractTextFromPDF(file);
            checkAnalyzeButtonState();
        } catch (error) {
            console.error('PDF Extraction Error:', error);
            alert('Failed to read PDF. Please try pasting the text instead.');
            removeFileBtn.click();
        }
    }

    async function extractTextFromPDF(file) {
        const arrayBuffer = await file.arrayBuffer();
        const pdf = await pdfjsLib.getDocument({ data: arrayBuffer }).promise;
        let fullText = '';

        for (let i = 1; i <= pdf.numPages; i++) {
            const page = await pdf.getPage(i);
            const textContent = await page.getTextContent();
            const pageText = textContent.items.map(item => item.str).join(' ');
            fullText += pageText + '\n';
        }

        return fullText;
    }

    function checkAnalyzeButtonState() {
        const hasKey = !!API_KEY;
        const activeTab = document.querySelector('.tab-btn.active').dataset.tab;
        const hasContent = activeTab === 'upload' ? !!currentFile : resumeText.value.trim().length > 0;

        analyzeBtn.disabled = !(hasKey && hasContent);
    }

    async function performAnalysis() {
        const apiKey = API_KEY;
        const activeTab = document.querySelector('.tab-btn.active').dataset.tab;
        const content = activeTab === 'upload' ? extractedText : resumeText.value.trim();

        if (!apiKey || !content) return;

        setLoading(true);
        resultsSection.classList.add('hidden');

        const prompt = `
            You are an expert career coach and resume analyst. Please analyze the following resume text and provide structured feedback.
            
            Resume Content:
            ${content}

            Please provide the analysis in the following Markdown format:
            # Resume Analysis
            
            ## 🎯 Executive Summary
            [Brief 2-3 sentence overview of the candidate's profile]

            ## ✅ Strengths
            - [Strength 1]
            - [Strength 2]
            - [Strength 3]

            ## ⚠️ Areas for Improvement
            - [Weakness 1]
            - [Weakness 2]

            ## 💡 Actionable Recommendations
            1. [Recommendation 1]
            2. [Recommendation 2]
            3. [Recommendation 3]

            ## 🔮 Career Fit
            [Suggested roles or industries based on skills]
        `;

        try {
            const result = await callGeminiAPI(apiKey, prompt);
            displayResults(result);
        } catch (error) {
            console.error('API Error:', error);
            alert('Analysis failed: ' + (error.message || 'Unknown error'));
        } finally {
            setLoading(false);
        }
    }

    async function callGeminiAPI(apiKey, prompt) {
        // List of models to try in order of preference
        const modelsToTry = [
            'gemini-2.5-flash',
            'gemini-2.0-flash',
            'gemini-2.0-flash-001',
            'gemini-1.5-flash',
            'gemini-1.5-flash-latest',
            'gemini-1.5-pro',
            'gemini-pro'
        ];

        let lastError = null;

        for (const model of modelsToTry) {
            try {
                console.log(`Attempting to use model: ${model}`);
                const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`;

                const response = await fetch(url, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        contents: [{ parts: [{ text: prompt }] }]
                    })
                });

                if (!response.ok) {
                    const errData = await response.json().catch(() => ({}));
                    const errorMessage = errData.error?.message || response.statusText;

                    // If it's a 404 (Not Found), try the next model
                    if (response.status === 404) {
                        console.warn(`Model ${model} not found (404). Trying next...`);
                        continue;
                    }

                    // For other errors (like 400, 403), throw to catch block
                    throw new Error(`API Error (${response.status}): ${errorMessage}`);
                }

                const data = await response.json();
                if (!data.candidates || data.candidates.length === 0) {
                    throw new Error('Empty response from model');
                }

                return data.candidates[0].content.parts[0].text;

            } catch (error) {
                lastError = error;
                console.error(`Error with model ${model}:`, error);
                // Continue to next model
            }
        }

        // If we get here, all models failed
        console.error('All models failed.');
        logAvailableModels(apiKey);

        throw new Error(`All models failed. Last error: ${lastError?.message || JSON.stringify(lastError)}`);
    }

    async function logAvailableModels(apiKey) {
        try {
            const url = `https://generativelanguage.googleapis.com/v1beta/models?key=${apiKey}`;
            const response = await fetch(url);
            if (response.ok) {
                const data = await response.json();
                console.log('Available Models for this key:', data);
                const modelNames = data.models?.map(m => m.name) || [];
                alert(`All attempts failed. Your key has access to: \n${modelNames.join('\n')}\n\nCheck console for details.`);
            } else {
                console.error('Failed to list models, status:', response.status);
            }
        } catch (e) {
            console.error('Failed to list models:', e);
        }
    }

    function displayResults(markdownText) {
        analysisContent.innerHTML = marked.parse(markdownText);
        resultsSection.classList.remove('hidden');
        resultsSection.scrollIntoView({ behavior: 'smooth' });
    }

    function setLoading(isLoading) {
        analyzeBtn.disabled = isLoading;
        if (isLoading) {
            btnText.classList.add('hidden');
            loader.classList.remove('hidden');
        } else {
            btnText.classList.remove('hidden');
            loader.classList.add('hidden');
        }
    }
});
