const multer = require('multer');
const path = require('path');
const fs = require('fs');

// Ensure uploads directory exists
const uploadDir = path.join(__dirname, '../../uploads');
if (!fs.existsSync(uploadDir)) {
  fs.mkdirSync(uploadDir, { recursive: true });
}

// Storage configuration
const storage = multer.diskStorage({
  destination: function (req, file, cb) {
    cb(null, uploadDir);
  },
  filename: function (req, file, cb) {
    const ext = path.extname(file.originalname).toLowerCase();
    const cleanBase = path
      .basename(file.originalname, ext)
      .replace(/[^a-zA-Z0-9_-]/g, '_')
      .toLowerCase();
    const uniqueSuffix = `${Date.now()}-${Math.round(Math.random() * 1e9)}`;
    cb(null, `${cleanBase}-${uniqueSuffix}${ext}`);
  },
});

// File filter (images & audio formats)
const fileFilter = (req, file, cb) => {
  const allowedMimeTypes = [
    // Image formats
    'image/jpeg',
    'image/png',
    'image/webp',
    'image/gif',
    'image/svg+xml',
    // Audio formats
    'audio/mpeg',
    'audio/mp3',
    'audio/wav',
    'audio/x-wav',
    'audio/wave',
    'audio/ogg',
    'audio/aac',
    'audio/x-m4a',
    'audio/m4a',
    'audio/flac',
    'audio/x-flac',
    // Video formats (MP4, WebM, MOV, MKV)
    'video/mp4',
    'video/webm',
    'video/quicktime',
    'video/x-matroska',
    'video/ogg',
  ];

  const ext = path.extname(file.originalname || '').toLowerCase();
  const allowedExts = [
    '.jpg', '.jpeg', '.png', '.webp', '.gif', '.svg',
    '.mp3', '.wav', '.flac', '.m4a', '.aac', '.ogg',
    '.mp4', '.webm', '.mov', '.mkv'
  ];

  if (
    allowedMimeTypes.includes(file.mimetype) ||
    allowedExts.includes(ext) ||
    file.mimetype.startsWith('image/') ||
    file.mimetype.startsWith('audio/') ||
    file.mimetype.startsWith('video/')
  ) {
    cb(null, true);
  } else {
    cb(
      new Error(
        'Unsupported file type! Only image (JPG, PNG, WebP), audio (MP3, WAV, M4A, FLAC), and video (MP4, WebM, MOV) files are allowed.'
      ),
      false
    );
  }
};

const upload = multer({
  storage,
  fileFilter,
  limits: {
    fileSize: 250 * 1024 * 1024, // 250MB limit for high quality audio narrations
  },
});

module.exports = upload;
