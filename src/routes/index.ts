import express from 'express';
import mainRoutes from './routes';
import pstRoutes from './pst';
import mailboxRoutes from './mailbox';

const router = express.Router();

router.use(mainRoutes);
router.use(pstRoutes);
router.use(mailboxRoutes);

export default router;