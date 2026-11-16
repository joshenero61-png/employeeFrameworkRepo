import { useMemo, useState, type FormEvent } from 'react'
import { Link } from 'react-router-dom'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useAuth } from '../auth/AuthContext'
import { supabase } from '../lib/supabase'
import { employeeFormSchema, type EmployeeForm } from '../lib/employeeValidation'
import type { Tables, TablesInsert, TablesUpdate } from '../types/database.types'

type Employee = Tables<'employees'>
type EmployeeListItem = Pick<Employee, 'id' | 'first_name' | 'last_name' | 'department_id' | 'position_id' | 'hire_date' | 'status'> &
  Partial<Pick<Employee, 'email' | 'phone' | 'manager_id'>>
type Department = Pick<Tables<'departments'>, 'id' | 'name'>
type Position = Pick<Tables<'positions'>, 'id' | 'department_id' | 'title' | 'is_active'>
type EmployeeOption = Pick<Employee, 'id' | 'first_name' | 'last_name'>

function getLocalDate() {
  const date = new Date()
  const year = date.getFullYear()
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}

const emptyForm: EmployeeForm = {
  first_name: '',
  last_name: '',
  email: '',
  phone: '',
  department_id: '',
  position_id: '',
  manager_id: '',
  hire_date: getLocalDate(),
}

const statusLabels: Record<Employee['status'], string> = {
  active: 'Active',
  on_leave: 'On leave',
  terminated: 'Terminated',
}

function getClient() {
  if (!supabase) throw new Error('Supabase is not configured.')
  return supabase
}

