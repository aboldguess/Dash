import mongoose from 'mongoose';
import dotenv from 'dotenv';

dotenv.config();

/**
 * Establishes a connection to the MongoDB database using the
 * `DB_URI` environment variable. The connection promise is returned
 * so callers can await readiness before starting the server.
 */
export async function connectDB(): Promise<typeof mongoose> {
  const uri = process.env.DB_URI;
  if (!uri) {
    throw new Error('DB_URI environment variable not set');
  }

  // `mongoose.connect` handles establishing the connection pool.
  return mongoose.connect(uri);
}
