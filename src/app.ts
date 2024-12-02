import express, { Request, Response, NextFunction } from 'express';
import bodyParser from 'body-parser';
import path from 'path';
import fs from 'fs';
import session from 'express-session';
import routes from './routes';
import AuthProvider from './context/AuthContext';
import ensureAuthenticated from './middleware/auth'; // Import the middleware

const app = express();

const pstFolderPath = path.join(__dirname, '..', 'pst');
if (!fs.existsSync(pstFolderPath)) {
  fs.mkdirSync(pstFolderPath);
}

app.set('view engine', 'ejs');
app.use(express.static(path.join(__dirname, 'public')));
app.use(bodyParser.json({ limit: '50mb' }));
app.use(bodyParser.urlencoded({ limit: '50mb', extended: true }));

// Session middleware
app.use(session({
  secret: '8f7d3b2a1e6c9f0a4d5e2b7c8a3f6d9e0b1c4a7f2e5d8b3a6c9f0e1d4a7b2c5f8',
  resave: false,
  saveUninitialized: true,
  cookie: { secure: false }
}));

// Extend the Request interface to include custom properties
interface CustomRequest extends Request {
  authProvider?: AuthProvider;
  session: any; // You might want to define a more specific type for your session
}

// Middleware to initialize authentication
app.use((req: CustomRequest, res: Response, next: NextFunction) => {
  req.authProvider = new AuthProvider(req.session);
  res.locals.isAuthenticated = req.session.isAuthenticated;
  res.locals.organizationName = req.session.organizationName;
  next();
});

app.use(async (req: CustomRequest, res: Response, next: NextFunction) => {
  if (req.authProvider) {
    await req.authProvider.initialize();
    res.locals.isAuthenticated = req.authProvider.isAuthenticated;
  }
  res.locals.organizationName = req.session.organizationName;
  next();
});

// Use the routes
app.use(routes);

app.get('/', (req: CustomRequest, res: Response) => {
  if (req.authProvider?.isAuthenticated) {
    res.redirect('/dashboard');
  } else {
    res.render('login');
  }
});

// Protect the dashboard route
app.get('/dashboard', ensureAuthenticated, (req: CustomRequest, res: Response) => {
  res.render('dashboard');
});

app.listen(3000, () => {
  console.log('Server is running on http://127.0.0.1:3000');
});