import { Schema, model, Document } from 'mongoose';

/**
 * Work project information.
 */
export interface IProject extends Document {
  name: string;
  description?: string;
  status: 'todo' | 'in-progress' | 'done';
}

const ProjectSchema = new Schema<IProject>({
  name: { type: String, required: true },
  description: String,
  status: {
    type: String,
    enum: ['todo', 'in-progress', 'done'],
    default: 'todo'
  }
});

export const Project = model<IProject>('Project', ProjectSchema);
