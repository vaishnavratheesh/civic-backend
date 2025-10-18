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

// Upload video to Cloudinary
const uploadVideo = async (file) => {
  try {
    console.log('Cloudinary config check:', {
      cloud_name: process.env.CLOUDINARY_CLOUD_NAME || 'dmxtgfaq2',
      api_key: process.env.CLOUDINARY_API_KEY || '519116425418852',
      api_secret: process.env.CLOUDINARY_API_SECRET ? 'Set' : 'Not set'
    });
    
    console.log('Uploading video file:', file);
    const result = await cloudinary.uploader.upload(file, {
      folder: 'civic-videos',
      resource_type: 'video',
      quality: 'auto',
      format: 'mp4'
    });
    
    console.log('Cloudinary upload result:', result);
    return result.secure_url;
  } catch (error) {
    console.error('Cloudinary video upload error:', error);
    console.error('Error details:', error.message);
    console.error('Error stack:', error.stack);
    throw new Error(`Failed to upload video: ${error.message}`);
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

module.exports = { uploadImage, uploadVideo, deleteImage }; 