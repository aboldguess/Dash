import { Schema, model, Document, Types } from 'mongoose';

/**
 * Profile information for a user. Stored separately from the core user
 * document so additional details can be added without altering the
 * authentication model. Each user has at most one profile.
 */
/** Visibility levels for profile fields */
export type Visibility = 'world' | 'platform' | 'team';

export interface IProfile extends Document {
  user: Types.ObjectId;
  photo?: string;              // URL path to the uploaded profile image
  photoVisibility: Visibility; // who can see the photo
  career?: string;             // brief career history
  careerVisibility: Visibility;
  education?: string;          // education summary
  educationVisibility: Visibility;
  statement?: string;          // personal statement
  statementVisibility: Visibility;
}

const ProfileSchema = new Schema<IProfile>({
  user: { type: Schema.Types.ObjectId, ref: 'User', unique: true, required: true },
  photo: String,
  photoVisibility: { type: String, enum: ['world', 'platform', 'team'], default: 'platform' },
  career: String,
  careerVisibility: { type: String, enum: ['world', 'platform', 'team'], default: 'platform' },
  education: String,
  educationVisibility: { type: String, enum: ['world', 'platform', 'team'], default: 'platform' },
  statement: String,
  statementVisibility: { type: String, enum: ['world', 'platform', 'team'], default: 'platform' }
});

export const Profile = model<IProfile>('Profile', ProfileSchema);
