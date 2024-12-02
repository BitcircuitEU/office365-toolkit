import express, { Request, Response } from 'express';
import ensureAuthenticated from '../middleware/auth';
import AuthProvider from '../context/AuthContext';

const router = express.Router();

// Extend the Request interface to include custom properties
interface CustomRequest extends Request {
  authProvider?: AuthProvider;
}

router.post('/login', async (req: CustomRequest, res: Response) => {
  const { tenantid, clientid, clientsecret } = req.body;
  const success = await req.authProvider?.login(tenantid, clientid, clientsecret);
  
  if (success) {
    res.redirect('/dashboard');
  } else {
    res.render('login', { error: 'Invalid credentials' });
  }
});

router.get('/logout', (req: CustomRequest, res: Response) => {
  req.authProvider?.logout();
  res.redirect('/');
});

router.get('/dashboard', ensureAuthenticated, (req: CustomRequest, res: Response) => {
  res.render('dashboard', { currentPage: 'dashboard' });
});

router.get('/pubmigration', ensureAuthenticated, (req: CustomRequest, res: Response) => {
  res.render('pubmigration', { currentPage: 'pubmigration' });
});

export default router;