import { Schema, model, Document } from 'mongoose';

/**
 * Mini readme: Channel message model
 * ---------------------------------
 * Defines the schema for messages posted within chat channels. Each message
 * records its author, content, associated channel and creation timestamp so
 * pagination and ordering can be performed efficiently.
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
  /** Time the message was created */
  createdAt: Date;
}

const MessageSchema = new Schema<IMessage>({
  user: { type: String, required: true },
  text: { type: String, required: true },
  // Reference to the channel so queries can filter by room
  channel: { type: Schema.Types.ObjectId, ref: 'Channel', required: true },
  // Automatically store creation timestamp for ordering
  createdAt: { type: Date, default: Date.now }
});

export const Message = model<IMessage>('Message', MessageSchema);
