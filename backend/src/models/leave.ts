import { Schema, model, Document, Types } from 'mongoose';

/**
 * Leave Model
 * -----------
 * Represents a request by a user to take leave within a specific date range.
 *
 * Structure
 *  - `ILeave` interface for TypeScript consumers.
 *  - `LeaveSchema` defining the MongoDB schema.
 *  - `Leave` Mongoose model used for database operations.
 */
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
