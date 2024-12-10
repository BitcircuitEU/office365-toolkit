import express, { Request, Response } from 'express';
import ensureAuthenticated from '../middleware/auth';
import AuthProvider from '../context/AuthContext';

const router = express.Router();

// Extend the Request interface to include custom properties
interface CustomRequest extends Request {
  authProvider?: AuthProvider;
}

router.get('/', (req: CustomRequest, res: Response) => {
  if (req.authProvider?.isAuthenticated) {
    res.redirect('/dashboard');
  } else {
    res.render('login');
  }
});

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

router.get('/pst/manager', ensureAuthenticated, (req: Request, res: Response) => {
  res.render('pst/manager', { currentPage: 'pst/manager' });
});

router.get('/pst/migrator', ensureAuthenticated, (req: Request, res: Response) => {
  res.render('pst/migrator', { currentPage: 'pst/migrator' });
});

router.get('/pst/bulkmigrator', ensureAuthenticated, (req: Request, res: Response) => {
  res.render('pst/bulkmigrator', { currentPage: 'pst/bulkmigrator' });
});



export default router;