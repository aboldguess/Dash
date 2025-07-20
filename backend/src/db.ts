import mongoose from 'mongoose';
import dotenv from 'dotenv';
import path from 'path';

// Load environment variables from the backend root regardless of the current
// working directory. This ensures the configuration is found when running the
// compiled JavaScript from the `dist` directory.
dotenv.config({ path: path.resolve(__dirname, '..', '.env') });

/**
 * Establishes a connection to the MongoDB database using the
 * `DB_URI` environment variable. The connection promise is returned
 * so callers can await readiness before starting the server.
 */
export async function connectDB(): Promise<typeof mongoose> {
  // The connection string to MongoDB. If `DB_URI` is missing, a clear error is
  // thrown so developers know they must configure the variable.
  const uri = process.env.DB_URI;
  if (!uri) {
    throw new Error('DB_URI environment variable not set');
  }

  // `mongoose.connect` handles establishing the connection pool.
  return mongoose.connect(uri);
}
