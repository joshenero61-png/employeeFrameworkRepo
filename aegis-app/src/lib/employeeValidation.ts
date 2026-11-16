import { z } from 'zod'

const dateOnly = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Enter a valid date.').refine((value) => {
  const date = new Date(`${value}T00:00:00.000Z`)
  return !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === value
}, 'Enter a real calendar date.')

export const employeeFormSchema = z.object({
  first_name: z.string().trim().min(1, 'First name is required.'),
  last_name: z.string().trim().min(1, 'Last name is required.'),
  email: z.string().trim().email('Enter a valid email address.'),
  phone: z.string().trim(),
  department_id: z.string().uuid('Choose a department.'),
  position_id: z.string().uuid('Choose a position.'),
  manager_id: z.union([z.string().uuid(), z.literal('')]),
  hire_date: dateOnly,
  termination_date: z.union([dateOnly, z.literal('')]),
  status: z.enum(['active', 'on_leave', 'terminated']),
}).superRefine((values, context) => {
  if (values.termination_date && values.termination_date < values.hire_date) {
    context.addIssue({
      code: 'custom',
      message: 'Termination date cannot be earlier than the hire date.',
      path: ['termination_date'],
    })
  }
})

export type EmployeeForm = z.infer<typeof employeeFormSchema>
