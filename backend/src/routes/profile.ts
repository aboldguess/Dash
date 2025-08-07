/**
 * @fileoverview User profile routes.
 *
 * Allows authenticated users to retrieve and update their profile information
 * and upload a profile photo. Uploaded files are restricted to images and
 * stored on disk with their original extension preserved.
 */
import { Router } from 'express';
import multer from 'multer';
import path from 'path';
import { authMiddleware, AuthRequest } from '../middleware/authMiddleware';
import { Profile } from '../models/profile';

const router = Router();

// Directory used for uploaded profile photos. Resolve relative to the project
// root so uploads end up in `<project>/backend/uploads` regardless of whether
// the TypeScript source or compiled JavaScript is executed.
const uploadDir = path.resolve(__dirname, '..', '..', 'uploads');

// Configure multer to only accept image files and preserve their extensions.
const storage = multer.diskStorage({
  destination: uploadDir,
  filename: (_req, file, cb) => {
    const ext = path.extname(file.originalname);
    cb(null, `photo-${Date.now()}${ext}`);
  }
});

const upload = multer({
  storage,
  fileFilter: (_req, file, cb) => {
    if (file.mimetype.startsWith('image/')) {
      cb(null, true);
    } else {
      cb(new Error('Only image uploads are allowed'));
    }
  }
});

// All profile endpoints require authentication
router.use(authMiddleware);

/** Fetch the logged in user's profile data. */
router.get('/me', async (req: AuthRequest, res) => {
  const profile = await Profile.findOne({ user: req.user!.id }).exec();
  res.json(profile);
});

/**
 * Update career history, education and personal statement for the current user.
 * If a profile document does not yet exist it will be created automatically.
 */
router.post('/me', async (req: AuthRequest, res) => {
  const { career, education, statement } = req.body;
  const profile = await Profile.findOneAndUpdate(
    { user: req.user!.id },
    { career, education, statement },
    { new: true, upsert: true }
  ).exec();
  res.json(profile);
});

/**
 * Upload a new profile photo. The uploaded file is stored on disk and the
 * relative URL is saved in the profile document for easy retrieval.
 */
router.post('/me/photo', upload.single('photo'), async (req: AuthRequest, res) => {
  if (!req.file) {
    return res.status(400).json({ message: 'File missing' });
  }
  const photoPath = `/uploads/${req.file.filename}`;
  const profile = await Profile.findOneAndUpdate(
    { user: req.user!.id },
    { photo: photoPath },
    { new: true, upsert: true }
  ).exec();
  res.json(profile);
});

export default router;
