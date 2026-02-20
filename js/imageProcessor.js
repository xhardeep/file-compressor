/**
 * ============================================
 * IMAGE PROCESSOR MODULE
 * ============================================
 * 
 * Handles all image processing operations:
 * - Loading images from files
 * - Resizing with aspect ratio preservation
 * - Smart dimension calculation based on target file size
 * - Iterative compression to hit target size
 * - Format conversion (JPEG, PNG, etc.)
 * 
 * Key Algorithm: Smart Dimension Calculation
 * - Creates a test thumbnail to estimate compression ratio
 * - Calculates optimal dimensions using: targetPixels = (originalPixels × targetSize) / estimatedSize
 * - Applies quality adjustment on top of resized image
 * - Falls back to further dimension reduction if needed
 */

const ImageProcessor = (function() {
    'use strict';

    /**
     * Load an image from File or Blob
     * Creates an HTMLImageElement that can be drawn to canvas
     * 
     * @param {File|Blob} file - The image file to load
     * @returns {Promise<HTMLImageElement>} Resolves with loaded image element
     */
    function loadImage(file) {
        return new Promise((resolve, reject) => {
            const img = new Image();
            img.onload = () => resolve(img);
            img.onerror = reject;
            img.src = URL.createObjectURL(file);
        });
    }

    /**
     * ============================================
     * SMART DIMENSION CALCULATION
     * ============================================
     * 
     * Calculates optimal image dimensions to achieve target file size
     * Based on the principle that file size ≈ pixel count × quality
     */

    /**
     * Calculate optimal dimensions to achieve target file size
     * 
     * Formula:
     *   targetPixels = (originalPixels × targetSize) / (currentSize × buffer)
     *   newWidth = √(targetPixels / aspectRatio)
     *   newHeight = newWidth × aspectRatio
     * 
     * @param {number} originalWidth - Original image width in pixels
     * @param {number} originalHeight - Original image height in pixels
     * @param {number} currentSize - Current/estimated file size in bytes
     * @param {number} targetSize - Target file size in bytes
     * @param {number} maxWidth - Maximum allowed width (constraint)
     * @param {number} maxHeight - Maximum allowed height (constraint)
     * @returns {{width: number, height: number}} Optimal dimensions
     */
    function calculateOptimalDimensions(originalWidth, originalHeight, currentSize, targetSize, maxWidth, maxHeight) {
        const originalPixels = originalWidth * originalHeight;
        
        // Estimate target pixels needed
        // File size is roughly proportional to pixel count
        // Add 20% buffer for quality adjustment room
        const targetPixels = Math.floor((originalPixels * targetSize) / (currentSize * 1.2));
        
        // Maintain original aspect ratio
        const aspectRatio = originalWidth / originalHeight;
        
        // Calculate dimensions from target pixels
        // Since pixels = width × height and width = height × aspectRatio
        // We get: height = √(pixels / aspectRatio)
        let newHeight = Math.sqrt(targetPixels / aspectRatio);
        let newWidth = newHeight * aspectRatio;
        
        // Apply maximum dimension constraints
        if (newWidth > maxWidth) {
            newWidth = maxWidth;
            newHeight = maxWidth / aspectRatio;
        }
        if (newHeight > maxHeight) {
            newHeight = maxHeight;
            newWidth = maxHeight * aspectRatio;
        }
        
        // Ensure minimum dimensions (don't make image too small)
        const minDimension = 200;
        if (newWidth < minDimension || newHeight < minDimension) {
            const scale = Math.max(minDimension / newWidth, minDimension / newHeight);
            newWidth = Math.min(newWidth * scale, maxWidth);
            newHeight = Math.min(newHeight * scale, maxHeight);
        }
        
        return {
            width: Math.round(newWidth),
            height: Math.round(newHeight)
        };
    }

    /**
     * ============================================
     * IMAGE RESIZING
     * ============================================
     */

    /**
     * Resize image to fit within target dimensions
     * Maintains aspect ratio - no stretching or distortion
     * Image will fill the canvas completely (no white bars)
     * 
     * @param {HTMLImageElement} img - Source image element
     * @param {number} targetWidth - Maximum width in pixels
     * @param {number} targetHeight - Maximum height in pixels
     * @returns {HTMLCanvasElement} Canvas with resized image
     */
    function resizeImage(img, targetWidth, targetHeight) {
        const canvas = document.createElement('canvas');
        
        // Calculate aspect ratio preserving dimensions
        const imgRatio = img.width / img.height;
        const targetRatio = targetWidth / targetHeight;
        
        let finalWidth, finalHeight;
        
        if (imgRatio > targetRatio) {
            // Image is wider - fit to width
            finalWidth = targetWidth;
            finalHeight = targetWidth / imgRatio;
        } else {
            // Image is taller - fit to height
            finalHeight = targetHeight;
            finalWidth = targetHeight * imgRatio;
        }
        
        // Don't upscale if image is already smaller than target
        if (img.width <= targetWidth && img.height <= targetHeight) {
            finalWidth = img.width;
            finalHeight = img.height;
        }
        
        canvas.width = finalWidth;
        canvas.height = finalHeight;
        
        const ctx = canvas.getContext('2d');
        
        // Enable high quality scaling
        ctx.imageSmoothingEnabled = true;
        ctx.imageSmoothingQuality = 'high';
        
        // Draw image filling the entire canvas (no white bars)
        ctx.drawImage(img, 0, 0, finalWidth, finalHeight);
        
        return canvas;
    }

    /**
     * Resize image to exact dimensions
     * May add letterboxing (white bars) to maintain aspect ratio
     * 
     * @param {HTMLImageElement} img - Source image element
     * @param {number} width - Target width in pixels
     * @param {number} height - Target height in pixels
     * @returns {HTMLCanvasElement} Canvas with resized image
     */
    function resizeToExact(img, width, height) {
        const canvas = document.createElement('canvas');
        canvas.width = width;
        canvas.height = height;
        
        const ctx = canvas.getContext('2d');
        ctx.imageSmoothingEnabled = true;
        ctx.imageSmoothingQuality = 'high';
        
        // Calculate aspect ratio preserving dimensions
        const imgRatio = img.width / img.height;
        const targetRatio = width / height;
        
        let drawWidth, drawHeight, offsetX, offsetY;
        
        if (imgRatio > targetRatio) {
            // Image is wider - fit to width, center vertically
            drawWidth = width;
            drawHeight = width / imgRatio;
            offsetX = 0;
            offsetY = (height - drawHeight) / 2;
        } else {
            // Image is taller - fit to height, center horizontally
            drawHeight = height;
            drawWidth = height * imgRatio;
            offsetX = (width - drawWidth) / 2;
            offsetY = 0;
        }
        
        // White background for any letterboxing areas
        ctx.fillStyle = '#ffffff';
        ctx.fillRect(0, 0, width, height);
        ctx.drawImage(img, offsetX, offsetY, drawWidth, drawHeight);
        
        return canvas;
    }

    /**
     * ============================================
     * IMAGE COMPRESSION
     * ============================================
     * 
     * Iterative compression algorithm:
     * 1. Compress at starting quality (92%)
     * 2. Check if result is in target range (85-100% of target)
     * 3. If too large, reduce quality and retry
     * 4. If too small, increase quality and retry
     * 5. Track best result under target
     */

    /**
     * Compress image to fit within target size
     * Uses iterative quality adjustment with setTimeout to avoid UI freeze
     * 
     * Target range: 85-100% of target size
     * Quality range: 0.3 to 0.98
     * 
     * @param {HTMLCanvasElement} canvas - Source canvas to compress
     * @param {string} format - Output format MIME type (e.g., 'image/jpeg')
     * @param {number} targetSizeKB - Target maximum size in kilobytes
     * @param {function(number): void} onProgress - Progress callback (0-100)
     * @returns {Promise<{blob: Blob, size: number, quality: number, warning: boolean}>}
     */
    function compressImage(canvas, format, targetSizeKB, onProgress) {
        return new Promise((resolve, reject) => {
            const targetSizeBytes = targetSizeKB * 1024;
            const minTargetBytes = targetSizeBytes * 0.85;  // Aim for 85-100% of target
            const minQuality = 0.3;  // Allow lower quality for difficult images
            const maxIterations = 25;
            const startQuality = 0.92;

            let quality = startQuality;
            let iteration = 0;
            let bestBlob = null;
            let bestSize = Infinity;
            let bestQuality = startQuality;

            /**
             * Recursive compression function
             * Calls itself with adjusted quality until target is reached
             */
            function tryCompress() {
                if (iteration >= maxIterations) {
                    // Max iterations reached, return best result
                    const result = bestBlob 
                        ? { blob: bestBlob, size: bestSize, quality: bestQuality, warning: bestSize > targetSizeBytes }
                        : { blob: null, size: 0, quality: 0, warning: true };
                    resolve(result);
                    return;
                }

                // Compress canvas to blob at current quality
                canvas.toBlob((blob) => {
                    if (onProgress) {
                        onProgress(Math.min(100, Math.round((iteration / maxIterations) * 100)));
                    }

                    // Check if we're in the perfect target range
                    if (blob.size <= targetSizeBytes && blob.size >= minTargetBytes) {
                        bestBlob = blob;
                        bestSize = blob.size;
                        bestQuality = quality;
                        resolve({
                            blob,
                            size: blob.size,
                            quality,
                            warning: false
                        });
                        return;
                    }
                    
                    // Track best result that's under target
                    if (blob.size <= targetSizeBytes && blob.size < bestSize) {
                        bestBlob = blob;
                        bestSize = blob.size;
                        bestQuality = quality;
                    }

                    // If way under target at first iteration, image is naturally small
                    if (iteration === 0 && blob.size < minTargetBytes * 0.5) {
                        resolve({
                            blob,
                            size: blob.size,
                            quality,
                            warning: false
                        });
                        return;
                    }

                    // If over target, reduce quality more aggressively
                    if (blob.size > targetSizeBytes) {
                        if (quality <= minQuality) {
                            // Can't reduce further, return best we have
                            resolve({
                                blob: bestBlob || blob,
                                size: bestSize || blob.size,
                                quality: bestQuality || quality,
                                warning: true
                            });
                            return;
                        }
                        // Bigger reduction when far from target
                        const reduction = blob.size > targetSizeBytes * 2 ? 0.15 : 0.08;
                        quality = Math.max(minQuality, quality - reduction);
                        iteration++;
                        setTimeout(tryCompress, 0);  // Yield to main thread
                        return;
                    }

                    // Under target but below minTarget - try increasing quality
                    if (blob.size < minTargetBytes && quality < 0.98) {
                        quality = Math.min(0.98, quality + 0.05);
                        iteration++;
                        setTimeout(tryCompress, 0);
                        return;
                    }

                    // We're in a good range
                    resolve({
                        blob,
                        size: blob.size,
                        quality,
                        warning: blob.size > targetSizeBytes
                    });
                }, format, quality);
            }

            tryCompress();
        });
    }

    /**
     * ============================================
     * MAIN PROCESSING FUNCTION
     * ============================================
     * 
     * Complete image processing pipeline:
     * 1. Check if already optimal (skip processing)
     * 2. Create test thumbnail to estimate compression
     * 3. Calculate optimal dimensions using formula
     * 4. Resize to calculated dimensions
     * 5. Compress with quality adjustment
     * 6. Fallback: further reduce dimensions if still over target
     */

    /**
     * Process an image file according to preset requirements
     * Uses smart dimension calculation based on target file size
     * 
     * @param {File} file - Source image file
     * @param {Object} preset - Preset configuration object
     * @param {number} preset.maxSizeKB - Target size in KB
     * @param {string} preset.format - Output format MIME type
     * @param {number} preset.widthPx - Maximum width in pixels
     * @param {number} preset.heightPx - Maximum height in pixels
     * @param {function(number): void} onProgress - Progress callback (0-100)
     * @returns {Promise<{
     *   blob: Blob,
     *   originalSize: number,
     *   newSize: number,
     *   originalDimensions: {width: number, height: number},
     *   newDimensions: {width: number, height: number},
     *   warning: boolean,
     *   alreadyOptimal: boolean
     * }>}
     */
    async function processImage(file, preset, onProgress) {
        if (onProgress) onProgress(10);

        const originalSize = file.size;
        const img = await loadImage(file);
        const originalDimensions = { width: img.width, height: img.height };
        const targetSizeBytes = preset.maxSizeKB * 1024;

        if (onProgress) onProgress(20);

        // Check if already within size limit
        if (originalSize <= targetSizeBytes) {
            // Already optimal, just convert format if needed
            if (file.type === preset.format) {
                return {
                    blob: file,
                    originalSize,
                    newSize: originalSize,
                    originalDimensions,
                    newDimensions: originalDimensions,
                    warning: false,
                    alreadyOptimal: true
                };
            }
            // Just convert format without resizing
            const canvas = resizeToExact(img, img.width, img.height);
            const result = await compressImage(canvas, preset.format, preset.maxSizeKB, onProgress);
            return {
                blob: result.blob,
                originalSize,
                newSize: result.size,
                originalDimensions,
                newDimensions: { width: img.width, height: img.height },
                warning: result.warning,
                alreadyOptimal: !result.warning
            };
        }

        // ============================================
        // SMART DIMENSION CALCULATION
        // ============================================
        
        // Step 1: Create a test thumbnail to estimate compression ratio
        const testScale = 0.2;
        const testWidth = Math.max(100, Math.floor(img.width * testScale));
        const testHeight = Math.max(100, Math.floor(img.height * testScale));
        
        const testCanvas = document.createElement('canvas');
        testCanvas.width = testWidth;
        testCanvas.height = testHeight;
        const testCtx = testCanvas.getContext('2d');
        testCtx.imageSmoothingEnabled = true;
        testCtx.imageSmoothingQuality = 'high';
        testCtx.drawImage(img, 0, 0, testWidth, testHeight);
        
        // Compress test image at 80% quality to estimate
        const testBlob = await new Promise(resolve => 
            testCanvas.toBlob(resolve, preset.format, 0.8)
        );
        
        if (onProgress) onProgress(35);
        
        // Step 2: Calculate optimal dimensions using the formula
        const testPixels = testWidth * testHeight;
        const estimatedFullSize = testBlob.size / (testScale * testScale);
        
        const optimalDims = calculateOptimalDimensions(
            img.width,
            img.height,
            estimatedFullSize,
            targetSizeBytes,
            preset.widthPx,
            preset.heightPx
        );

        if (onProgress) onProgress(45);

        // Step 3: Resize to calculated optimal dimensions
        const canvas = resizeToExact(img, optimalDims.width, optimalDims.height);

        if (onProgress) onProgress(55);

        // Step 4: Compress with quality adjustment
        const result = await compressImage(canvas, preset.format, preset.maxSizeKB, onProgress);

        if (onProgress) onProgress(100);

        // Step 5: If still over target, further reduce dimensions and retry
        if (result.size > targetSizeBytes && result.size > originalSize * 0.5) {
            // Calculate size ratio and corresponding dimension reduction
            // Dimensions scale with square root of size (since size ∝ pixels = w × h)
            const sizeRatio = targetSizeBytes / result.size;
            const dimRatio = Math.sqrt(sizeRatio);
            
            const retryWidth = Math.max(100, Math.floor(optimalDims.width * dimRatio * 0.9));
            const retryHeight = Math.max(100, Math.floor(optimalDims.height * dimRatio * 0.9));
            
            const retryCanvas = resizeToExact(img, retryWidth, retryHeight);
            const retryResult = await compressImage(retryCanvas, preset.format, preset.maxSizeKB, () => {});
            
            if (retryResult.size < result.size) {
                return {
                    blob: retryResult.blob,
                    originalSize,
                    newSize: retryResult.size,
                    originalDimensions,
                    newDimensions: { width: retryWidth, height: retryHeight },
                    warning: retryResult.size > targetSizeBytes,
                    alreadyOptimal: false
                };
            }
        }

        return {
            blob: result.blob,
            originalSize,
            newSize: result.size,
            originalDimensions,
            newDimensions: { width: optimalDims.width, height: optimalDims.height },
            warning: result.size > targetSizeBytes,
            alreadyOptimal: false
        };
    }

    /**
     * ============================================
     * UTILITY FUNCTIONS
     * ============================================
     */

    /**
     * Get image dimensions from file without loading full image
     */
    function getImageDimensions(file) {
        return loadImage(file).then(img => ({
            width: img.width,
            height: img.height
        }));
    }

    /**
     * Convert canvas to blob with specified format and quality
     */
    function canvasToBlob(canvas, format = 'image/jpeg', quality = 0.9) {
        return new Promise((resolve) => {
            canvas.toBlob(resolve, format, quality);
        });
    }

    /**
     * Create thumbnail from image file
     * Scales down image while preserving aspect ratio
     * 
     * @param {File} file - Image file
     * @param {number} maxWidth - Maximum thumbnail width
     * @param {number} maxHeight - Maximum thumbnail height
     * @returns {Promise<string>} Data URL of thumbnail
     */
    async function createThumbnail(file, maxWidth = 200, maxHeight = 200) {
        const img = await loadImage(file);

        // Calculate thumbnail dimensions preserving aspect ratio
        let width = img.width;
        let height = img.height;

        if (width > height) {
            // Landscape - fit to width
            if (width > maxWidth) {
                height = (height * maxWidth) / width;
                width = maxWidth;
            }
        } else {
            // Portrait - fit to height
            if (height > maxHeight) {
                width = (width * maxHeight) / height;
                height = maxHeight;
            }
        }

        const canvas = document.createElement('canvas');
        canvas.width = width;
        canvas.height = height;

        const ctx = canvas.getContext('2d');
        ctx.drawImage(img, 0, 0, width, height);

        return canvas.toDataURL('image/jpeg', 0.8);
    }

    /**
     * Format file size for human-readable display
     * Converts bytes to KB or MB as appropriate
     * 
     * @param {number} bytes - Size in bytes
     * @returns {string} Formatted size string (e.g., "1.5 MB")
     */
    function formatFileSize(bytes) {
        if (bytes < 1024) {
            return bytes + ' B';
        } else if (bytes < 1024 * 1024) {
            return (bytes / 1024).toFixed(1) + ' KB';
        } else {
            return (bytes / (1024 * 1024)).toFixed(2) + ' MB';
        }
    }

    // Public API - expose functions for use by other modules
    return {
        loadImage,
        resizeImage,
        resizeToExact,
        compressImage,
        processImage,
        getImageDimensions,
        canvasToBlob,
        createThumbnail,
        formatFileSize,
        calculateOptimalDimensions
    };
})();
