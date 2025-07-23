import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import { Role } from '../models/user';

export interface AuthRequest extends Request {
  user?: { id: string; username: string; role: Role; team?: string };
}

const JWT_SECRET = process.env.JWT_SECRET || 'secret';

/**
 * Middleware that validates the JWT from the Authorization header. The decoded
 * user information is attached to `req.user` for later handlers to access.
 */
export function authMiddleware(req: AuthRequest, res: Response, next: NextFunction) {
  const header = req.header('Authorization');
  const token = header?.replace('Bearer ', '');

  if (!token) {
    return res.status(401).json({ message: 'Authorization header missing' });
  }

  try {
    const payload = jwt.verify(token, JWT_SECRET) as {
      id: string;
      username: string;
      role: Role;
      team?: string;
    };
    req.user = {
      id: payload.id,
      username: payload.username,
      role: payload.role,
      team: payload.team
    };
    next();
  } catch (err) {
    return res.status(401).json({ message: 'Invalid token' });
  }
}

/**
 * Helper to enforce that the authenticated user has one of the given roles.
 * If the user's role is not allowed, a 403 response is returned.
 */
export function requireRole(roles: Role[]) {
  return (req: AuthRequest, res: Response, next: NextFunction) => {
    if (!req.user || !roles.includes(req.user.role)) {
      return res.status(403).json({ message: 'Forbidden' });
    }
    next();
  };
}
