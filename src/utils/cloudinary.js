const cloudinary = require('cloudinary').v2;

// Configure Cloudinary
cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME || 'dmxtgfaq2',
  api_key: process.env.CLOUDINARY_API_KEY || '519116425418852',
  api_secret: process.env.CLOUDINARY_API_SECRET || '_DQYVVaHTBDWQ8L0u9R_MA_0iXU'
});

// Upload image to Cloudinary
const uploadImage = async (file) => {
  try {
    const result = await cloudinary.uploader.upload(file, {
      folder: 'civic-profiles',
      width: 400,
      height: 400,
      crop: 'fill',
      quality: 'auto',
      format: 'jpg'
    });
    return result.secure_url;
  } catch (error) {
    console.error('Cloudinary upload error:', error);
    throw new Error('Failed to upload image');
  }
};

// Delete image from Cloudinary
const deleteImage = async (publicId) => {
  try {
    if (publicId) {
      await cloudinary.uploader.destroy(publicId);
    }
  } catch (error) {
    console.error('Cloudinary delete error:', error);
  }
};

module.exports = { uploadImage, deleteImage }; 