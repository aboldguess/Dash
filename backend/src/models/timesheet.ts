import { Schema, model, Document, Types } from 'mongoose';

/**
 * Timesheet Model
 * ----------------
 * Stores the number of hours a user logs for a specific calendar day.
 *
 * Structure
 *  - `ITimesheet` interface describing the TypeScript shape.
 *  - `TimesheetSchema` defining the MongoDB document schema.
 *  - `Timesheet` Mongoose model for database interactions.
 */
export interface ITimesheet extends Document {
  user: Types.ObjectId; // reference to the user who logged the hours
  hours: number;        // number of hours worked
  date: Date;           // date for which the hours are recorded
}

const TimesheetSchema = new Schema<ITimesheet>({
  user: { type: Schema.Types.ObjectId, ref: 'User', required: true },
  hours: { type: Number, required: true },
  date: { type: Date, required: true }
});

export const Timesheet = model<ITimesheet>('Timesheet', TimesheetSchema);
