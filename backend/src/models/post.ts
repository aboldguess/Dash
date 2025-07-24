import { Schema, model, Document } from 'mongoose';

/**
 * Simple social post authored by a user.
 */
export interface IPost extends Document {
  author: string;
  content: string;
  createdAt: Date;
}

const PostSchema = new Schema<IPost>({
  author: { type: String, required: true },
  content: { type: String, required: true },
  // Default timestamp so posts are ordered chronologically
  createdAt: { type: Date, default: Date.now }
});

export const Post = model<IPost>('Post', PostSchema);
