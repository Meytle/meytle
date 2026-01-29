/**
 * File Manager Utility
 * Handles local file operations for uploaded images
 * Replaces Cloudinary functionality with VPS storage
 */

const fs = require('fs').promises;
const path = require('path');
const { pool } = require('../config/database');
const logger = require('../services/logger');

/**
 * Delete a single file from the filesystem
 * @param {string} filePath - Relative path from backend root (e.g., '/uploads/profiles/file.jpg')
 * @returns {Promise<boolean>} - Success status
 */
const deleteFile = async (filePath) => {
  try {
    // Convert relative path to absolute path
    const absolutePath = path.join(__dirname, '..', filePath);
    
    // Check if file exists before attempting deletion
    await fs.access(absolutePath);
    
    // Delete the file
    await fs.unlink(absolutePath);
    
    logger.info('File deleted successfully', { filePath });
    return true;
  } catch (error) {
    if (error.code === 'ENOENT') {
      logger.warn('File not found for deletion', { filePath });
      return true; // Consider it success if file doesn't exist
    }
    logger.error('Failed to delete file', { filePath, error: error.message });
    return false;
  }
};

/**
 * Delete old profile photo when user uploads a new one
 * @param {string} oldPhotoUrl - URL of the old photo
 * @returns {Promise<boolean>} - Success status
 */
const deleteOldPhoto = async (oldPhotoUrl) => {
  if (!oldPhotoUrl) {
    return true; // Nothing to delete
  }
  
  // Skip if it's a Cloudinary URL (legacy data)
  if (oldPhotoUrl.includes('cloudinary.com') || oldPhotoUrl.includes('http')) {
    logger.info('Skipping deletion of external URL', { oldPhotoUrl });
    return true;
  }
  
  return await deleteFile(oldPhotoUrl);
};

/**
 * Get file statistics for uploads directory
 * @returns {Promise<object>} - Statistics object
 */
const getUploadStatistics = async () => {
  try {
    const uploadsPath = path.join(__dirname, '..', 'uploads');
    
    const stats = {
      profiles: await getDirectorySize(path.join(uploadsPath, 'profiles')),
      documents: await getDirectorySize(path.join(uploadsPath, 'documents')),
      total: 0,
      fileCount: 0
    };
    
    stats.total = stats.profiles.size + stats.documents.size;
    stats.fileCount = stats.profiles.count + stats.documents.count;
    
    return {
      success: true,
      data: {
        totalSize: formatBytes(stats.total),
        totalSizeBytes: stats.total,
        fileCount: stats.fileCount,
        breakdown: {
          profiles: {
            size: formatBytes(stats.profiles.size),
            sizeBytes: stats.profiles.size,
            count: stats.profiles.count
          },
          documents: {
            size: formatBytes(stats.documents.size),
            sizeBytes: stats.documents.size,
            count: stats.documents.count
          }
        }
      }
    };
  } catch (error) {
    logger.error('Failed to get upload statistics', { error: error.message });
    return {
      success: false,
      error: error.message
    };
  }
};

/**
 * Get directory size and file count
 * @param {string} dirPath - Directory path
 * @returns {Promise<object>} - Size in bytes and file count
 */
const getDirectorySize = async (dirPath) => {
  try {
    const files = await fs.readdir(dirPath);
    let totalSize = 0;
    let fileCount = 0;
    
    for (const file of files) {
      const filePath = path.join(dirPath, file);
      const stats = await fs.stat(filePath);
      
      if (stats.isFile()) {
        totalSize += stats.size;
        fileCount++;
      }
    }
    
    return { size: totalSize, count: fileCount };
  } catch (error) {
    if (error.code === 'ENOENT') {
      return { size: 0, count: 0 };
    }
    throw error;
  }
};

/**
 * Format bytes to human-readable format
 * @param {number} bytes - Size in bytes
 * @returns {string} - Formatted string
 */
