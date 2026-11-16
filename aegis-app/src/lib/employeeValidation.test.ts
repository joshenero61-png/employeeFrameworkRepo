import { describe, expect, it } from 'vitest'
import { employeeFormSchema } from './employeeValidation'

const validEmployee = {
  first_name: 'Ada',
  last_name: 'Lovelace',
  email: 'ada@example.com',
  phone: '',
  department_id: '11111111-1111-4111-8111-111111111111',
  position_id: '22222222-2222-4222-8222-222222222222',
  manager_id: '',
  hire_date: '2026-01-10',
}

describe('employeeFormSchema', () => {
  it('accepts a valid employee record with no manager', () => {
    expect(employeeFormSchema.safeParse(validEmployee).success).toBe(true)
  })

  it('trims required names and email input', () => {
    const result = employeeFormSchema.parse({
      ...validEmployee,
      first_name: ' Ada ',
      last_name: ' Lovelace ',
      email: ' ada@example.com ',
    })
    expect(result.first_name).toBe('Ada')
    expect(result.last_name).toBe('Lovelace')
    expect(result.email).toBe('ada@example.com')
  })

  it('rejects a blank first or last name', () => {
    expect(employeeFormSchema.safeParse({ ...validEmployee, first_name: ' ' }).success).toBe(false)
    expect(employeeFormSchema.safeParse({ ...validEmployee, last_name: '' }).success).toBe(false)
  })

  it('rejects malformed email addresses', () => {
    expect(employeeFormSchema.safeParse({ ...validEmployee, email: 'not-an-email' }).success).toBe(false)
  })

  it('requires valid department and position identifiers', () => {
    expect(employeeFormSchema.safeParse({ ...validEmployee, department_id: '' }).success).toBe(false)
    expect(employeeFormSchema.safeParse({ ...validEmployee, position_id: 'position-1' }).success).toBe(false)
  })

  it('allows an empty manager or a valid manager identifier', () => {
    expect(employeeFormSchema.safeParse(validEmployee).success).toBe(true)
    expect(employeeFormSchema.safeParse({
      ...validEmployee,
      manager_id: '33333333-3333-4333-8333-333333333333',
    }).success).toBe(true)
  })

  it('rejects impossible calendar dates', () => {
    expect(employeeFormSchema.safeParse({ ...validEmployee, hire_date: '2026-02-30' }).success).toBe(false)
  })
})
