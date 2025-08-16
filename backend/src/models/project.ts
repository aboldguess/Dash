import { Schema, model, Document, Types } from 'mongoose';
import { IWorkPackage, WorkPackage } from './workPackage';

/**
 * Mini readme: Project model
 * -------------------------
 * Represents a work project owned by a specific team. Projects contain nested
 * work packages and tasks and track scheduling and cost information.
 */
export interface IProject extends Document {
  name: string;
  description?: string;
  owner: string;
  start: Date;
  end: Date;
  hours: number;
  cost: number;
  billable: boolean; // whether project time is billable
  status: 'todo' | 'in-progress' | 'done';
  team: Types.ObjectId; // team that owns the project
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
  billable: { type: Boolean, default: true },
  status: {
    type: String,
    enum: ['todo', 'in-progress', 'done'],
    default: 'todo'
  },
  team: { type: Schema.Types.ObjectId, ref: 'Team', required: true },
  workPackages: [WorkPackage.schema]
});

export const Project = model<IProject>('Project', ProjectSchema);
