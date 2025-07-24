import { Schema, model, Document } from 'mongoose';

/**
 * Individual task belonging to a work package.
 */
export interface ITask extends Document {
  name: string;
  owner: string;
  start: Date;
  end: Date;
  hours: number;
  cost: number;
}

const TaskSchema = new Schema<ITask>({
  name: { type: String, required: true },
  owner: { type: String, required: true },
  start: Date,
  end: Date,
  hours: Number,
  cost: Number
});

export const Task = model<ITask>('Task', TaskSchema);
