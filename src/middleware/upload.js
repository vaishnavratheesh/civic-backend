const multer = require('multer');
const path = require('path');

// Configure multer for file uploads
const storage = multer.diskStorage({
  destination: function (req, file, cb) {
    cb(null, 'uploads/');
  },
  filename: function (req, file, cb) {
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
    cb(null, file.fieldname + '-' + uniqueSuffix + path.extname(file.originalname));
  }
});

// File filter for images, PDF, and videos
const fileFilter = (req, file, cb) => {
  // Accept image files, PDFs, and video files
  if (file.mimetype.startsWith('image/') || 
      file.mimetype === 'application/pdf' || 
      file.mimetype.startsWith('video/')) {
    cb(null, true);
  } else {
    cb(new Error('Only image, PDF, and video files are allowed!'), false);
  }
};

// Configure upload middleware
const upload = multer({
  storage: storage,
  fileFilter: fileFilter,
  limits: {
    fileSize: 50 * 1024 * 1024 // 50MB limit for videos
  }
});

module.exports = upload; 