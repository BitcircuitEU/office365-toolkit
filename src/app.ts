// Imports
import express, { Request, Response, NextFunction } from 'express';
import bodyParser from 'body-parser';
import path from 'path';
import fs from 'fs';
import session from 'express-session';
import http from 'http';
import routes from './routes';
import AuthProvider from './context/AuthContext';
import ensureAuthenticated from './middleware/auth';
import { initializeLicenseMap } from './utils/licenseMapper';
import config from './config';
import { setupSocket } from './socket';

// Interfaces
interface CustomRequest extends Request {
  authProvider?: AuthProvider;
  session: any;
}

// Variables
const app = express();
const server = http.createServer(app);

const pstFolderPath = path.join(__dirname, 'pst');
if (!fs.existsSync(pstFolderPath)) {
  fs.mkdirSync(pstFolderPath);
}

setupSocket(server);

// Express SET
app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));

// Express USE
app.use(express.static(path.join(__dirname, 'public')));
app.use(bodyParser.json({ limit: '50mb' }));
app.use(bodyParser.urlencoded({ limit: '50mb', extended: true }));

app.use(session({
  secret: '8f7d3b2a1e6c9f0a4d5e2b7c8a3f6d9e0b1c4a7f2e5d8b3a6c9f0e1d4a7b2c5f8',
  resave: false,
  saveUninitialized: true,
  cookie: { secure: false }
}));

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

app.use('/socket.io', express.static(path.join(__dirname, 'node_modules/socket.io/client-dist')));

app.use(routes);

// Express GET
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

async function startServer() {
  await initializeLicenseMap();
  
  server.listen(config.port, () => {
    console.log(`Server läuft auf http://127.0.0.1:${config.port}`);
  });
}

startServer().catch(console.error);