/**
 * @file Leave model.
 *
 * Purpose
 * -------
 * Captures a user's request to take leave over a defined date range.
 *
 * Structure
 * ---------
 * - `ILeave` interface: TypeScript shape of a leave document.
 * - `LeaveSchema`: Mongoose schema mapping model fields to MongoDB.
 * - `Leave` model: Exported Mongoose model for interacting with the collection.
 *
 * Key Interactions
 * ----------------
 * - Used by `routes/leaves.ts` for CRUD operations on leave requests.
 * - Requires an active Mongoose connection established in `db.ts`.
 *
 * Assumptions
 * -----------
 * - `DB_URI` environment variable points to the MongoDB instance.
 * - A database connection is created prior to importing this module.
 */
import { Schema, model, Document, Types } from 'mongoose';
export interface ILeave extends Document {
  user: Types.ObjectId;          // reference to the requesting user
  startDate: Date;               // first day of leave
  endDate: Date;                 // last day of leave
  status: 'pending' | 'approved' | 'rejected'; // approval status
}

const LeaveSchema = new Schema<ILeave>({
  user: { type: Schema.Types.ObjectId, ref: 'User', required: true },
  startDate: { type: Date, required: true },
  endDate: { type: Date, required: true },
  status: {
    type: String,
    enum: ['pending', 'approved', 'rejected'],
    default: 'pending'
  }
});

export const Leave = model<ILeave>('Leave', LeaveSchema);
