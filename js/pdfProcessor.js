/**
 * ============================================
 * PDF PROCESSOR MODULE
 * ============================================
 * 
 * Handles all PDF processing operations:
 * - Loading PDF documents
 * - Rendering PDF pages to canvas (using PDF.js)
 * - Extracting pages as images
 * - Compressing multi-page PDFs (using pdf-lib)
 * - Smart dimension calculation for PDF pages
 * 
 * Dependencies:
 * - PDF.js: Renders PDF pages to canvas
 * - pdf-lib: Creates and manipulates PDF documents
 */

const PDFProcessor = (function() {
    'use strict';

    // Configure PDF.js worker (required for PDF rendering)
    // Worker runs in background thread to avoid blocking UI
    if (typeof pdfjsLib !== 'undefined') {
        pdfjsLib.GlobalWorkerOptions.workerSrc = 'https://unpkg.com/pdfjs-dist@3.11.174/build/pdf.worker.min.js';
    }

    /**
     * ============================================
     * PDF LOADING
     * ============================================
     */

    /**
     * Load PDF document from File
     * Uses PDF.js to parse the PDF
     * 
     * @param {File} file - PDF file to load
     * @returns {Promise<PDFDocumentProxy>} PDF.js document proxy
     */
    async function loadPDF(file) {
        const arrayBuffer = await file.arrayBuffer();
        return await pdfjsLib.getDocument({ data: arrayBuffer }).promise;
    }

    /**
     * Get number of pages in PDF
     * 
     * @param {File} file - PDF file
     * @returns {Promise<number>} Number of pages
     */
    async function getPageCount(file) {
        const pdf = await loadPDF(file);
        return pdf.numPages;
    }

    /**
     * ============================================
     * PDF RENDERING
     * ============================================
     * 
     * Renders PDF pages to HTML canvas for:
     * - Thumbnail generation
     * - Conversion to image formats
     * - Visual preview
     */

    /**
     * Render a specific page of PDF to canvas
     * Uses PDF.js rendering engine with high quality settings
     * 
     * @param {File} file - PDF file
     * @param {number} pageNum - Page number (1-indexed)
     * @param {number} scale - Rendering scale (1.0 = 72 DPI, 2.0 = 144 DPI, etc.)
     * @returns {Promise<{canvas: HTMLCanvasElement, width: number, height: number}>}
     */
    async function renderPageToCanvas(file, pageNum, scale = 2.0) {
        const pdf = await loadPDF(file);
        const page = await pdf.getPage(pageNum);
        
        // Get viewport (dimensions) for the page at specified scale
        const viewport = page.getViewport({ scale });
        const canvas = document.createElement('canvas');
        const context = canvas.getContext('2d');
        
        canvas.width = viewport.width;
        canvas.height = viewport.height;
        
        // Enable high quality rendering
        context.imageSmoothingEnabled = true;
        context.imageSmoothingQuality = 'high';
        
        // Render page to canvas
        await page.render({
            canvasContext: context,
            viewport: viewport
        }).promise;
        
        return {
            canvas,
            width: Math.floor(viewport.width),
            height: Math.floor(viewport.height)
        };
    }

    /**
     * Render a PDF page to image (JPEG) with specified quality
     * Used for embedding pages in new PDFs or converting to images
     * 
     * @param {File} file - PDF file
     * @param {number} pageNum - Page number (1-indexed)
     * @param {number} quality - JPEG quality (0.0 to 1.0)
     * @returns {Promise<{dataUrl: string, width: number, height: number}>}
     */
    async function renderPageToImage(file, pageNum, quality = 0.85) {
        const { canvas, width, height } = await renderPageToCanvas(file, pageNum, 2.0);

        const dataUrl = await new Promise((resolve) => {
            canvas.toBlob((blob) => {
                const reader = new FileReader();
                reader.onload = () => resolve(reader.result);
                reader.readAsDataURL(blob);
            }, 'image/jpeg', quality);
        });

        return { dataUrl, width, height };
    }

    /**
     * Get all page thumbnails for PDF
     * Used for page selection UI
     * 
     * @param {File} file - PDF file
     * @param {number} maxDimension - Max thumbnail dimension
     * @returns {Promise<Array<{pageNum: number, dataUrl: string, width: number, height: number}>>}
     */
    async function getPageThumbnails(file, maxDimension = 150) {
        const pdf = await loadPDF(file);
        const thumbnails = [];

        for (let i = 1; i <= pdf.numPages; i++) {
            try {
                const page = await pdf.getPage(i);
                const viewport = page.getViewport({ scale: 0.3 });
                const canvas = document.createElement('canvas');
                const context = canvas.getContext('2d');

                canvas.width = viewport.width;
                canvas.height = viewport.height;

                await page.render({
                    canvasContext: context,
                    viewport: viewport
                }).promise;

                thumbnails.push({
                    pageNum: i,
                    dataUrl: canvas.toDataURL('image/jpeg', 0.7),
                    width: Math.floor(viewport.width),
                    height: Math.floor(viewport.height)
                });
            } catch (err) {
                console.error(`Error rendering page ${i}:`, err);
            }
        }

        return thumbnails;
    }

    /**
     * ============================================
     * PDF COMPRESSION
     * ============================================
     * 
     * Compresses multi-page PDFs by:
     * 1. Rendering each page to image at optimized quality
     * 2. Creating new PDF with compressed images
     * 3. Iteratively adjusting quality to hit target size
     */

    /**
     * Compress entire multi-page PDF by re-rendering pages
     * Uses iterative approach to find optimal quality level
     * 
     * @param {File} file - PDF file to compress
     * @param {number} targetSizeKB - Target size in KB
     * @param {function(number): void} onProgress - Progress callback (0-100)
     * @returns {Promise<{
     *   blob: Blob,
     *   originalSize: number,
     *   newSize: number,
     *   pageCount: number,
     *   warning: boolean
     * }>}
     */
    async function compressFullPDF(file, targetSizeKB, onProgress) {
        const pageCount = await getPageCount(file);
        const targetSizeBytes = targetSizeKB * 1024;

        if (onProgress) onProgress(10);

        // Standard A4 dimensions at 72 DPI
        const targetWidth = 595;
        const targetHeight = 842;

        // Iterative compression parameters
        let quality = 0.75;  // Start at medium quality
        let bestBlob = null;
        let bestSize = Infinity;
        const maxAttempts = 10;  // Maximum quality adjustment iterations
        
        for (let attempt = 0; attempt < maxAttempts; attempt++) {
            if (onProgress) onProgress(10 + Math.round((attempt / maxAttempts) * 80));
            
            // Create new PDF document
            const newPdf = await PDFLib.PDFDocument.create();

            // Process each page
            for (let i = 1; i <= pageCount; i++) {
                // Render page to JPEG at current quality
                const { dataUrl } = await renderPageToImage(file, i, quality);
                const jpgImage = await newPdf.embedJpg(dataUrl);

                // Calculate aspect ratio preserving dimensions
                const imgRatio = jpgImage.width / jpgImage.height;
                let drawWidth = targetWidth;
                let drawHeight = targetWidth / imgRatio;

                if (drawHeight > targetHeight) {
                    drawHeight = targetHeight;
                    drawWidth = targetHeight * imgRatio;
                }

                const page = newPdf.addPage([drawWidth, drawHeight]);
                page.drawImage(jpgImage, {
                    x: 0,
                    y: 0,
                    width: drawWidth,
                    height: drawHeight
                });
            }

            // Save PDF with optimization
            const pdfBytes = await newPdf.save({
                useObjectStreams: true,  // Compress object streams
                objectsPerTick: 50
            });

            const blob = new Blob([pdfBytes], { type: 'application/pdf' });
            
            // Track best result under target
            if (blob.size <= targetSizeBytes && blob.size > bestSize) {
                bestBlob = blob;
                bestSize = blob.size;
            } else if (!bestBlob || blob.size < bestSize) {
                bestBlob = blob;
                bestSize = blob.size;
            }
            
            // Check if we're in target range (90-100%)
            if (blob.size <= targetSizeBytes && blob.size >= targetSizeBytes * 0.9) {
                if (onProgress) onProgress(100);
                return {
                    blob,
                    originalSize: file.size,
                    newSize: blob.size,
                    size: blob.size,
                    pageCount,
                    originalDimensions: { width: targetWidth, height: targetHeight },
                    newDimensions: { width: targetWidth, height: targetHeight },
                    warning: false,
                    alreadyOptimal: false,
                    pageNum: 1
                };
            }
            
            // Adjust quality based on result
            if (blob.size > targetSizeBytes) {
                // Over target - reduce quality
                if (quality <= 0.2) break;  // Minimum quality reached
                quality = Math.max(0.2, quality - 0.1);
            } else {
                // Under target - try slightly higher quality
                if (quality < 0.85) {
                    quality = Math.min(0.85, quality + 0.05);
                } else {
                    break;
                }
            }
        }

        if (onProgress) onProgress(100);

        return {
            blob: bestBlob,
            originalSize: file.size,
            newSize: bestSize,
            size: bestSize,
            pageCount,
            originalDimensions: { width: targetWidth, height: targetHeight },
            newDimensions: { width: targetWidth, height: targetHeight },
            warning: bestSize > targetSizeBytes,
            alreadyOptimal: false,
            pageNum: 1
        };
    }

    /**
     * ============================================
     * PDF TO IMAGE CONVERSION
     * ============================================
     * 
     * Extracts PDF pages as images with:
     * - Smart dimension calculation
     * - Iterative quality adjustment
     * - Support for single or all pages
     */

    /**
     * Convert PDF page(s) to image(s) and compress
     * Uses smart dimension calculation similar to image processor
     * 
     * @param {File} file - PDF file
     * @param {number|string} pageSpec - Page number or 'all' for all pages
     * @param {Object} preset - Preset configuration
     * @param {number} preset.maxSizeKB - Target size per page in KB
     * @param {string} preset.format - Output format (image/jpeg, image/png)
     * @param {number} preset.widthPx - Maximum width
     * @param {number} preset.heightPx - Maximum height
     * @param {function(number): void} onProgress - Progress callback
     * @returns {Promise<Array<{
     *   blob: Blob,
     *   originalSize: number,
     *   newSize: number,
     *   originalDimensions: {width: number, height: number},
     *   newDimensions: {width: number, height: number},
     *   warning: boolean,
     *   pageCount: number,
     *   pageNum: number
     * }>>}
     */
    async function extractAndProcessPages(file, pageSpec, preset, onProgress) {
        if (onProgress) onProgress(10);

        const originalSize = file.size;
        const pageCount = await getPageCount(file);

        // Determine which pages to process
        let pagesToProcess = [];
        if (pageSpec === 'all') {
            // Process all pages
            for (let i = 1; i <= pageCount; i++) {
                pagesToProcess.push(i);
            }
        } else {
            // Process single page
            pagesToProcess = [parseInt(pageSpec)];
        }

        const results = [];
        const targetSizeBytes = preset.maxSizeKB * 1024;

        // Use higher render scale for better quality
        const renderScale = Math.max(2.0, preset.widthPx / 400);

        // Process each page
        for (let idx = 0; idx < pagesToProcess.length; idx++) {
            const pageNum = pagesToProcess[idx];

            if (onProgress) {
                const baseProgress = 20;
                const progressPerFile = 70 / pagesToProcess.length;
                onProgress(baseProgress + Math.round(idx * progressPerFile));
            }

            // Render page to canvas with high quality
            const { canvas, width, height } = await renderPageToCanvas(file, pageNum, renderScale);
            const originalDimensions = { width, height };

            // ============================================
            // SMART DIMENSION CALCULATION FOR PDF PAGES
            // ============================================
            
            // Step 1: Create test thumbnail to estimate compression
            const testScale = 0.15;
            const testWidth = Math.max(80, Math.floor(width * testScale));
            const testHeight = Math.max(80, Math.floor(height * testScale));
            
            const testCanvas = document.createElement('canvas');
            testCanvas.width = testWidth;
            testCanvas.height = testHeight;
            const testCtx = testCanvas.getContext('2d');
            testCtx.imageSmoothingEnabled = true;
            testCtx.imageSmoothingQuality = 'high';
            testCtx.drawImage(canvas, 0, 0, testWidth, testHeight);
            
            const testBlob = await new Promise(resolve => 
                testCanvas.toBlob(resolve, preset.format, 0.75)
            );
            
            // Estimate full size at this quality
            const estimatedFullSize = testBlob.size / (testScale * testScale);
            
            // Calculate optimal dimensions using formula
            const originalPixels = width * height;
            const targetPixels = Math.floor((originalPixels * targetSizeBytes) / (estimatedFullSize * 1.15));
            
            const imgRatio = width / height;
            let optimalWidth = Math.sqrt(targetPixels / imgRatio);
            let optimalHeight = optimalWidth / imgRatio;
            
            // Apply max constraints
            if (optimalWidth > preset.widthPx) {
                optimalWidth = preset.widthPx;
                optimalHeight = preset.widthPx / imgRatio;
            }
            if (optimalHeight > preset.heightPx) {
                optimalHeight = preset.heightPx;
                optimalWidth = preset.heightPx * imgRatio;
            }
            
            // Ensure minimum dimensions
            const minDim = 150;
            if (optimalWidth < minDim || optimalHeight < minDim) {
                const scale = Math.max(minDim / optimalWidth, minDim / optimalHeight);
                optimalWidth *= scale;
                optimalHeight *= scale;
            }
            
            optimalWidth = Math.round(optimalWidth);
            optimalHeight = Math.round(optimalHeight);

            // Create resized canvas with optimal dimensions
            const resizedCanvas = document.createElement('canvas');
            resizedCanvas.width = optimalWidth;
            resizedCanvas.height = optimalHeight;

            const ctx = resizedCanvas.getContext('2d');
            ctx.imageSmoothingEnabled = true;
            ctx.imageSmoothingQuality = 'high';
            
            // Draw image filling entire canvas (no white bars)
            ctx.drawImage(canvas, 0, 0, optimalWidth, optimalHeight);

            // ============================================
            // ITERATIVE QUALITY COMPRESSION
            // ============================================
            
            const minTargetBytes = targetSizeBytes * 0.85;
            let quality = 0.92;
            const minQuality = 0.3;
            let iterations = 0;
            const maxIterations = 25;
            let resultBlob = null;
            let bestBlob = null;
            let bestSize = Infinity;
            let bestQuality = quality;

            while (iterations < maxIterations) {
                resultBlob = await new Promise(resolve => {
                    resizedCanvas.toBlob(resolve, preset.format, quality);
                });

                // Check if we're in the perfect range
                if (resultBlob.size <= targetSizeBytes && resultBlob.size >= minTargetBytes) {
                    bestBlob = resultBlob;
                    bestSize = resultBlob.size;
                    bestQuality = quality;
                    break;
                }

                // Track best result under target
                if (resultBlob.size <= targetSizeBytes && resultBlob.size < bestSize) {
                    bestBlob = resultBlob;
                    bestSize = resultBlob.size;
                    bestQuality = quality;
                }

                // If way under target at first iteration, image is naturally small
                if (iterations === 0 && resultBlob.size < minTargetBytes * 0.5) {
                    break;
                }

                // If over target, reduce quality
                if (resultBlob.size > targetSizeBytes) {
                    if (quality <= minQuality) {
                        break;  // Can't reduce further
                    }
                    // Bigger reduction when far from target
                    const reduction = resultBlob.size > targetSizeBytes * 2 ? 0.15 : 0.08;
                    quality = Math.max(minQuality, quality - reduction);
                    iterations++;
                    continue;
                }

                // Under target but under minTarget - try increasing quality
                if (resultBlob.size < minTargetBytes && quality < 0.98) {
                    quality = Math.min(0.98, quality + 0.05);
                    iterations++;
                    continue;
                }

                // Good enough
                break;
            }

            // Use best result
            if (bestBlob) {
                resultBlob = bestBlob;
            }

            // If output format is PDF, wrap the image in a PDF
            if (preset.format === 'application/pdf') {
                const newPdf = await PDFLib.PDFDocument.create();

                // Convert blob to data URL for embedding
                const dataUrl = await new Promise(resolve => {
                    const reader = new FileReader();
                    reader.onload = () => resolve(reader.result);
                    reader.readAsDataURL(resultBlob);
                });

                const jpgImage = await newPdf.embedJpg(dataUrl);
                const page = newPdf.addPage([preset.widthPx, preset.heightPx]);
                page.drawImage(jpgImage, {
                    x: 0,
                    y: 0,
                    width: preset.widthPx,
                    height: preset.heightPx
                });

                const pdfBytes = await newPdf.save({ useObjectStreams: true });
                resultBlob = new Blob([pdfBytes], { type: 'application/pdf' });
            }

            results.push({
                blob: resultBlob,
                originalSize,
                newSize: resultBlob.size,
                originalDimensions,
                newDimensions: { width: optimalWidth, height: optimalHeight },
                warning: resultBlob.size > targetSizeBytes,
                alreadyOptimal: false,
                pageCount,
                pageNum
            });
        }

        if (onProgress) onProgress(100);

        return results;
    }

    /**
     * ============================================
     * UTILITY FUNCTIONS
     * ============================================
     */

    /**
     * Create thumbnail for PDF file (first page)
     * Used for file card preview
     * 
     * @param {File} file - PDF file
     * @param {number} maxDimension - Max thumbnail dimension
     * @returns {Promise<string>} Data URL of thumbnail
     */
    async function createThumbnail(file, maxDimension = 200) {
        const { canvas } = await renderPageToCanvas(file, 1, 0.5);

        let width = canvas.width;
        let height = canvas.height;

        // Scale down while preserving aspect ratio
        if (width > height) {
            if (width > maxDimension) {
                height = (height * maxDimension) / width;
                width = maxDimension;
            }
        } else {
            if (height > maxDimension) {
                width = (width * maxDimension) / height;
                height = maxDimension;
            }
        }

        const thumbCanvas = document.createElement('canvas');
        thumbCanvas.width = width;
        thumbCanvas.height = height;

        const ctx = thumbCanvas.getContext('2d');
        ctx.drawImage(canvas, 0, 0, width, height);

        return thumbCanvas.toDataURL('image/jpeg', 0.8);
    }

    /**
     * Check if a file is a PDF
     * Checks both MIME type and file extension
     * 
     * @param {File} file - File to check
     * @returns {boolean} True if file is PDF
     */
    function isPDF(file) {
        return file.type === 'application/pdf' || file.name.toLowerCase().endsWith('.pdf');
    }

    /**
     * ============================================
     * IMAGE TO PDF CONVERSION
     * ============================================
     * 
     * Converts images (JPEG, PNG) to PDF format
     * Embeds the image in a PDF page
     */

    /**
     * Convert an image file to PDF
     * Creates a new PDF with the image embedded on a page
     * 
     * @param {File} file - Image file (JPEG, PNG)
     * @param {number} targetSizeKB - Target PDF size in KB
     * @param {function(number): void} onProgress - Progress callback
     * @returns {Promise<{
     *   blob: Blob,
     *   originalSize: number,
     *   newSize: number,
     *   pageCount: number,
     *   warning: boolean,
     *   originalDimensions: {width: number, height: number},
     *   newDimensions: {width: number, height: number}
     * }>}
     */
    async function convertImageToPDF(file, targetSizeKB, onProgress) {
        if (onProgress) onProgress(10);

        const originalSize = file.size;
        const targetSizeBytes = targetSizeKB * 1024;

        // Load the image
        const img = await ImageProcessor.loadImage(file);
        const originalDimensions = { width: img.width, height: img.height };

        if (onProgress) onProgress(30);

        // Create canvas to get compressed image
        const canvas = document.createElement('canvas');
        canvas.width = img.width;
        canvas.height = img.height;
        const ctx = canvas.getContext('2d');
        ctx.drawImage(img, 0, 0);

        if (onProgress) onProgress(50);

        // Compress image to target size first
        let quality = 0.92;
        let minQuality = 0.3;
        let iterations = 0;
        let maxIterations = 20;
        let imageBlob = null;

        while (iterations < maxIterations) {
            imageBlob = await new Promise(resolve => {
                canvas.toBlob(resolve, 'image/jpeg', quality);
            });

            if (imageBlob.size <= targetSizeBytes || quality <= minQuality) {
                break;
            }

            quality -= 0.1;
            iterations++;
        }

        if (onProgress) onProgress(70);

        // Create PDF with the compressed image
        const newPdf = await PDFLib.PDFDocument.create();

        // Convert blob to data URL for embedding
        const dataUrl = await new Promise(resolve => {
            const reader = new FileReader();
            reader.onload = () => resolve(reader.result);
            reader.readAsDataURL(imageBlob);
        });

        // Embed image based on format
        let embeddedImage;
        if (file.type === 'image/png') {
            embeddedImage = await newPdf.embedPng(dataUrl);
        } else {
            embeddedImage = await newPdf.embedJpg(dataUrl);
        }

        // Calculate page size to fit image while maintaining aspect ratio
        // Use A4 as base but adjust to fit image
        const imgRatio = embeddedImage.width / embeddedImage.height;
        let pageWidth = 595;  // A4 width at 72 DPI
        let pageHeight = pageWidth / imgRatio;

        // Ensure page isn't too tall
        if (pageHeight > 842) {
            pageHeight = 842;
            pageWidth = pageHeight * imgRatio;
        }

        const page = newPdf.addPage([pageWidth, pageHeight]);
        
        // Draw image to fill the entire page
        page.drawImage(embeddedImage, {
            x: 0,
            y: 0,
            width: pageWidth,
            height: pageHeight
        });

        const pdfBytes = await newPdf.save({ useObjectStreams: true });
        const blob = new Blob([pdfBytes], { type: 'application/pdf' });

        if (onProgress) onProgress(100);

        return {
            blob,
            originalSize,
            newSize: blob.size,
            size: blob.size,
            pageCount: 1,
            originalDimensions,
            newDimensions: { width: Math.round(pageWidth), height: Math.round(pageHeight) },
            warning: blob.size > targetSizeBytes,
            alreadyOptimal: false,
            pageNum: 1
        };
    }

    // Public API - expose functions for use by other modules
    return {
        loadPDF,
        getPageCount,
        renderPageToCanvas,
        renderPageToImage,
        getPageThumbnails,
        compressFullPDF,
        extractAndProcessPages,
        createThumbnail,
        isPDF,
        convertImageToPDF
    };
})();
