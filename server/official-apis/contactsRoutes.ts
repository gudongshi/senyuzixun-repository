import { Router } from 'express';
import { createContactsProvider } from '../services/contacts/index.js';
import { EmployeeService } from '../services/employee_service.js';
import { DepartmentService } from '../services/department_service.js';
import type { CreateUserInput, UpdateUserInput } from '../services/contacts/interface.js';

const router: Router = Router();

// Build per-request service instances backed by the active contacts provider.
// To switch providers, edit server/services/contacts/index.ts.
function buildServices(req: any) {
  const provider = createContactsProvider(req);
  return {
    employeeService: new EmployeeService(provider),
    departmentService: new DepartmentService(provider),
  };
}

// ---- Employee routes ----

router.get('/employees/search', async (req: any, res) => {
  try {
    const { query, offset, limit } = req.query;
    const { employeeService } = buildServices(req);
    const result = await employeeService.search({
      query: (query as string) || '',
      offset: offset ? parseInt(offset as string) : undefined,
      limit: limit ? parseInt(limit as string) : undefined,
    });
    res.json({ success: true, data: result });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message || 'Failed to search employees' });
  }
});

router.get('/employees/me', async (req: any, res): Promise<void> => {
  try {
    const user = req.user;
    if (!user || !user.isAuthenticated) {
      res.status(401).json({ success: false, error: 'Unauthorized' });
      return;
    }
    res.json({
      success: true,
      data: {
        emp_id: user.emp_id,
        corp_id: user.corp_id,
        name: user.name,
        avatar: user.avatar,
        app_id: user.app_id,
      },
    });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message || 'Failed to get current user' });
  }
});

router.get('/employees/:id', async (req: any, res): Promise<void> => {
  try {
    const { employeeService } = buildServices(req);
    const employee = await employeeService.getById(req.params.id);
    if (!employee) {
      res.status(404).json({ success: false, error: 'Employee not found' });
      return;
    }
    res.json({ success: true, data: employee });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message || 'Failed to get employee' });
  }
});


// ---- Department routes ----

router.get('/departments', async (req: any, res) => {
  try {
    const { parent_id } = req.query;
    const { departmentService } = buildServices(req);
    const departments = await departmentService.list(parent_id as string | undefined);
    res.json({ success: true, data: departments });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message || 'Failed to list departments' });
  }
});

router.get('/departments/tree', async (req: any, res) => {
  try {
    const { departmentService } = buildServices(req);
    const tree = await departmentService.getTree();
    res.json({ success: true, data: tree });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message || 'Failed to get department tree' });
  }
});

router.get('/departments/:id', async (req: any, res): Promise<void> => {
  try {
    const { departmentService } = buildServices(req);
    const department = await departmentService.getById(req.params.id);
    if (!department) {
      res.status(404).json({ success: false, error: 'Department not found' });
      return;
    }
    res.json({ success: true, data: department });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message || 'Failed to get department' });
  }
});

router.get('/departments/:id/members', async (req: any, res) => {
  try {
    const { offset, limit } = req.query;
    const { employeeService } = buildServices(req);
    const result = await employeeService.listByDepartment(
      req.params.id,
      offset ? parseInt(offset as string) : undefined,
      limit ? parseInt(limit as string) : undefined,
    );
    res.json({ success: true, data: result });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message || 'Failed to list department members' });
  }
});

// ---- User management routes (Supabase only) ----
// Note: These routes throw 501 when DingtalkContactsProvider is active.

router.get('/users', async (req: any, res) => {
  try {
    const { offset, limit } = req.query;
    const provider = createContactsProvider(req);
    const result = await provider.listUsers(
      offset ? parseInt(offset as string) : undefined,
      limit ? parseInt(limit as string) : undefined,
    );
    res.json({ success: true, data: result });
  } catch (error: any) {
    const status = error.message?.includes('not supported') ? 501 : 500;
    res.status(status).json({ success: false, error: error.message || 'Failed to list users' });
  }
});

router.get('/users/:id', async (req: any, res): Promise<void> => {
  try {
    const provider = createContactsProvider(req);
    const user = await provider.getUserById(req.params.id);
    if (!user) {
      res.status(404).json({ success: false, error: 'User not found' });
      return;
    }
    res.json({ success: true, data: user });
  } catch (error: any) {
    const status = error.message?.includes('not supported') ? 501 : 500;
    res.status(status).json({ success: false, error: error.message || 'Failed to get user' });
  }
});

router.post('/users', async (req: any, res): Promise<void> => {
  try {
    const input: CreateUserInput = req.body;
    if (!input.email || !input.password || !input.name) {
      res.status(400).json({ success: false, error: 'email, password and name are required' });
      return;
    }
    // Inherit corp_id from authenticated user if not provided
    if (!input.corp_id) input.corp_id = req.user.corp_id;
    const provider = createContactsProvider(req);
    const user = await provider.createUser(input);
    res.status(201).json({ success: true, data: user });
  } catch (error: any) {
    const status = error.message?.includes('not supported') ? 501 : 500;
    res.status(status).json({ success: false, error: error.message || 'Failed to create user' });
  }
});

router.put('/users/:id', async (req: any, res) => {
  try {
    const input: UpdateUserInput = req.body;
    const provider = createContactsProvider(req);
    const user = await provider.updateUser(req.params.id, input);
    res.json({ success: true, data: user });
  } catch (error: any) {
    const status = error.message?.includes('not supported') ? 501 : 500;
    res.status(status).json({ success: false, error: error.message || 'Failed to update user' });
  }
});

router.delete('/users/:id', async (req: any, res) => {
  try {
    const provider = createContactsProvider(req);
    await provider.deleteUser(req.params.id);
    res.json({ success: true });
  } catch (error: any) {
    const status = error.message?.includes('not supported') ? 501 : 500;
    res.status(status).json({ success: false, error: error.message || 'Failed to delete user' });
  }
});

export default router;
