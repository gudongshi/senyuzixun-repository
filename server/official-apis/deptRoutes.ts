import { Router } from 'express';
import { createContactsProvider } from '../services/contacts/index.js';
import { DepartmentService } from '../services/department_service.js';

const router: Router = Router();

/**
 * GET /api/depts/tree
 * Get department tree (lazy-loaded by deptId).
 * Query params: deptId (default -1)
 */
router.get('/tree', async (req: any, res) => {
  try {
    const provider = createContactsProvider(req);
    const service = new DepartmentService(provider);
    const { deptId } = req.query;
    const result = await service.getTree((deptId as string) || '-1');
    res.json({ success: true, data: result });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message || 'Failed to get dept tree' });
  }
});

/**
 * GET /api/depts/search
 * Search departments by keyword.
 * Query params: key, offset (default 0), limit (default 50)
 */
router.get('/search', async (req: any, res) => {
  try {
    const provider = createContactsProvider(req);
    const service = new DepartmentService(provider);
    const { key, offset, limit } = req.query;
    const result = await service.search(
      (key as string) || '',
      offset ? parseInt(offset as string) : 0,
      limit ? parseInt(limit as string) : 50,
    );
    res.json({ success: true, data: result });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message || 'Failed to search depts' });
  }
});

/**
 * GET /api/depts/:deptId
 * Get department info by ID.
 */
router.get('/:deptId', async (req: any, res) => {
  try {
    const provider = createContactsProvider(req);
    const service = new DepartmentService(provider);
    const result = await service.getById(req.params.deptId);
    if (!result) {
      return res.status(404).json({ success: false, error: 'Department not found' });
    }
    res.json({ success: true, data: result });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message || 'Failed to get department' });
  }
});

export default router;
