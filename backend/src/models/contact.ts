import { Schema, model, Document } from 'mongoose';

/**
 * CRM contact entry.
 */
export interface IContact extends Document {
  name: string;
  email: string;
  phone: string;
  company?: string;
  notes?: string;
}

const ContactSchema = new Schema<IContact>({
  name: { type: String, required: true },
  email: { type: String, required: true },
  phone: { type: String, required: true },
  // Optional company the contact is associated with
  company: String,
  // Free form notes about the contact
  notes: String
});

export const Contact = model<IContact>('Contact', ContactSchema);
