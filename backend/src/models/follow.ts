import { Schema, model, Document } from 'mongoose';

/**
 * Relationship indicating that `follower` subscribes to `following`.
 */
export interface IFollow extends Document {
  follower: string;
  following: string;
}

const FollowSchema = new Schema<IFollow>({
  follower: { type: String, required: true },
  following: { type: String, required: true }
});

// Prevent duplicate follow records per pair of users
FollowSchema.index({ follower: 1, following: 1 }, { unique: true });

export const Follow = model<IFollow>('Follow', FollowSchema);
