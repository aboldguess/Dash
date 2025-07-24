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
const upload = multer({ dest: uploadDir });

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
