/**
 * ============================================
 * MAIN APPLICATION MODULE
 * ============================================
 * 
 * This is the core controller for the file compressor app.
 * It handles:
 * - UI initialization and event listeners
 * - File upload and management
 * - Coordinating image/PDF processing
 * - Download functionality
 * 
 * Architecture: Module Pattern (IIFE)
 * - Encapsulates all code to avoid global scope pollution
 * - Uses internal state management
 * - Exposes no public API (self-contained)
 */

(function() {
    'use strict';

    /**
     * ============================================
     * APPLICATION STATE
     * ============================================
     * Centralized state management for the app
     */
    const state = {
        files: [],              // Array of uploaded file objects
        targetSizeKB: 200,      // User's target file size in KB
        outputFormat: 'image/jpeg'  // Selected output format
    };

    // DOM element references (cached for performance)
    const elements = {};

    // Template for file cards
    let fileCardTemplate;

    /**
     * ============================================
     * INITIALIZATION
     * ============================================
     * Sets up the application when page loads
     */
    function init() {
        // Cache all DOM elements for faster access
        cacheElements();
        
        // Attach event listeners to interactive elements
        initEventListeners();
        
        // Load the file card template from HTML
        fileCardTemplate = document.getElementById('fileCardTemplate');
        
        // Initialize state from default values
        state.targetSizeKB = parseInt(elements.targetSize.value) || 200;
        state.outputFormat = elements.outputFormat.value;
        
        // Load saved theme preference
        loadThemePreference();
    }

    /**
     * Cache DOM element references
     * This avoids repeated querySelector calls for better performance
     */
    function cacheElements() {
        elements.outputFormat = document.getElementById('outputFormat');
        elements.targetSize = document.getElementById('targetSize');
        elements.themeToggle = document.getElementById('themeToggle');
        elements.dropZone = document.getElementById('dropZone');
        elements.fileInput = document.getElementById('fileInput');
        elements.browseBtn = document.getElementById('browseBtn');
        elements.progressSection = document.getElementById('progressSection');
        elements.progressBar = document.getElementById('progressBar');
        elements.progressText = document.getElementById('progressText');
        elements.filesSection = document.getElementById('filesSection');
        elements.filesGrid = document.getElementById('filesGrid');
        elements.downloadAllBtn = document.getElementById('downloadAllBtn');
    }

    /**
     * Initialize all event listeners
     * Connects UI elements to their handler functions
     */
    function initEventListeners() {
        // Update target size when user changes the input
        elements.targetSize.addEventListener('change', () => {
            state.targetSizeKB = parseInt(elements.targetSize.value) || 200;
        });
        
        // Update output format when user changes selection
        elements.outputFormat.addEventListener('change', () => {
            state.outputFormat = elements.outputFormat.value;
        });
        
        // Theme toggle button
        elements.themeToggle.addEventListener('click', toggleTheme);
        
        // Drag and drop events for the upload zone
        elements.dropZone.addEventListener('dragover', onDragOver);
        elements.dropZone.addEventListener('dragleave', onDragLeave);
        elements.dropZone.addEventListener('drop', onDrop);
        elements.dropZone.addEventListener('click', onDropZoneClick);
        
        // File input change event (when user selects files via dialog)
        elements.fileInput.addEventListener('change', onFileSelect);
        
        // Download all processed files as ZIP
        elements.downloadAllBtn.addEventListener('click', downloadAll);
    }

    /**
     * ============================================
     * THEME MANAGEMENT
     * ============================================
     */

    /**
     * Load user's theme preference from localStorage
     * Falls back to system preference if not saved
     */
    function loadThemePreference() {
        const savedTheme = localStorage.getItem('theme');
        const systemPrefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
        
        if (savedTheme) {
            document.documentElement.setAttribute('data-theme', savedTheme);
        } else if (!systemPrefersDark) {
            document.documentElement.setAttribute('data-theme', 'light');
        }
    }

    /**
     * Toggle between light and dark themes
     * Saves preference to localStorage
     */
    function toggleTheme() {
        const currentTheme = document.documentElement.getAttribute('data-theme');
        const newTheme = currentTheme === 'light' ? 'dark' : 'light';
        
        document.documentElement.setAttribute('data-theme', newTheme);
        localStorage.setItem('theme', newTheme);
    }

    /**
     * ============================================
     * DRAG & DROP HANDLERS
     * ============================================
     */

    /**
     * Handle drag over event
     * Prevents default to allow drop, adds visual feedback
     */
    function onDragOver(e) {
        e.preventDefault();  // Required to allow dropping
        elements.dropZone.classList.add('drag-over');
    }

    /**
     * Handle drag leave event
     * Removes visual feedback when drag leaves the zone
     */
    function onDragLeave(e) {
        e.preventDefault();
        elements.dropZone.classList.remove('drag-over');
    }

    /**
     * Handle file drop event
     * Extracts files from the drop event and validates them
     */
    function onDrop(e) {
        e.preventDefault();
        elements.dropZone.classList.remove('drag-over');
        
        // Get files from the drop event
        const files = Array.from(e.dataTransfer.files).filter(isValidFileType);
        
        if (files.length > 0) {
            addFiles(files);
        } else {
            showError('Please upload JPG, JPEG, PNG, or PDF files only.');
        }
    }

    /**
     * Handle click on drop zone
     * Opens the native file picker dialog
     */
    function onDropZoneClick() {
        elements.fileInput.click();
    }

    /**
     * Handle file selection from input dialog
     */
    function onFileSelect(e) {
        const files = Array.from(e.target.files).filter(isValidFileType);
        if (files.length > 0) {
            addFiles(files);
        }
        // Reset input so same file can be selected again
        elements.fileInput.value = '';
    }

    /**
     * Validate file type
     * Only allows common image formats and PDFs
     */
    function isValidFileType(file) {
        const validTypes = ['image/jpeg', 'image/jpg', 'image/png', 'application/pdf'];
        const validExtensions = ['.jpg', '.jpeg', '.png', '.pdf'];
        const nameLower = file.name.toLowerCase();
        
        return validTypes.includes(file.type) || 
               validExtensions.some(ext => nameLower.endsWith(ext));
    }

    /**
     * ============================================
     * FILE MANAGEMENT
     * ============================================
     */

    /**
     * Add files to the application
     * Creates file objects and adds them to state
     */
    function addFiles(files) {
        files.forEach(file => {
            // Create a file object to track processing state
            const fileObj = {
                id: Date.now() + Math.random().toString(36).substr(2, 9),  // Unique ID
                file: file,                    // Original File object
                name: file.name,               // Filename for display
                originalSize: file.size,       // Original size in bytes
                processed: false,              // Has it been processed?
                results: [],                   // Processed results (can be multiple for PDFs)
                thumbnail: null,               // Preview image data URL
                pageCount: null,               // Number of pages (for PDFs)
                selectedPage: 1,               // Selected page number
                convertAllPages: false         // Convert all pages or just one?
            };
            
            state.files.push(fileObj);
            createFileCard(fileObj);
        });
        
        // Show the files section now that we have files
        elements.filesSection.classList.remove('hidden');
        
        // Generate thumbnails for all uploaded files
        files.forEach((file, index) => {
            const fileObj = state.files[state.files.length - files.length + index];
            generateThumbnail(fileObj);
        });
        
        updateDownloadAllButton();
    }

    /**
     * Generate thumbnail preview for a file
     * Uses different methods for images vs PDFs
     */
    async function generateThumbnail(fileObj) {
        try {
            if (PDFProcessor.isPDF(fileObj.file)) {
                // For PDFs, render first page as thumbnail
                fileObj.thumbnail = await PDFProcessor.createThumbnail(fileObj.file);
                fileObj.pageCount = await PDFProcessor.getPageCount(fileObj.file);
            } else {
                // For images, create a scaled-down version
                fileObj.thumbnail = await ImageProcessor.createThumbnail(fileObj.file);
            }
            
            // Update the card with the thumbnail
            const card = document.querySelector(`[data-file-id="${fileObj.id}"]`);
            if (card) {
                const img = card.querySelector('.thumbnail');
                img.src = fileObj.thumbnail;
                
                // Update file info with page count for PDFs
                const originalInfo = card.querySelector('.original-info');
                if (PDFProcessor.isPDF(fileObj.file)) {
                    originalInfo.textContent = `${formatFileSize(fileObj.originalSize)} • PDF (${fileObj.pageCount} pages)`;
                }
                
                // If PDF has multiple pages, show page selector
                if (fileObj.pageCount > 1) {
                    setupPageSelector(card, fileObj);
                }
            }
        } catch (err) {
            console.error('Error generating thumbnail:', err);
        }
    }

    /**
     * Setup page selector for multi-page PDFs
     * Allows user to choose which page(s) to convert
     */
    function setupPageSelector(card, fileObj) {
        const selectorContainer = card.querySelector('.pdf-page-selector');
        const select = selectorContainer.querySelector('.page-select');
        const convertAllContainer = card.querySelector('.convert-all-container');
        const convertAllCheckbox = card.querySelector('.convert-all-checkbox');
        
        // Only show for multi-page PDFs
        if (fileObj.pageCount <= 1) {
            return;
        }
        
        // Show the "convert all pages" option
        convertAllContainer.classList.remove('hidden');
        
        // Populate dropdown with page options
        select.innerHTML = '';
        
        // Add "All Pages" option
        const allOption = document.createElement('option');
        allOption.value = 'all';
        allOption.textContent = `All ${fileObj.pageCount} pages`;
        select.appendChild(allOption);
        
        // Add individual page options
        for (let i = 1; i <= fileObj.pageCount; i++) {
            const option = document.createElement('option');
            option.value = i;
            option.textContent = `Page ${i}`;
            select.appendChild(option);
        }
        
        selectorContainer.classList.remove('hidden');
        
        // Handle page selection change
        select.addEventListener('change', async (e) => {
            const value = e.target.value;
            if (value === 'all') {
                fileObj.convertAllPages = true;
                convertAllCheckbox.checked = true;
            } else {
                fileObj.convertAllPages = false;
                fileObj.selectedPage = parseInt(value);
                convertAllCheckbox.checked = false;
                
                // Update thumbnail to show selected page
                try {
                    const { canvas } = await PDFProcessor.renderPageToCanvas(
                        fileObj.file, 
                        fileObj.selectedPage, 
                        0.3
                    );
                    fileObj.thumbnail = canvas.toDataURL('image/jpeg', 0.8);
                    card.querySelector('.thumbnail').src = fileObj.thumbnail;
                } catch (err) {
                    console.error('Error changing page:', err);
                }
            }
        });
        
        // Handle "convert all pages" checkbox
        convertAllCheckbox.addEventListener('change', (e) => {
            fileObj.convertAllPages = e.target.checked;
            select.value = e.target.checked ? 'all' : fileObj.selectedPage;
        });
    }

    /**
     * Create a file card in the grid
     * Renders the template with file data
     */
    function createFileCard(fileObj) {
        // Clone the template content
        const template = fileCardTemplate.content.cloneNode(true);
        const card = template.querySelector('.file-card');
        card.dataset.fileId = fileObj.id;  // Store file ID for lookup
        
        // Set filename display
        card.querySelector('.file-name').textContent = fileObj.name;
        
        // Set original file info
        const originalInfo = card.querySelector('.original-info');
        const isPdf = PDFProcessor.isPDF(fileObj.file);
        originalInfo.textContent = `${formatFileSize(fileObj.originalSize)} • ${isPdf ? 'PDF' : 'Image'}`;
        
        // Attach event listeners to buttons
        const convertBtn = card.querySelector('.convert-btn');
        convertBtn.addEventListener('click', () => processFile(fileObj));
        
        const downloadBtn = card.querySelector('.download-btn');
        downloadBtn.addEventListener('click', () => downloadFile(fileObj));
        
        const removeBtn = card.querySelector('.remove-btn');
        removeBtn.addEventListener('click', () => removeFile(fileObj));
        
        // Add card to the grid
        elements.filesGrid.appendChild(card);
    }

    /**
     * ============================================
     * FILE PROCESSING
     * ============================================
     */

    /**
     * Process a file (convert/compress)
     * Main entry point for file conversion
     */
    async function processFile(fileObj) {
        const card = document.querySelector(`[data-file-id="${fileObj.id}"]`);
        const convertBtn = card.querySelector('.convert-btn');
        const statusEl = card.querySelector('.file-status');
        const convertedInfo = card.querySelector('.converted-info');
        
        // Disable button during processing
        convertBtn.disabled = true;
        convertBtn.textContent = 'Processing...';
        
        // Show progress bar
        elements.progressSection.classList.remove('hidden');
        elements.progressBar.style.width = '0%';
        
        // Determine what to process
        const pageSpec = fileObj.convertAllPages ? 'all' : fileObj.selectedPage;
        const pageText = fileObj.convertAllPages ? `all ${fileObj.pageCount} pages` : `page ${fileObj.selectedPage}`;
        const isPdf = PDFProcessor.isPDF(fileObj.file);
        
        elements.progressText.textContent = `Converting ${fileObj.name}${isPdf ? ` (${pageText})` : ''}...`;
        
        try {
            // Calculate max dimensions based on target size
            // Smaller target = smaller dimensions to help reach the size
            let maxWidth, maxHeight;
            if (state.targetSizeKB <= 50) {
                maxWidth = 400;
                maxHeight = 533;
            } else if (state.targetSizeKB <= 100) {
                maxWidth = 600;
                maxHeight = 800;
            } else if (state.targetSizeKB <= 200) {
                maxWidth = 800;
                maxHeight = 1067;
            } else if (state.targetSizeKB <= 500) {
                maxWidth = 1000;
                maxHeight = 1333;
            } else {
                maxWidth = 1200;
                maxHeight = 1600;
            }
            
            // Create preset object with processing parameters
            const preset = {
                maxSizeKB: state.targetSizeKB,
                format: state.outputFormat,
                widthPx: maxWidth,
                heightPx: maxHeight,
                label: 'Custom'
            };
            
            let results;

            // Choose processing method based on file type and output format
            if (isPdf && state.outputFormat === 'application/pdf') {
                // Compress PDF while keeping it as PDF
                const result = await PDFProcessor.compressFullPDF(
                    fileObj.file,
                    state.targetSizeKB,
                    (progress) => {
                        elements.progressBar.style.width = `${progress}%`;
                    }
                );
                results = [result];
            } else if (isPdf) {
                // Convert PDF pages to images
                results = await PDFProcessor.extractAndProcessPages(
                    fileObj.file,
                    pageSpec,
                    preset,
                    (progress) => {
                        elements.progressBar.style.width = `${progress}%`;
                    }
                );
            } else if (state.outputFormat === 'application/pdf') {
                // Convert image to PDF
                const result = await PDFProcessor.convertImageToPDF(
                    fileObj.file,
                    state.targetSizeKB,
                    (progress) => {
                        elements.progressBar.style.width = `${progress}%`;
                    }
                );
                results = [result];
            } else {
                // Compress/convert image
                const result = await ImageProcessor.processImage(
                    fileObj.file,
                    preset,
                    (progress) => {
                        elements.progressBar.style.width = `${progress}%`;
                    }
                );
                results = [result];
            }
            
            // Store results
            fileObj.results = results;
            fileObj.processed = true;
            
            // Update UI with results
            const totalPages = results.length;
            const totalSize = results.reduce((sum, r) => sum + r.newSize, 0);
            const hasWarning = results.some(r => r.warning);
            
            if (totalPages > 1) {
                convertedInfo.textContent = `${totalPages} pages • ${formatFileSize(totalSize)} total`;
            } else {
                const dims = `${results[0].newDimensions.width}×${results[0].newDimensions.height} px`;
                convertedInfo.textContent = `${formatFileSize(results[0].newSize)} • ${dims}`;
            }
            convertedInfo.classList.add('success');
            
            // Show status message
            statusEl.classList.add('visible');
            if (hasWarning) {
                statusEl.classList.add('warning');
                statusEl.textContent = totalPages > 1 
                    ? '⚠ Some pages could not reach target size.'
                    : '⚠ Could not reach target size. Output may be too large.';
            } else {
                statusEl.classList.add('success');
                statusEl.textContent = totalPages > 1
                    ? `✓ Successfully converted ${totalPages} pages`
                    : '✓ Successfully converted';
            }
            
            // Show download button
            card.querySelector('.download-btn').classList.remove('hidden');
            updateDownloadAllButton();
            
        } catch (err) {
            console.error('Processing error:', err);
            statusEl.classList.add('visible', 'error');
            statusEl.textContent = `✗ Error: ${err.message}`;
        } finally {
            // Hide progress and reset button
            elements.progressSection.classList.add('hidden');
            convertBtn.disabled = false;
            convertBtn.textContent = 'Convert';
        }
    }

    /**
     * ============================================
     * DOWNLOAD FUNCTIONS
     * ============================================
     */

    /**
     * Download a single file (or all pages as ZIP for multi-page PDFs)
     */
    async function downloadFile(fileObj) {
        if (!fileObj.processed || fileObj.results.length === 0) return;
        
        const results = fileObj.results;
        
        // Multiple pages = download as ZIP
        if (results.length > 1) {
            elements.progressSection.classList.remove('hidden');
            elements.progressBar.style.width = '0%';
            elements.progressText.textContent = 'Creating ZIP...';
            
            try {
                const zip = new JSZip();
                
                results.forEach((result, index) => {
                    const blob = result.blob;
                    const ext = blob.type === 'application/pdf' ? 'pdf' : 
                                blob.type === 'image/png' ? 'png' : 'jpg';
                    const baseName = fileObj.name.replace(/\.[^/.]+$/, '');
                    const filename = `${baseName}_page${index + 1}.${ext}`;
                    zip.file(filename, blob);
                    
                    elements.progressBar.style.width = `${Math.round(((index + 1) / results.length) * 100)}%`;
                });
                
                const content = await zip.generateAsync({ 
                    type: 'blob',
                    compression: 'DEFLATE',
                    compressionOptions: { level: 6 }
                });
                
                const url = URL.createObjectURL(content);
                const a = document.createElement('a');
                a.href = url;
                a.download = `${fileObj.name.replace(/\.[^/.]+$/, '')}_all_pages.zip`;
                a.click();
                URL.revokeObjectURL(url);
                
                elements.progressSection.classList.add('hidden');
            } catch (err) {
                console.error('ZIP error:', err);
                showError('Failed to create ZIP: ' + err.message);
                elements.progressSection.classList.add('hidden');
            }
        } else {
            // Single file download
            const blob = results[0].blob;
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            
            const ext = blob.type === 'application/pdf' ? 'pdf' : 
                        blob.type === 'image/png' ? 'png' : 'jpg';
            const baseName = fileObj.name.replace(/\.[^/.]+$/, '');
            a.download = `${baseName}.${ext}`;
            
            a.href = url;
            a.click();
            
            URL.revokeObjectURL(url);
        }
    }

    /**
     * Remove a file from the application
     */
    function removeFile(fileObj) {
        const index = state.files.findIndex(f => f.id === fileObj.id);
        if (index > -1) {
            state.files.splice(index, 1);
        }
        
        const card = document.querySelector(`[data-file-id="${fileObj.id}"]`);
        if (card) {
            card.remove();
        }
        
        // Hide files section if no files left
        if (state.files.length === 0) {
            elements.filesSection.classList.add('hidden');
        }
        
        updateDownloadAllButton();
    }

    /**
     * Update download all button visibility
     */
    function updateDownloadAllButton() {
        const processedFiles = state.files.filter(f => f.processed && f.results.length > 0);
        if (processedFiles.length > 0) {
            elements.downloadAllBtn.classList.remove('hidden');
        } else {
            elements.downloadAllBtn.classList.add('hidden');
        }
    }

    /**
     * Download all processed files as a single ZIP archive
     */
    async function downloadAll() {
        const processedFiles = state.files.filter(f => f.processed && f.results.length > 0);
        if (processedFiles.length === 0) return;
        
        elements.progressSection.classList.remove('hidden');
        elements.progressBar.style.width = '0%';
        elements.progressText.textContent = 'Creating ZIP archive...';
        
        try {
            const zip = new JSZip();
            let fileIndex = 0;
            const totalFiles = processedFiles.reduce((sum, f) => sum + f.results.length, 0);
            
            processedFiles.forEach(fileObj => {
                fileObj.results.forEach((result, resultIndex) => {
                    const blob = result.blob;
                    const ext = blob.type === 'application/pdf' ? 'pdf' : 'jpg';
                    const baseName = fileObj.name.replace(/\.[^/.]+$/, '');
                    
                    let filename;
                    if (fileObj.results.length > 1) {
                        filename = `${baseName}_page${resultIndex + 1}.${ext}`;
                    } else {
                        filename = `${baseName}.${ext}`;
                    }
                    
                    zip.file(filename, blob);
                    
                    fileIndex++;
                    elements.progressBar.style.width = `${Math.round((fileIndex / totalFiles) * 80)}%`;
                });
            });
            
            elements.progressText.textContent = 'Compressing...';
            
            const content = await zip.generateAsync({ 
                type: 'blob',
                compression: 'DEFLATE',
                compressionOptions: { level: 6 }
            }, (metadata) => {
                elements.progressBar.style.width = `${80 + Math.round(metadata.percent * 0.2)}%`;
            });
            
            const url = URL.createObjectURL(content);
            const a = document.createElement('a');
            a.href = url;
            a.download = `converted_files_${Date.now()}.zip`;
            a.click();
            URL.revokeObjectURL(url);
            
            elements.progressText.textContent = 'Download started!';
            setTimeout(() => {
                elements.progressSection.classList.add('hidden');
            }, 2000);
            
        } catch (err) {
            console.error('ZIP creation error:', err);
            showError('Failed to create ZIP archive: ' + err.message);
            elements.progressSection.classList.add('hidden');
        }
    }

    /**
     * ============================================
     * UTILITY FUNCTIONS
     * ============================================
     */

    /**
     * Show error notification to user
     */
    function showError(message) {
        const notification = document.createElement('div');
        notification.style.cssText = `
            position: fixed;
            top: 20px;
            right: 20px;
            background: var(--error-color);
            color: white;
            padding: 12px 20px;
            border-radius: 8px;
            box-shadow: 0 4px 12px rgba(0,0,0,0.15);
            z-index: 1000;
            font-size: 0.9rem;
        `;
        notification.textContent = message;
        document.body.appendChild(notification);
        
        setTimeout(() => {
            notification.style.opacity = '0';
            notification.style.transition = 'opacity 0.3s';
            setTimeout(() => notification.remove(), 300);
        }, 4000);
    }

    /**
     * Format file size for human-readable display
     */
    function formatFileSize(bytes) {
        return ImageProcessor.formatFileSize(bytes);
    }

    // Initialize on DOM ready
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }
})();
