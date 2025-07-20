import { Schema, model, Document } from 'mongoose';

/**
 * Optional association to the channel this message belongs to.
 */
import { IChannel } from './channel';

/**
 * Chat message sent by a user.
 */
export interface IMessage extends Document {
  /** Username of the sender */
  user: string;
  /** Message contents */
  text: string;
  /** Channel association */
  channel: Schema.Types.ObjectId | IChannel;
}

const MessageSchema = new Schema<IMessage>({
  user: { type: String, required: true },
  text: { type: String, required: true },
  // Reference to the channel so queries can filter by room
  channel: { type: Schema.Types.ObjectId, ref: 'Channel', required: true }
});

export const Message = model<IMessage>('Message', MessageSchema);
