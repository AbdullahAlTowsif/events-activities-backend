import multer from 'multer';
import path from 'path';
import { v2 as cloudinary } from 'cloudinary';
import fs from "fs"
import { envVars } from '../config/env';

const storage = multer.diskStorage({
    destination: function (req, file, cb) {
        const uploadPath = path.join(process.cwd(), 'uploads');
        console.log('Upload path:', uploadPath);
        console.log('Directory exists:', fs.existsSync(uploadPath));

        if (!fs.existsSync(uploadPath)) {
            fs.mkdirSync(uploadPath, { recursive: true });
            console.log('Directory created');
        }

        cb(null, uploadPath);
    },
    filename: function (req, file, cb) {
        console.log('Uploading file:', file.originalname);
        const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
        const fileExt = path.extname(file.originalname);
        const filename = file.fieldname + '-' + uniqueSuffix + fileExt;
        console.log('Generated filename:', filename);
        cb(null, filename);
    }
});

const upload = multer({
    storage: storage,
})

const uploadToCloudinary = async (file: Express.Multer.File) => {
    try {
        // Configuration
        cloudinary.config({
            cloud_name: envVars.CLOUDINARY_CLOUD_NAME,
            api_key: envVars.CLOUDINARY_API_KEY,
            api_secret: envVars.CLOUDINARY_API_SECRET
        });

        console.log('File path for Cloudinary:', file.path);
        console.log('File exists for Cloudinary:', fs.existsSync(file.path));

        // Check if file exists before uploading to Cloudinary
        if (!fs.existsSync(file.path)) {
            throw new Error('File not found on disk');
        }

        // Upload an image with error handling
        const uploadResult = await cloudinary.uploader.upload(file.path, {
            public_id: file.filename,
        });

        console.log('Cloudinary upload result:', uploadResult);

        // Delete local file after successful upload to Cloudinary
        fs.unlinkSync(file.path);
        console.log('Local file deleted after Cloudinary upload');

        return uploadResult;
    } catch (error) {
        console.error('Error uploading to Cloudinary:', error);

        // Delete local file if upload fails
        if (fs.existsSync(file.path)) {
            fs.unlinkSync(file.path);
            console.log('Local file deleted after failed upload');
        }

        throw error; // Re-throw the error for the caller to handle
    }
}

export const fileUploader = {
    upload,
    uploadToCloudinary
}
