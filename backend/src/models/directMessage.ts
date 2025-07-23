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
  /** Whether the recipient has displayed the message */
  isSeen: boolean;
}

const DirectMessageSchema = new Schema<IDirectMessage>({
  from: { type: String, required: true },
  to: { type: String, required: true },
  text: { type: String, required: true },
  // Automatically store creation timestamp
  createdAt: { type: Date, default: Date.now },
  // Track whether the message has been shown on the recipient's screen
  isSeen: { type: Boolean, default: false }
});

export const DirectMessage = model<IDirectMessage>('DirectMessage', DirectMessageSchema);
