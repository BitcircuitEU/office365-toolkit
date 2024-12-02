import { Request, Response, NextFunction } from 'express';
import AuthProvider from '../context/AuthContext';

// Extend the Request interface to include custom properties
interface CustomRequest extends Request {
  authProvider?: AuthProvider;
}

function ensureAuthenticated(req: CustomRequest, res: Response, next: NextFunction): void {
  if (req.authProvider && req.authProvider.isAuthenticated) {
    return next();
  }
  res.redirect('/'); // Redirect to login page if not authenticated
}

export default ensureAuthenticated;