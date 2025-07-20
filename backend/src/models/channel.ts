import { Schema, model, Document } from 'mongoose';

/**
 * Chat channel that messages can belong to.
 */
export interface IChannel extends Document {
  /** Human readable name */
  name: string;
}

const ChannelSchema = new Schema<IChannel>({
  // Channel names must be unique for easy lookup
  name: { type: String, required: true, unique: true }
});

export const Channel = model<IChannel>('Channel', ChannelSchema);
