/**
 * File Service - Frontend
 * Handles all file operations: upload, download, list, view
 * Separates file management logic from UI components
 */

import axios from 'axios';

const BACKEND_URL = process.env.REACT_APP_BACKEND_URL;
const API = `${BACKEND_URL}/api`;

/**
 * File Service for managing file operations
 */
class FileService {
  constructor(token) {
    this.token = token;
    this.headers = { Authorization: `Bearer ${token}` };
  }

  /**
   * Upload a file
   * @param {File} file - File object from input
   * @returns {Promise<Object>} Upload response with file_id and timings
   */
  async uploadFile(file) {
    try {
      const formData = new FormData();
      formData.append('file', file);

      const response = await axios.post(`${API}/files/upload`, formData, {
        headers: this.headers
      });

      return {
        success: true,
        data: response.data,
        message: 'File uploaded and encrypted'
      };
    } catch (error) {
      return {
        success: false,
        error: error.response?.data?.detail || error.message,
        message: 'Failed to upload file'
      };
    }
  }

  /**
   * List all files
   * @param {Object} options - Query options
   * @param {number} options.latitude - Optional latitude
   * @param {number} options.longitude - Optional longitude
   * @param {string} options.wifi_ssid - Optional WiFi SSID
   * @returns {Promise<Array>} Array of file objects
   */
  async listFiles(options = {}) {
    try {
      const params = {};
      if (options.latitude !== undefined) params.latitude = options.latitude;
      if (options.longitude !== undefined) params.longitude = options.longitude;
      if (options.wifi_ssid) params.wifi_ssid = options.wifi_ssid;

      const response = await axios.get(`${API}/files`, {
        headers: this.headers,
        params
      });

      return {
        success: true,
        data: response.data
      };
    } catch (error) {
      return {
        success: false,
        error: error.response?.data?.detail || error.message,
        data: []
      };
    }
  }

  /**
   * Access/download a file
   * @param {string} fileId - ID of the file
   * @param {Object} options - Access options
   * @param {number} options.latitude - Latitude for geofence validation
   * @param {number} options.longitude - Longitude for geofence validation
   * @param {string} options.wifi_ssid - WiFi SSID for validation
   * @param {boolean} options.responseType - Response type (default: 'blob')
   * @returns {Promise<Blob>} File content as blob
   */
  async accessFile(fileId, options = {}) {
    try {
      const payload = {
        file_id: fileId,
        latitude: options.latitude,
        longitude: options.longitude,
        wifi_ssid: options.wifi_ssid
      };

      const response = await axios.post(`${API}/files/access`, payload, {
        headers: this.headers,
        responseType: options.responseType || 'blob'
      });

      return {
        success: true,
        data: response.data
      };
    } catch (error) {
      const errorDetail = error.response?.data?.detail;
      
      // Parse structured validation result if available
      if (typeof errorDetail === 'object') {
        return {
          success: false,
          error: errorDetail.reason || 'Access denied',
          validations: errorDetail.validations,
          status: error.response?.status
        };
      }

      return {
        success: false,
        error: errorDetail || error.message,
        status: error.response?.status
      };
    }
  }

  /**
   * Create temporary public access token URL for Office preview
   * @param {string} fileId - ID of the file
   * @param {number} expiresIn - seconds until expiration
   * @returns {Promise<Object>} public_url and token
   */
  async createPublicFileLink(fileId, expiresIn = 900, options = {}) {
    try {
      const payload = {
        file_id: fileId,
        expires_in: expiresIn
      };

      if (options.latitude !== undefined) payload.latitude = options.latitude;
      if (options.longitude !== undefined) payload.longitude = options.longitude;
      if (options.wifi_ssid) payload.wifi_ssid = options.wifi_ssid;

      const response = await axios.post(`${API}/files/public-link`, payload, {
        headers: this.headers
      });

      return {
        success: true,
        data: response.data
      };
    } catch (error) {
      return {
        success: false,
        error: error.response?.data?.detail || error.message,
        status: error.response?.status
      };
    }
  }

  /**
   * Determine if file is accessible based on type
   * @param {string} filename - Name of the file
   * @returns {Object} File type information
   */
  getFileType(filename) {
    const nameLower = filename.toLowerCase();

    return {
      isImage: /\.(jpg|jpeg|png|gif|webp|bmp)$/i.test(nameLower),
      isPdf: nameLower.endsWith('.pdf'),
      isText: /\.(txt|md|log|json|csv)$/.test(nameLower),
      isOffice: /\.(doc|docx|ppt|pptx|xls|xlsx|odt|odp|ods)$/i.test(nameLower),
      isSupported: true // App can handle with download fallback for non-inline formats
    };
  }

  /**
   * Convert blob to text (for text files)
   * @param {Blob} blob - File blob
   * @returns {Promise<string>} File content as text
   */
  async blobToText(blob) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = (e) => resolve(e.target.result);
      reader.onerror = reject;
      reader.readAsText(blob);
    });
  }

