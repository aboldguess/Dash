import { Schema, model, Document } from 'mongoose';

/**
 * Configuration values stored as key/value pairs.
 * This allows runtime settings to be changed by admins
 * without modifying environment variables.
 */
export interface IConfig extends Document {
  key: string;
  value: string;
}

const ConfigSchema = new Schema<IConfig>({
  key: { type: String, required: true, unique: true },
  value: { type: String, required: true }
});

export const Config = model<IConfig>('Config', ConfigSchema);
