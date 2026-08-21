import { apiClient } from '@/lib/api-client'
import {
  EmployeeProfile,
  DocumentItem,
  AssignedAssetsResponse,
  LifecycleChecklist,
  ProfileUpdatePayload,
} from '@/types/profile'

const ALLOWED_MIME_TYPES = [
  'application/pdf',
  'image/png',
  'image/jpeg',
  'image/jpg',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
]
const MAX_FILE_SIZE_BYTES = 10 * 1024 * 1024 // 10MB

export const profileService = {
  validateDocumentFile(file: File): { valid: boolean; error?: string } {
    if (!ALLOWED_MIME_TYPES.includes(file.type)) {
      return {
        valid: false,
        error: 'Invalid file type. Only PDF, PNG, JPG, and DOCX files are permitted.',
      }
    }
    if (file.size > MAX_FILE_SIZE_BYTES) {
      return {
        valid: false,
        error: 'File size exceeds maximum allowable limit of 10MB.',
      }
    }
    return { valid: true }
  },

  /**
   * GET /employees/{id} (PRD §5.4)
   * Fetches full employee profile record with live DB values.
   */
  async getEmployeeProfile(employeeId: string): Promise<EmployeeProfile> {
    const response = await apiClient.get<EmployeeProfile>(`/employees/${employeeId}`)
    const data = response.data
    return {
      ...data,
      department: data.department_name || data.department || 'Unassigned',
      role: (data.role_name || data.role || 'employee') as EmployeeProfile['role'],
      joining_date: data.date_of_joining || data.joining_date || '',
    }
  },

  /**
   * PATCH /employees/{id} (PRD §5.4)
   * Updates employee profile details with field-level permissions.
   */
  async updateEmployeeProfile(
    employeeId: string,
    updates: ProfileUpdatePayload
  ): Promise<EmployeeProfile> {
    const response = await apiClient.patch<EmployeeProfile>(`/employees/${employeeId}`, updates)
    const data = response.data
    return {
      ...data,
      department: data.department_name || data.department || 'Unassigned',
      role: (data.role_name || data.role || 'employee') as EmployeeProfile['role'],
      joining_date: data.date_of_joining || data.joining_date || '',
    }
  },

  /**
   * GET /employees/{id}/documents (PRD §5.4)
   * Fetches document vault records for an employee.
   */
  async getEmployeeDocuments(employeeId: string): Promise<DocumentItem[]> {
    const response = await apiClient.get<DocumentItem[]>(`/employees/${employeeId}/documents`)
    return response.data.map((doc) => ({
      ...doc,
      doc_name: doc.file_name || doc.doc_name || 'Document',
    }))
  },

  /**
   * POST /employees/{id}/documents (PRD §5.4)
   * Uploads multipart document file to employee vault.
   */
  async uploadEmployeeDocument(
    employeeId: string,
    file: File,
    docType: string,
    isConfidential: boolean,
    onProgress?: (progress: number) => void
  ): Promise<DocumentItem> {
    const validation = this.validateDocumentFile(file)
    if (!validation.valid) {
      throw new Error(validation.error)
    }

    const formData = new FormData()
    formData.append('file', file)
    formData.append('doc_type', docType)
    formData.append('is_confidential', String(isConfidential))

    const response = await apiClient.post<DocumentItem>(
      `/employees/${employeeId}/documents`,
      formData,
      {
        headers: { 'Content-Type': 'multipart/form-data' },
        onUploadProgress: (progressEvent) => {
          if (progressEvent.total && onProgress) {
            const percent = Math.round((progressEvent.loaded * 100) / progressEvent.total)
            onProgress(percent)
          }
        },
      }
    )
    const data = response.data
    return {
      ...data,
      doc_name: data.file_name || data.doc_name || file.name,
    }
  },

  /**
   * DELETE /employees/{id}/documents/{docId} (PRD §5.4)
   * Removes document record from vault.
   */
  async deleteEmployeeDocument(employeeId: string, docId: string): Promise<void> {
    await apiClient.delete(`/employees/${employeeId}/documents/${docId}`)
  },

  /**
   * GET /employees/{id}/assets (PRD §5.4)
   * Fetches assigned hardware and software assets.
   */
  async getEmployeeAssets(employeeId: string): Promise<AssignedAssetsResponse> {
    const response = await apiClient.get<AssignedAssetsResponse>(`/employees/${employeeId}/assets`)
    return response.data
  },

  /**
   * GET /employees/{id}/lifecycle (PRD §5.4)
   * Fetches active lifecycle onboarding/offboarding checklist.
   */
  async getEmployeeLifecycle(employeeId: string): Promise<LifecycleChecklist | null> {
    try {
      const response = await apiClient.get<LifecycleChecklist | null>(`/employees/${employeeId}/lifecycle`)
      return response.data
    } catch {
      return null
    }
  },
}

