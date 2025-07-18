import { Schema, model, Document } from 'mongoose';

/**
 * Leave request record.
 */
export interface ILeave extends Document {
  userId: number;
  startDate: string;
  endDate: string;
  status: 'pending' | 'approved' | 'rejected';
}

const LeaveSchema = new Schema<ILeave>({
  userId: { type: Number, required: true },
  startDate: { type: String, required: true },
  endDate: { type: String, required: true },
  status: {
    type: String,
    enum: ['pending', 'approved', 'rejected'],
    default: 'pending'
  }
});

export const Leave = model<ILeave>('Leave', LeaveSchema);
