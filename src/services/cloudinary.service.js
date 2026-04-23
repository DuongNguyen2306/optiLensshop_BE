const { v2: cloudinary } = require("cloudinary");

cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET,
});

function uploadBufferToCloudinary(buffer, options = {}) {
  return new Promise((resolve, reject) => {
    const stream = cloudinary.uploader.upload_stream(
      options,
      (error, result) => {
        if (error) return reject(error);
        return resolve(result);
      },
    );

    stream.end(buffer);
  });
}

async function uploadAvatar(fileBuffer, userId) {
  const result = await uploadBufferToCloudinary(fileBuffer, {
    folder: "optilens/avatars",
    public_id: `user_${userId}_${Date.now()}`,
    resource_type: "image",
    overwrite: true,
  });

  return {
    url: result.secure_url,
    public_id: result.public_id,
  };
}

module.exports = {
  uploadAvatar,
  uploadBufferToCloudinary,
};