/**
 * Convert DOCX blob to HTML using mammoth
 * @param {Blob} blob - DOCX file blob
 * @returns {Promise<string>} HTML content
 */
async blobToDocxHtml(blob) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = async (e) => {
      try {
        const mammoth = await import('mammoth');
        const result = await mammoth.convertToHtml({ arrayBuffer: e.target.result });
        resolve(result.value);
      } catch (error) {
        reject(error);
      }
    };
    reader.onerror = reject;
    reader.readAsArrayBuffer(blob);
  });
}

/**
 * Convert PPTX blob to render data using JSZip
 * @param {Blob} blob - PPTX file blob
 * @returns {Promise<Object>} Slides data for rendering
 */
async blobToPptxSlides(blob) {
  try {
    const JSZip = (await import('jszip')).default;
    const zip = await JSZip.loadAsync(blob);

    const slideFiles = Object.keys(zip.files)
      .filter((path) => /^ppt\/slides\/slide\d+\.xml$/.test(path))
      .sort((a, b) => {
        const aNum = Number(a.match(/slide(\d+)\.xml$/)?.[1] || 0);
        const bNum = Number(b.match(/slide(\d+)\.xml$/)?.[1] || 0);
        return aNum - bNum;
      });

    if (slideFiles.length === 0) {
      throw new Error('PPTX contains no slide XML files');
    }

    const slides = [];

    const mediaFiles = {};
    Object.keys(zip.files)
      .filter((path) => /^ppt\/media\//.test(path))
      .forEach((mediaPath) => {
        mediaFiles[mediaPath.replace('ppt/media/', '')] = zip.file(mediaPath);
      });

    for (let i = 0; i < slideFiles.length; i++) {
      const slidePath = slideFiles[i];
      try {
        const xmlContent = await zip.file(slidePath).async('string');
        const parser = new DOMParser();
        const xmlDoc = parser.parseFromString(xmlContent, 'application/xml');

        // Slide relationships (image refs)
        const relPath = slidePath.replace('slides/', 'slides/_rels/') + '.rels';
        const rels = {};
        if (zip.file(relPath)) {
          const relXml = await zip.file(relPath).async('string');
          const relDoc = parser.parseFromString(relXml, 'application/xml');
          Array.from(relDoc.getElementsByTagName('Relationship')).forEach((rel) => {
            const id = rel.getAttribute('Id');
            const target = rel.getAttribute('Target');
            if (id && target) rels[id] = target;
          });
        }

        const textNodes = Array.from(xmlDoc.getElementsByTagName('a:t'));
        const slideText = textNodes
          .map((n) => (n.textContent || '').trim())
          .filter((t) => t.length > 0);

        const blipNodes = Array.from(xmlDoc.getElementsByTagName('a:blip'));
        const images = [];

        for (const blip of blipNodes) {
          let embed = blip.getAttribute('r:embed') || blip.getAttribute('embed');
          if (embed && rels[embed]) {
            let target = rels[embed].replace('../media/', '');
            if (mediaFiles[target]) {
              try {
                const blobData = await mediaFiles[target].async('blob');
                images.push(URL.createObjectURL(blobData));
              } catch (err) {
                console.warn('Could not load embedded image', target, err);
              }
            }
          }
        }

        // Table text extraction
        const tables = [];
        const tableNodes = Array.from(xmlDoc.getElementsByTagName('a:tbl'));
        for (const tbl of tableNodes) {
          const rows = Array.from(tbl.getElementsByTagName('a:tr'));
          const table = rows.map((row) => {
            const cells = Array.from(row.getElementsByTagName('a:tc'));
            return cells.map((cell) => {
              const ctextNodes = Array.from(cell.getElementsByTagName('a:t'));
              return ctextNodes.map((n) => (n.textContent || '').trim()).filter((s) => s).join(' ');
            });
          });
          if (table.length) tables.push(table);
        }

        const canvas = document.createElement('canvas');
        canvas.width = 980;
        canvas.height = 720;
        const ctx = canvas.getContext('2d');

        // Background
        ctx.fillStyle = '#ffffff';
        ctx.fillRect(0, 0, canvas.width, canvas.height);

        ctx.strokeStyle = '#e5e7eb';
        ctx.lineWidth = 2;
        ctx.strokeRect(0, 0, canvas.width, canvas.height);

        // Header
        ctx.fillStyle = '#1f2937';
        ctx.font = 'bold 30px Arial';
        ctx.fillText(`Slide ${i + 1}`, 30, 45);

        let y = 80;

        // Images
        for (const imageUrl of images.slice(0, 3)) {
          const img = await new Promise((resolve, reject) => {
            const i = new Image();
            i.crossOrigin = 'anonymous';
            i.onload = () => resolve(i);
            i.onerror = reject;
            i.src = imageUrl;
          }).catch(() => null);

          if (img) {
            const imgW = Math.min(400, img.width);
            const imgH = (img.height / img.width) * imgW;
            ctx.drawImage(img, 30, y, imgW, imgH);
            y += imgH + 12;
          }
        }

        // Table text
        tables.forEach((table) => {
          const rowHeight = 30;
          const tableLeft = 30;
          let tableTop = y;
          const tableWidth = canvas.width - 60;
          const colCount = table[0]?.length || 1;
          const colWidth = tableWidth / colCount;

          ctx.strokeStyle = '#94a3b8';
          ctx.lineWidth = 1;

          table.forEach((row, rowIndex) => {
            row.forEach((cell, idx) => {
              const x = tableLeft + idx * colWidth;
              const cellY = tableTop + rowIndex * rowHeight;
              ctx.strokeRect(x, cellY, colWidth, rowHeight);
              ctx.font = '14px Arial';
              ctx.fillStyle = '#0f172a';
              ctx.fillText(cell || '-', x + 6, cellY + 20);
            });
          });

          y += table.length * rowHeight + 14;
        });

        // Slide text
        if (slideText.length) {
          ctx.fillStyle = '#111827';
          ctx.font = '16px Arial';
          for (const line of slideText) {
            if (y > 660) break;
            const words = line.split(' ');
            let current = '';
            for (const word of words) {
              const test = current + word + ' ';
              if (ctx.measureText(test).width > 920) {
                ctx.fillText(current.trim(), 30, y);
                y += 22;
                current = word + ' ';
              } else {
                current = test;
              }
            }
            if (current.trim()) {
              ctx.fillText(current.trim(), 30, y);
              y += 22;
            }
          }
        } else if (!images.length && !tables.length) {
          ctx.fillStyle = '#6b7280';
          ctx.font = '18px Arial';
          ctx.fillText('Slide content not fully supported for diagrams/complex layouts.', 30, y + 20);
        }

        slides.push(canvas.toDataURL('image/png'));

        // Revoke object URLs after conversion
        images.forEach((objectUrl) => URL.revokeObjectURL(objectUrl));
      } catch (slideError) {
        console.warn(`Failed rendering slide: ${slidePath}`, slideError);
      }
    }

    if (slides.length === 0) {
      throw new Error('No renderable slides in PPTX file');
    }

    return { slides };
  } catch (error) {
    throw error;
  }
}


/**
 * Convert blob to data URL (for images, PDFs)
   * @param {Blob} blob - File blob
   * @returns {Promise<string>} Data URL
   */
  async blobToDataUrl(blob) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = (e) => resolve(e.target.result);
      reader.onerror = reject;
      reader.readAsDataURL(blob);
    });
  }

  /**
   * Create object URL for blob (alternative to data URL)
   * @param {Blob} blob - File blob
   * @returns {string} Object URL
   */
  createObjectUrl(blob) {
    return URL.createObjectURL(blob);
  }

  /**
   * Revoke object URL when done
   * @param {string} url - Object URL to revoke
   */
  revokeObjectUrl(url) {
    URL.revokeObjectURL(url);
  }

  /**
   * Download file to disk
   * @param {Blob} blob - File blob
   * @param {string} filename - Name for downloaded file
   */
  downloadFile(blob, filename) {
    const url = this.createObjectUrl(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    this.revokeObjectUrl(url);
  }

  /**
   * Get file size in human-readable format
   * @param {number} bytes - File size in bytes
   * @returns {string} Formatted size string
   */
  formatFileSize(bytes) {
    if (bytes === 0) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return Math.round(bytes / Math.pow(k, i) * 100) / 100 + ' ' + sizes[i];
  }

  /**
   * Check if file is accessible based on file metadata
   * @param {Object} file - File metadata object
   * @returns {boolean} Whether file is accessible
   */
  isFileAccessible(file) {
    return file.accessible === true;
  }

  /**
   * Get access denial reason
   * @param {Object} file - File metadata object
   * @returns {string} Reason for access denial
   */
  getAccessReason(file) {
    return file.access_reason || 'Access denied';
  }

  /**
   * Validate file for upload
   * @param {File} file - File to validate
   * @param {Object} options - Validation options
   * @param {number} options.maxSizeBytes - Maximum file size in bytes (default: 100MB)
   * @returns {Object} Validation result
   */
  validateFileForUpload(file, options = {}) {
    const maxSize = options.maxSizeBytes || 100 * 1024 * 1024; // 100MB default

    if (!file) {
      return { valid: false, error: 'Please select a file' };
    }

    if (file.size > maxSize) {
      return { 
        valid: false, 
        error: `File size exceeds maximum of ${this.formatFileSize(maxSize)}` 
      };
    }

    return { valid: true };
  }
}

export default FileService;