const formatBytes = (bytes) => {
  if (bytes === 0) return '0 Bytes';
  
  const k = 1024;
  const sizes = ['Bytes', 'KB', 'MB', 'GB', 'TB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  
  return Math.round((bytes / Math.pow(k, i)) * 100) / 100 + ' ' + sizes[i];
};

/**
 * Clean up orphaned files (files not referenced in database)
 * Admin utility - use with caution
 * @param {boolean} dryRun - If true, only report what would be deleted
 * @returns {Promise<object>} - Cleanup results
 */
const cleanupOrphanedFiles = async (dryRun = true) => {
  try {
    logger.info('Starting orphaned files cleanup', { dryRun });
    
    // Get all file URLs from database
    const [users] = await pool.execute(
      'SELECT profile_picture, additional_photo FROM users WHERE profile_picture IS NOT NULL OR additional_photo IS NOT NULL'
    );
    
    const [companionApps] = await pool.execute(
      'SELECT profile_photo_url, government_id_url FROM companion_applications WHERE profile_photo_url IS NOT NULL OR government_id_url IS NOT NULL'
    );
    
    const [clientVerifs] = await pool.execute(
      'SELECT profile_photo_url, id_document_url FROM client_verifications WHERE profile_photo_url IS NOT NULL OR id_document_url IS NOT NULL'
    );
    
    // Collect all referenced file paths
    const referencedFiles = new Set();
    
    users.forEach(user => {
      if (user.profile_picture) referencedFiles.add(user.profile_picture);
      if (user.additional_photo) referencedFiles.add(user.additional_photo);
    });
    
    companionApps.forEach(app => {
      if (app.profile_photo_url) referencedFiles.add(app.profile_photo_url);
      if (app.government_id_url) referencedFiles.add(app.government_id_url);
    });
    
    clientVerifs.forEach(verif => {
      if (verif.profile_photo_url) referencedFiles.add(verif.profile_photo_url);
      if (verif.id_document_url) referencedFiles.add(verif.id_document_url);
    });
    
    // Scan filesystem for actual files
    const uploadsPath = path.join(__dirname, '..', 'uploads');
    const profilesPath = path.join(uploadsPath, 'profiles');
    const documentsPath = path.join(uploadsPath, 'documents');
    
    const profileFiles = await fs.readdir(profilesPath);
    const documentFiles = await fs.readdir(documentsPath);
    
    const orphanedFiles = [];
    
    // Check profiles
    for (const file of profileFiles) {
      const relativePath = `/uploads/profiles/${file}`;
      if (!referencedFiles.has(relativePath)) {
        orphanedFiles.push({
          path: relativePath,
          absolutePath: path.join(profilesPath, file),
          type: 'profile'
        });
      }
    }
    
    // Check documents
    for (const file of documentFiles) {
      const relativePath = `/uploads/documents/${file}`;
      if (!referencedFiles.has(relativePath)) {
        orphanedFiles.push({
          path: relativePath,
          absolutePath: path.join(documentsPath, file),
          type: 'document'
        });
      }
    }
    
    // Delete orphaned files if not dry run
    let deletedCount = 0;
    let deletedSize = 0;
    
    if (!dryRun && orphanedFiles.length > 0) {
      for (const file of orphanedFiles) {
        try {
          const stats = await fs.stat(file.absolutePath);
          await fs.unlink(file.absolutePath);
          deletedCount++;
          deletedSize += stats.size;
          logger.info('Deleted orphaned file', { path: file.path });
        } catch (error) {
          logger.error('Failed to delete orphaned file', { path: file.path, error: error.message });
        }
      }
    }
    
    return {
      success: true,
      dryRun,
      orphanedFiles: orphanedFiles.length,
      deletedCount,
      deletedSize: formatBytes(deletedSize),
      files: orphanedFiles.map(f => ({ path: f.path, type: f.type }))
    };
  } catch (error) {
    logger.error('Failed to cleanup orphaned files', { error: error.message });
    return {
      success: false,
      error: error.message
    };
  }
};

/**
 * Ensure upload directories exist with proper permissions
 * @returns {Promise<boolean>} - Success status
 */
const ensureUploadDirectories = async () => {
  try {
    const uploadsPath = path.join(__dirname, '..', 'uploads');
    const profilesPath = path.join(uploadsPath, 'profiles');
    const documentsPath = path.join(uploadsPath, 'documents');
    
    // Create directories if they don't exist
    await fs.mkdir(uploadsPath, { recursive: true });
    await fs.mkdir(profilesPath, { recursive: true });
    await fs.mkdir(documentsPath, { recursive: true });
    
    logger.info('Upload directories ensured');
    return true;
  } catch (error) {
    logger.error('Failed to ensure upload directories', { error: error.message });
    return false;
  }
};

module.exports = {
  deleteFile,
  deleteOldPhoto,
  getUploadStatistics,
  cleanupOrphanedFiles,
  ensureUploadDirectories,
  formatBytes
};

