import { Schema, model, Document } from 'mongoose';

/**
 * Chat message sent by a user.
 */
export interface IMessage extends Document {
  user: string;
  text: string;
}

const MessageSchema = new Schema<IMessage>({
  user: { type: String, required: true },
  text: { type: String, required: true }
});

export const Message = model<IMessage>('Message', MessageSchema);
