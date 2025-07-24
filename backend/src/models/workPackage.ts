import { Schema, model, Document, Types } from 'mongoose';
import { ITask, Task } from './task';

/**
 * Work package groups multiple tasks under a project.
 */
export interface IWorkPackage extends Document {
  name: string;
  owner: string;
  start: Date;
  end: Date;
  hours: number;
  cost: number;
  tasks: Types.Array<ITask>;
}

const WorkPackageSchema = new Schema<IWorkPackage>({
  name: { type: String, required: true },
  owner: { type: String, required: true },
  start: Date,
  end: Date,
  hours: Number,
  cost: Number,
  tasks: [Task.schema]
});

export const WorkPackage = model<IWorkPackage>('WorkPackage', WorkPackageSchema);
