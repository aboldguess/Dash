import { Schema, model, Document } from 'mongoose';

export type Role = 'user' | 'teamAdmin' | 'admin';

/**
 * Representation of a user document stored in MongoDB.
 */
export interface IUser extends Document {
  username: string;
  password: string;
  role: Role;
}

const UserSchema = new Schema<IUser>({
  username: { type: String, required: true, unique: true },
  password: { type: String, required: true },
  role: { type: String, enum: ['user', 'teamAdmin', 'admin'], default: 'user' }
});

export const User = model<IUser>('User', UserSchema);
