import { Schema, model, Document, Types } from 'mongoose';
import { IWorkPackage, WorkPackage } from './workPackage';

/**
 * Work project information including nested work packages and tasks.
 */
export interface IProject extends Document {
  name: string;
  description?: string;
  owner: string;
  start: Date;
  end: Date;
  hours: number;
  cost: number;
  status: 'todo' | 'in-progress' | 'done';
  workPackages: Types.DocumentArray<IWorkPackage>;
}

const ProjectSchema = new Schema<IProject>({
  name: { type: String, required: true },
  description: String,
  owner: { type: String, required: true },
  start: Date,
  end: Date,
  hours: Number,
  cost: Number,
  status: {
    type: String,
    enum: ['todo', 'in-progress', 'done'],
    default: 'todo'
  },
  workPackages: [WorkPackage.schema]
});

export const Project = model<IProject>('Project', ProjectSchema);
