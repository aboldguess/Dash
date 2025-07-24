import { Schema, model, Document, Types } from 'mongoose';

/**
 * Profile information for a user. Stored separately from the core user
 * document so additional details can be added without altering the
 * authentication model. Each user has at most one profile.
 */
export interface IProfile extends Document {
  user: Types.ObjectId;
  photo?: string;      // URL path to the uploaded profile image
  career?: string;     // brief career history
  education?: string;  // education summary
  statement?: string;  // personal statement
}

const ProfileSchema = new Schema<IProfile>({
  user: { type: Schema.Types.ObjectId, ref: 'User', unique: true, required: true },
  photo: String,
  career: String,
  education: String,
  statement: String
});

export const Profile = model<IProfile>('Profile', ProfileSchema);
