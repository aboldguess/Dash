/**
 * @fileoverview Subscription plan definition.
 *
 * Mini-README
 * ------------
 * Defines the structure used to store available subscription tiers.
 * Global administrators may create and manage these plans which specify
 * limits and enabled modules for teams.
 *
 * Structure
 * 1. Declare TypeScript interface `IPlan` representing a plan document.
 * 2. Build the Mongoose schema with fields:
 *    - `name` Unique plan name
 *    - `maxTeamSize` Maximum number of users allowed
 *    - `price` Monthly price in cents (placeholder for billing)
 *    - `modules` Array of enabled module identifiers
 * 3. Export the compiled model for use throughout the backend.
 */
import { Schema, model, Document } from 'mongoose';

/** Subscription tier information */
export interface IPlan extends Document {
  /** Display name */
  name: string;
  /** Maximum number of users that can belong to a team on this plan */
  maxTeamSize: number;
  /** Price in cents */
  price: number;
  /** List of enabled modules */
  modules: string[];
}

const PlanSchema = new Schema<IPlan>({
  name: { type: String, required: true, unique: true },
  maxTeamSize: { type: Number, required: true },
  price: { type: Number, required: true },
  modules: [{ type: String }]
});

export const Plan = model<IPlan>('Plan', PlanSchema);
