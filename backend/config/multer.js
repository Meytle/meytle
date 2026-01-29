/**
 * Multer Configuration for File Uploads
 * Handles profile photos only (no government IDs for security)
 * Government ID verification now uses Veriff API (no local file storage)
 * All files stored locally on VPS
 */

const multer = require('multer');
const path = require('path');
const fs = require('fs');

// Ensure upload directory exists
const uploadDirs = {
  profiles: path.join(__dirname, '../uploads/profiles'),
  // documents directory removed - no longer storing government IDs locally
};

Object.values(uploadDirs).forEach(dir => {
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
});

// Configure storage (permanent local storage on VPS)
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    // Allow both 'profilePhoto' and 'photo' field names
    if (file.fieldname === 'profilePhoto' || file.fieldname === 'photo') {
      cb(null, uploadDirs.profiles);
    } else {
      cb(new Error('Invalid field name. Only profilePhoto or photo is allowed.'), null);
    }
  },
  filename: (req, file, cb) => {
    // Generate unique filename: userId-timestamp-originalname
    const userId = req.user?.id || 'unknown';
    const timestamp = Date.now();
    const ext = path.extname(file.originalname);
    const baseName = path.basename(file.originalname, ext)
      .replace(/[^a-zA-Z0-9]/g, '_') // Replace special chars
      .substring(0, 50); // Limit length
    
    const filename = `${userId}-${timestamp}-${baseName}${ext}`;
    cb(null, filename);
  }
});

// File filter - only allow images
const fileFilter = (req, file, cb) => {
  const allowedMimeTypes = [
    'image/jpeg',
    'image/jpg',
    'image/png',
    'image/gif',
    'image/webp'
  ];

  if (allowedMimeTypes.includes(file.mimetype)) {
    cb(null, true);
  } else {
    cb(new Error('Invalid file type. Only JPEG, PNG, GIF, and WebP images are allowed.'), false);
  }
};

// Configure multer
const upload = multer({
  storage: storage,
  fileFilter: fileFilter,
  limits: {
    fileSize: 5 * 1024 * 1024, // 5MB max file size
  }
});

// Export upload middleware for different scenarios
module.exports = {
  upload,
  
  // For companion application (profile photo ONLY - no government ID)
  // Government ID verification now handled by Veriff API
  uploadCompanionFiles: upload.single('profilePhoto'),

  // For profile photo only (accepts 'profilePhoto' field name)
  uploadProfilePhoto: upload.single('profilePhoto'),

  // For additional photos (accepts 'photo' field name)
  uploadPhoto: upload.single('photo'),

  // NOTE: uploadIdDocument removed - no longer storing government IDs locally
  // Client verification now uses Veriff API for identity verification

  // Upload directories for serving files
  uploadDirs,
};

