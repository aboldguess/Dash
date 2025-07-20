import { Schema, model, Document } from 'mongoose';

/**
 * Direct message exchanged between two users.
 */
export interface IDirectMessage extends Document {
  /** Username of the sender */
  from: string;
  /** Username of the recipient */
  to: string;
  /** Message contents */
  text: string;
  /** Time the message was created */
  createdAt: Date;
}

const DirectMessageSchema = new Schema<IDirectMessage>({
  from: { type: String, required: true },
  to: { type: String, required: true },
  text: { type: String, required: true },
  // Automatically store creation timestamp
  createdAt: { type: Date, default: Date.now }
});

export const DirectMessage = model<IDirectMessage>('DirectMessage', DirectMessageSchema);
