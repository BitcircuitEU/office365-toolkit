import express from 'express';
import views from './views';
import graphRoutes from './graph';
import pstRoutes from './pst';

const router = express.Router();

router.use(views);
router.use(graphRoutes);
router.use(pstRoutes);

export default router;