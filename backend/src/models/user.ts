import { Schema, model, Document, Types } from 'mongoose';

export type Role = 'user' | 'teamAdmin' | 'admin';

/**
 * Representation of a user document stored in MongoDB.
 */
export interface IUser extends Document {
  username: string;
  password: string;
  role: Role;
  /** Reference to the team this user belongs to */
  team?: Types.ObjectId;
  /** Users from other teams allowed to message this user */
  allowedContacts: Types.ObjectId[];
  /** Users this account is following */
  following: Types.ObjectId[];
  /** Users that follow this account */
  followers: Types.ObjectId[];
}

const UserSchema = new Schema<IUser>({
  username: { type: String, required: true, unique: true },
  password: { type: String, required: true },
  role: { type: String, enum: ['user', 'teamAdmin', 'admin'], default: 'user' },
  team: { type: Schema.Types.ObjectId, ref: 'Team' },
  // Cross-team contacts who may exchange direct messages
  allowedContacts: [{ type: Schema.Types.ObjectId, ref: 'User' }],
  // Social relationships
  following: [{ type: Schema.Types.ObjectId, ref: 'User' }],
  followers: [{ type: Schema.Types.ObjectId, ref: 'User' }]
});

export const User = model<IUser>('User', UserSchema);
