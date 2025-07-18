import { Schema, model, Document } from 'mongoose';

/**
 * High level program grouping one or more projects.
 */
export interface IProgram extends Document {
  name: string;
  owner: string;
}

const ProgramSchema = new Schema<IProgram>({
  name: { type: String, required: true },
  owner: { type: String, required: true }
});

export const Program = model<IProgram>('Program', ProgramSchema);
