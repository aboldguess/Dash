import { Schema, model, Document } from 'mongoose';
import { IPlan } from './plan';

/**
 * Team represents a company workspace. Members within a team
 * can see each other and collaborate.
 */
export interface ITeam extends Document {
  /** Display name of the team */
  name: string;
  /** Email domains automatically mapped to this team */
  domains: string[];
  /** Number of licensed seats available */
  seats: number;
  /** Subscription plan applied to this team */
  plan?: IPlan['_id'];
}

// Schema defining the team structure
const TeamSchema = new Schema<ITeam>({
  name: { type: String, required: true, unique: true },
  // Domains let the sign up process auto-assign users based on their email
  domains: [{ type: String }],
  // Track how many named seats the team has purchased
  seats: { type: Number, default: 5 },
  // Reference to the subscription plan governing this team
  plan: { type: Schema.Types.ObjectId, ref: 'Plan' }
});

export const Team = model<ITeam>('Team', TeamSchema);
