import { Schema, model, Document } from 'mongoose';

/**
 * Hours logged by a user for a specific date.
 */
export interface ITimesheet extends Document {
  userId: number;
  hours: number;
  date: string;
}

const TimesheetSchema = new Schema<ITimesheet>({
  userId: { type: Number, required: true },
  hours: { type: Number, required: true },
  date: { type: String, required: true }
});

export const Timesheet = model<ITimesheet>('Timesheet', TimesheetSchema);
