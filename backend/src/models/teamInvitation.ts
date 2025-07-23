import { Schema, model, Document, Types } from 'mongoose';

/**
 * Invitation token that allows a specific email to join a team.
 */
export interface ITeamInvitation extends Document {
  email: string;
  team: Types.ObjectId;
  token: string;
}

// Stores invitations for onboarding new members
const InvitationSchema = new Schema<ITeamInvitation>({
  email: { type: String, required: true },
  team: { type: Schema.Types.ObjectId, ref: 'Team', required: true },
  token: { type: String, required: true, unique: true }
});

export const TeamInvitation = model<ITeamInvitation>('TeamInvitation', InvitationSchema);