export default function EmployeesPage() {
  const { roles, session, signOut } = useAuth()
  const queryClient = useQueryClient()
  const canManage = roles.includes('admin') || roles.includes('hr_manager')
  const [search, setSearch] = useState('')
  const [page, setPage] = useState(0)
  const pageSize = 25
  const normalizedSearch = search.trim().replace(/[^\p{L}\p{N}@ .'-]/gu, '').slice(0, 80)
  const [formOpen, setFormOpen] = useState(false)
  const [editing, setEditing] = useState<EmployeeListItem | null>(null)
  const [form, setForm] = useState<EmployeeForm>(emptyForm)
  const [formError, setFormError] = useState<string | null>(null)
  const [saveError, setSaveError] = useState<string | null>(null)

  const employeesQuery = useQuery({
    queryKey: ['employees', session?.user.id ?? null, canManage, roles.join(','), page, normalizedSearch],
    queryFn: async () => {
      const client = getClient()
      if (canManage) {
        let query = client.from('employees')
          .select('id, first_name, last_name, email, phone, department_id, position_id, manager_id, hire_date, status', { count: 'exact' })
          .order('last_name')
          .order('first_name')
        if (normalizedSearch) {
          query = query.or(`first_name.ilike.%${normalizedSearch}%,last_name.ilike.%${normalizedSearch}%,email.ilike.%${normalizedSearch}%`)
        }
        const { data, error, count } = await query.range(page * pageSize, (page + 1) * pageSize - 1)
        if (error) throw error
        return { rows: (data ?? []) as EmployeeListItem[], totalCount: count ?? 0 }
      }

      const { data, error } = await client.rpc('get_employee_directory', {
        p_limit: pageSize,
        p_offset: page * pageSize,
        p_search: normalizedSearch || null,
      })
      if (error) throw error
      const rows = (data ?? []).map((employee) => ({ id: employee.id, first_name: employee.first_name, last_name: employee.last_name, department_id: employee.department_id, position_id: employee.position_id, hire_date: employee.hire_date, status: employee.status }))
      return { rows, totalCount: data?.[0]?.total_count ?? 0 }
    },
  })

  const departmentsQuery = useQuery({
    queryKey: ['departments'],
    queryFn: async () => {
      const { data, error } = await getClient().from('departments').select('id, name').order('name')
      if (error) throw error
      return data as Department[]
    },
  })

  const positionsQuery = useQuery({
    queryKey: ['positions'],
    queryFn: async () => {
      const { data, error } = await getClient().from('positions').select('id, department_id, title, is_active').order('title')
      if (error) throw error
      return data as Position[]
    },
  })
  const managersQuery = useQuery({
    queryKey: ['employee-manager-options', session?.user.id ?? null],
    enabled: canManage,
    queryFn: async () => {
      const { data, error } = await getClient()
        .from('employees')
        .select('id, first_name, last_name')
        .order('last_name')
        .order('first_name')
        .limit(500)
      if (error) throw error
      return (data ?? []) as EmployeeOption[]
    },
  })


  const saveEmployee = useMutation({
    mutationFn: async (values: EmployeeForm) => {
      const parsed = employeeFormSchema.safeParse(values)
      if (!parsed.success) throw new Error(parsed.error.issues[0]?.message ?? 'Check the employee details.')
      const payload: TablesUpdate<'employees'> = {
        first_name: parsed.data.first_name,
        last_name: parsed.data.last_name,
        email: parsed.data.email.toLowerCase(),
        phone: parsed.data.phone || null,
        department_id: parsed.data.department_id,
        position_id: parsed.data.position_id,
        manager_id: parsed.data.manager_id || null,
        hire_date: parsed.data.hire_date,
      }

      if (editing) {
        const { data, error } = await getClient()
          .from('employees')
          .update(payload)
          .eq('id', editing.id)
          .select('id')
          .maybeSingle()
        if (error) throw error
        if (!data) throw new Error('No employee record was updated. Your role may not have permission to make this change.')
      } else {
        const { error } = await getClient().from('employees').insert(payload as TablesInsert<'employees'>)
        if (error) throw error
      }
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['employees'] })
      setFormOpen(false)
      setEditing(null)
      setForm(emptyForm)
      setFormError(null)
      setSaveError(null)
    },
    onError: (error) => setSaveError(error instanceof Error ? error.message : 'Unable to save the employee record.'),
  })

  const departments = departmentsQuery.data ?? []
  const positions = positionsQuery.data ?? []
  const employees = employeesQuery.data?.rows ?? []
  const managerOptions = managersQuery.data ?? []
  const totalCount = employeesQuery.data?.totalCount ?? 0
  const totalPages = Math.ceil(totalCount / pageSize)
  const firstVisible = totalCount === 0 ? 0 : page * pageSize + 1
  const lastVisible = Math.min((page + 1) * pageSize, totalCount)
  const departmentNames = useMemo(() => new Map(departments.map((item) => [item.id, item.name])), [departments])
  const positionNames = useMemo(() => new Map(positions.map((item) => [item.id, item.title])), [positions])

  function openCreateForm() {
    setEditing(null)
    setForm(emptyForm)
    setFormError(null)
    setSaveError(null)
    setFormOpen(true)
  }

  function openEditForm(employee: EmployeeListItem) {
    setEditing(employee)
    setForm({
      first_name: employee.first_name,
      last_name: employee.last_name,
      email: employee.email ?? '',
      phone: employee.phone ?? '',
      department_id: employee.department_id,
      position_id: employee.position_id,
      manager_id: employee.manager_id ?? '',
      hire_date: employee.hire_date,
    })
    setFormError(null)
    setSaveError(null)
    setFormOpen(true)
  }

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setFormError(null)
    setSaveError(null)
    const parsed = employeeFormSchema.safeParse(form)
    if (!parsed.success) {
      setFormError(parsed.error.issues[0]?.message ?? 'Check the employee details.')
      return
    }
    saveEmployee.mutate(parsed.data)
  }

  async function handleSignOut() {
    try {
      await signOut()
      queryClient.clear()
    } catch (error) {
      setSaveError(error instanceof Error ? error.message : 'Unable to sign out.')
    }
  }

  return (
    <main className="workspace">
      <header className="topbar">
        <div className="brand-lockup"><span className="brand-mark">A</span><span>AEGIS</span></div>
        <div className="topbar-right">
          <Link className="text-button" to="/">Overview</Link>
          <span className="workspace-label">HRIS WORKSPACE</span>
          <button className="text-button" onClick={() => void handleSignOut()}>Sign out</button>
        </div>
      </header>

      <section className="workspace-content">
        <div className="page-heading">
          <div>
            <p className="eyebrow">PEOPLE · HRIS</p>
            <h1>Employee directory</h1>
            <p className="page-subtitle">Search employee records and maintain organization assignments.</p>
          </div>
          {canManage && <button className="primary-button compact-button" onClick={openCreateForm}>Add employee <span>+</span></button>}
        </div>

        {saveError && <p className="form-error" role="alert">{saveError}</p>}

        {formOpen && canManage && (
          <section className="account-panel employee-form-panel">
            <div className="panel-heading">
              <div>
                <p className="eyebrow">{editing ? 'UPDATE RECORD' : 'NEW RECORD'}</p>
                <h2>{editing ? 'Edit employee' : 'Add employee'}</h2>
              </div>
              <button className="text-button" type="button" onClick={() => setFormOpen(false)}>Close</button>
            </div>
            <form className="employee-form" onSubmit={handleSubmit}>
              <div className="employee-field-grid">
                <label>First name<input required value={form.first_name} onChange={(event) => setForm({ ...form, first_name: event.target.value })} /></label>
                <label>Last name<input required value={form.last_name} onChange={(event) => setForm({ ...form, last_name: event.target.value })} /></label>
                <label>Email address<input required type="email" value={form.email} onChange={(event) => setForm({ ...form, email: event.target.value })} /></label>
                <label>Phone number<input value={form.phone} onChange={(event) => setForm({ ...form, phone: event.target.value })} /></label>
                <label>Department
                  <select required value={form.department_id} onChange={(event) => setForm({ ...form, department_id: event.target.value, position_id: '' })}>
                    <option value="">Select department</option>
                    {departments.map((department) => <option key={department.id} value={department.id}>{department.name}</option>)}
                  </select>
                </label>
                <label>Position
                  <select required value={form.position_id} onChange={(event) => setForm({ ...form, position_id: event.target.value })} disabled={!form.department_id}>
                    <option value="">Select position</option>
                    {positions.filter((position) => position.department_id === form.department_id && (position.is_active || position.id === form.position_id)).map((position) => <option key={position.id} value={position.id}>{position.title}{position.is_active ? '' : ' (inactive)'}</option>)}
                  </select>
                </label>
                <label>Manager
                  <select value={form.manager_id} disabled={managersQuery.isPending || managersQuery.isError} onChange={(event) => setForm({ ...form, manager_id: event.target.value })}>
                    <option value="">{managersQuery.isPending ? 'Loading managers…' : 'No manager assigned'}</option>
                    {managerOptions.filter((employee) => employee.id !== editing?.id).map((employee) => <option key={employee.id} value={employee.id}>{employee.first_name} {employee.last_name}</option>)}
                  </select>
                </label>
                <label>Hire date<input required type="date" value={form.hire_date} onChange={(event) => setForm({ ...form, hire_date: event.target.value })} /></label>
              </div>
              {formError && <p className="form-error" role="alert">{formError}</p>}
              <div className="employee-form-actions">
                <button className="secondary-button" type="button" onClick={() => setFormOpen(false)}>Cancel</button>
                <button className="primary-button compact-button" type="submit" disabled={saveEmployee.isPending}>
                  {saveEmployee.isPending ? 'Saving…' : editing ? 'Save changes' : 'Create employee'}
                </button>
              </div>
            </form>
          </section>
        )}

        <section className="account-panel employee-list-panel">
          <div className="employee-list-toolbar">
            <div>
              <p className="eyebrow">DIRECTORY</p>
              <h2>{employeesQuery.isPending ? 'Loading employees…' : `${totalCount} employee${totalCount === 1 ? '' : 's'}`}</h2>
            </div>
            <input className="employee-search" type="search" placeholder={canManage ? 'Search by name or email…' : 'Search by name…'} value={search} onChange={(event) => { setSearch(event.target.value); setPage(0) }} aria-label="Search employees" />
          </div>

          {(employeesQuery.error || departmentsQuery.error || positionsQuery.error || managersQuery.error) && (
            <p className="form-error" role="alert">
              {employeesQuery.error instanceof Error ? employeesQuery.error.message : departmentsQuery.error instanceof Error ? departmentsQuery.error.message : positionsQuery.error instanceof Error ? positionsQuery.error.message : managersQuery.error instanceof Error ? managersQuery.error.message : 'Unable to load employee data.'}
            </p>
          )}

          {employeesQuery.isPending ? <p className="empty-state">Loading employee records…</p> : employeesQuery.isError ? null : employees.length === 0 ? (
            <p className="empty-state">{search ? 'No employees match that search.' : 'No employee records are available to this account.'}</p>
          ) : (
            <div className="employee-table-wrap">
              <table className="employee-table">
                <thead><tr><th>Employee</th><th>Department</th><th>Position</th><th>Status</th><th>Hire date</th>{canManage && <th>Contact</th>}{canManage && <th aria-label="Actions" />}</tr></thead>
                <tbody>
                  {employees.map((employee) => (
                    <tr key={employee.id}>
                      <td><strong>{employee.first_name} {employee.last_name}</strong>{canManage && <span>{employee.email}</span>}</td>
                      <td>{departmentNames.get(employee.department_id) ?? '—'}</td>
                      <td>{positionNames.get(employee.position_id) ?? '—'}</td>
                      <td><span className={`employee-status status-${employee.status}`}>{statusLabels[employee.status as Employee['status']] ?? employee.status}</span></td>
                      <td>{new Date(`${employee.hire_date}T00:00:00`).toLocaleDateString()}</td>
                      {canManage && <td>{employee.phone || '—'}</td>}
                      {canManage && <td><button className="text-button" onClick={() => openEditForm(employee)}>Edit</button></td>}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
          {totalCount > pageSize && (
            <div className="employee-pagination">
              <span>Showing {firstVisible}–{lastVisible} of {totalCount}</span>
              <div className="employee-pagination-controls">
                <button className="secondary-button" type="button" disabled={page === 0} onClick={() => setPage((current) => Math.max(0, current - 1))}>Previous</button>
                <span>Page {page + 1} of {totalPages}</span>
                <button className="secondary-button" type="button" disabled={page + 1 >= totalPages} onClick={() => setPage((current) => current + 1)}>Next</button>
              </div>
            </div>
          )}
          <p className="directory-footnote">Access to employee records is enforced by Supabase row-level security. Available fields and actions depend on your assigned role.</p>
        </section>
      </section>
    </main>
  )
}
