/**
 * ============================================
 * EXAM PRESETS CONFIGURATION
 * ============================================
 * 
 * Contains preset profiles for Indian government exam form requirements.
 * Each preset defines the exact specifications for photos and signatures
 * required by different exam authorities.
 * 
 * Note: This file is kept for reference but the current app uses
 * a simpler approach with just target size and format selection.
 * 
 * Preset Structure:
 * - maxSizeKB: Maximum file size in kilobytes
 * - format: MIME type for output format (image/jpeg, image/png)
 * - widthPx: Target width in pixels
 * - heightPx: Target height in pixels
 * - label: Human-readable description
 */

const EXAM_PRESETS = {
    /**
     * UPSC (Union Public Service Commission)
     * Used for: Civil Services Exam, IAS, IPS, IFS, etc.
     */
    upsc: {
        label: 'UPSC',
        photo: {
            maxSizeKB: 300,
            format: 'image/jpeg',
            widthPx: 354,      // 3.5cm at ~300 DPI
            heightPx: 450,     // 4.5cm at ~300 DPI
            label: 'Photo: 300KB max, JPEG, 3.5×4.5cm'
        },
        signature: {
            maxSizeKB: 300,
            format: 'image/jpeg',
            widthPx: 354,
            heightPx: 177,
            label: 'Signature: 300KB max, JPEG'
        }
    },
    
    /**
     * SSC (Staff Selection Commission)
     * Used for: CGL, CHSL, MTS, etc.
     */
    ssc: {
        label: 'SSC',
        photo: {
            maxSizeKB: 50,
            format: 'image/jpeg',
            widthPx: 354,
            heightPx: 450,
            label: 'Photo: 50KB max, JPEG, 3.5×4.5cm'
        },
        signature: {
            maxSizeKB: 20,
            format: 'image/jpeg',
            widthPx: 354,
            heightPx: 177,
            label: 'Signature: 20KB max, JPEG'
        }
    },
    
    /**
     * IBPS / Bank PO
     * Used for: IBPS PO, Clerk, SBI, Bank exams
     */
    ibps: {
        label: 'IBPS / Bank PO',
        photo: {
            maxSizeKB: 50,
            format: 'image/jpeg',
            widthPx: 200,
            heightPx: 240,
            label: 'Photo: 50KB max, JPEG'
        },
        signature: {
            maxSizeKB: 20,
            format: 'image/jpeg',
            widthPx: 200,
            heightPx: 100,
            label: 'Signature: 20KB max, JPEG'
        }
    },
    
    /**
     * NEET (National Eligibility cum Entrance Test)
     * Used for: Medical entrance exams
     */
    neet: {
        label: 'NEET',
        photo: {
            maxSizeKB: 200,
            format: 'image/jpeg',
            widthPx: 354,
            heightPx: 450,
            label: 'Photo: 200KB max, JPEG, 3.5×4.5cm'
        },
        signature: {
            maxSizeKB: 300,
            format: 'image/jpeg',
            widthPx: 354,
            heightPx: 177,
            label: 'Signature: 300KB max, JPEG'
        }
    },
    
    /**
     * JEE (Joint Entrance Examination)
     * Used for: Engineering entrance exams (JEE Main, Advanced)
     */
    jee: {
        label: 'JEE',
        photo: {
            maxSizeKB: 100,
            format: 'image/jpeg',
            widthPx: 354,
            heightPx: 450,
            label: 'Photo: 100KB max, JPEG'
        },
        signature: {
            maxSizeKB: 100,
            format: 'image/jpeg',
            widthPx: 354,
            heightPx: 177,
            label: 'Signature: 100KB max, JPEG'
        }
    },
    
    /**
     * CUET (Common University Entrance Test)
     * Used for: Central university admissions
     */
    cuet: {
        label: 'CUET',
        photo: {
            maxSizeKB: 300,
            format: 'image/jpeg',
            widthPx: 354,
            heightPx: 450,
            label: 'Photo: 300KB max, JPEG'
        },
        signature: {
            maxSizeKB: 300,
            format: 'image/jpeg',
            widthPx: 354,
            heightPx: 177,
            label: 'Signature: 300KB max, JPEG'
        }
    },
    
    /**
     * Custom Preset
     * Used when user manually enters size and dimensions
     */
    custom: {
        label: 'Custom',
        photo: {
            maxSizeKB: 100,
            format: 'image/jpeg',
            widthPx: 354,
            heightPx: 450,
            label: 'Custom settings'
        },
        signature: {
            maxSizeKB: 100,
            format: 'image/jpeg',
            widthPx: 354,
            heightPx: 177,
            label: 'Custom settings'
        }
    }
};

/**
 * Get preset configuration for a specific exam and document type
 * 
 * @param {string} examKey - The exam preset key (e.g., 'upsc', 'ssc', 'custom')
 * @param {string} docType - Document type ('photo', 'signature', 'idproof', 'other')
 * @returns {Object} Preset configuration object with maxSizeKB, format, widthPx, heightPx
 */
function getPreset(examKey, docType = 'photo') {
    const exam = EXAM_PRESETS[examKey];
    if (!exam) {
        console.error(`Preset not found: ${examKey}`);
        return EXAM_PRESETS.custom.photo;
    }
    
    // For idproof and other, use photo settings as default
    const type = docType === 'signature' ? 'signature' : 'photo';
    return exam[type];
}

/**
 * Get the display info string for a preset
 * 
 * @param {string} examKey - The exam preset key
 * @param {string} docType - Document type
 * @returns {string} Display info string (e.g., "Photo: 50KB max, JPEG")
 */
function getPresetInfo(examKey, docType = 'photo') {
    const preset = getPreset(examKey, docType);
    return preset.label;
}

/**
 * Get all available exam keys
 * 
 * @returns {string[]} Array of exam keys (e.g., ['upsc', 'ssc', 'ibps', ...])
 */
function getExamKeys() {
    return Object.keys(EXAM_PRESETS);
}

/**
 * Get all exam labels for dropdown menu
 * 
 * @returns {Array<{key: string, label: string}>} Array of exam options
 */
function getExamOptions() {
    return getExamKeys().map(key => ({
        key,
        label: EXAM_PRESETS[key].label
    }));
}

// Export for potential module usage (Node.js compatibility)
if (typeof module !== 'undefined' && module.exports) {
    module.exports = { EXAM_PRESETS, getPreset, getPresetInfo, getExamKeys, getExamOptions };
}
