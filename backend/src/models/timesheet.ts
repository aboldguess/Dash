/**
 * @file Timesheet model.
 *
 * Purpose
 * -------
 * Defines how a user's daily logged hours are stored in MongoDB.
 *
 * Structure
 * ---------
 * - `ITimesheet` interface: TypeScript representation of a timesheet document.
 * - `TimesheetSchema`: Mongoose schema describing the persisted fields.
 * - `Timesheet` model: Mongoose model exposing CRUD helpers.
 *
 * Key Interactions
 * ----------------
 * - Utilised by `routes/timesheets.ts` for creating and retrieving records.
 * - Depends on an active Mongoose connection configured in `db.ts`.
 *
 * Assumptions
 * -----------
 * - `DB_URI` environment variable is set to a reachable MongoDB instance.
 * - The database connection is established before this model is imported.
 */
import { Schema, model, Document, Types } from 'mongoose';
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
