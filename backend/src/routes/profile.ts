/**
 * @fileoverview User profile routes.
 *
 * Allows authenticated users to retrieve and update their profile information
 * and upload a profile photo. Uploaded files are restricted to images and
 * stored on disk with their original extension preserved. The `GET /me` route
 * lazily creates a profile document for users who have not yet set one up so
 * the client always receives a usable object.
*/
import { Router } from 'express';
import multer from 'multer';
import path from 'path';
import { authMiddleware, optionalAuth, AuthRequest } from '../middleware/authMiddleware';
import { Profile, Visibility } from '../models/profile';
import { User } from '../models/user';

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

/**
 * Fetch the logged in user's profile data. If no profile exists yet a new
 * document is created so the client always receives an object rather than
 * `null`, avoiding unnecessary errors when rendering the page.
 */
router.get('/me', authMiddleware, async (req: AuthRequest, res) => {
  let profile = await Profile.findOne({ user: req.user!.id }).exec();
  if (!profile) {
    profile = new Profile({ user: req.user!.id });
    await profile.save();
  }
  res.json(profile);
});

/**
 * Update career history, education and personal statement for the current user.
 * If a profile document does not yet exist it will be created automatically.
 */
router.post('/me', authMiddleware, async (req: AuthRequest, res) => {
  const {
    career,
    education,
    statement,
    careerVisibility,
    educationVisibility,
    statementVisibility,
    photoVisibility
  } = req.body as {
    career?: string;
    education?: string;
    statement?: string;
    careerVisibility?: Visibility;
    educationVisibility?: Visibility;
    statementVisibility?: Visibility;
    photoVisibility?: Visibility;
  };
  const profile = await Profile.findOneAndUpdate(
    { user: req.user!.id },
    { career, education, statement, careerVisibility, educationVisibility, statementVisibility, photoVisibility },
    { new: true, upsert: true }
  ).exec();
  res.json(profile);
});

/**
 * Upload a new profile photo. The uploaded file is stored on disk and the
 * relative URL is saved in the profile document for easy retrieval.
 */
router.post('/me/photo', authMiddleware, upload.single('photo'), async (req: AuthRequest, res) => {
  if (!req.file) {
    return res.status(400).json({ message: 'File missing' });
  }
  const photoPath = `/uploads/${req.file.filename}`;
  const profile = await Profile.findOneAndUpdate(
    { user: req.user!.id },
    { photo: photoPath, photoVisibility: req.body.visibility as Visibility | undefined },
    { new: true, upsert: true }
  ).exec();
  res.json(profile);
});

/**
 * Retrieve another user's profile, filtering fields based on visibility and
 * the relationship between the requester and profile owner. Authentication is
 * optional; supplying a token may reveal additional fields.
 */
router.get('/:userId', optionalAuth, async (req: AuthRequest, res) => {
  const profile = await Profile.findOne({ user: req.params.userId }).lean().exec();
  if (!profile) return res.status(404).json({ message: 'Profile not found' });
  const owner = await User.findById(req.params.userId).select('team').lean();
  const targetTeam = owner?.team?.toString();
  const viewer = req.user;
  const canView = (visibility: Visibility): boolean => {
    if (visibility === 'world') return true;
    if (visibility === 'platform') return !!viewer;
    if (visibility === 'team') {
      return !!(viewer && viewer.team && targetTeam && viewer.team === targetTeam);
    }
    return false;
  };
  const result: any = { user: profile.user.toString() };
  if (profile.photo && canView(profile.photoVisibility)) result.photo = profile.photo;
  if (profile.career && canView(profile.careerVisibility)) result.career = profile.career;
  if (profile.education && canView(profile.educationVisibility)) result.education = profile.education;
  if (profile.statement && canView(profile.statementVisibility)) result.statement = profile.statement;
  return res.json(result);
});

export default router;
