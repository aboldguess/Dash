import { Schema, model, Document, Types } from 'mongoose';
import { IUser } from './user';

/**
 * Short status update made by a user. Each post references the
 * author for quick population when listing the feed.
 */
export interface ISocialPost extends Document {
  /** User that created the post */
  author: Types.ObjectId | IUser;
  /** Post contents */
  text: string;
  /** Timestamp of creation */
  createdAt: Date;
}

const SocialPostSchema = new Schema<ISocialPost>({
  author: { type: Schema.Types.ObjectId, ref: 'User', required: true },
  text: { type: String, required: true },
  createdAt: { type: Date, default: Date.now }
});

export const SocialPost = model<ISocialPost>('SocialPost', SocialPostSchema);
