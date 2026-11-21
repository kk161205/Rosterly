import { apiClient } from '@/lib/api-client'
import axios from 'axios'
import {
  EmployeeProfile,
  DocumentItem,
  AssignedAssetsResponse,
  LifecycleChecklist,
  ProfileUpdatePayload,
} from '@/features/employees/types/profile'

// PDF, PNG, JPG only..docx was previously accepted
// here (and by the backend) in violation of the documented constraint.
const ALLOWED_MIME_TYPES = [
  'application/pdf',
  'image/png',
  'image/jpeg',
  'image/jpg',
]
const MAX_FILE_SIZE_BYTES = 10 * 1024 * 1024 // 10MB

export const profileService = {
  validateDocumentFile(file: File): { valid: boolean; error?: string } {
    if (!ALLOWED_MIME_TYPES.includes(file.type)) {
      return {
        valid: false,
        error: 'Invalid file type. Only PDF, PNG, and JPG files are permitted.',
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
   * GET /employees/{id}
   * Fetches full employee profile record with live DB values.
   */
  async getEmployeeProfile(employeeId: string): Promise<EmployeeProfile> {
    const response = await apiClient.get<EmployeeProfile>(`/employees/${employeeId}`)
    return response.data
  },

  /**
   * PATCH /employees/{id}
   * Updates employee profile details with field-level permissions.
   */
  async updateEmployeeProfile(
    employeeId: string,
    updates: ProfileUpdatePayload
  ): Promise<EmployeeProfile> {
    const response = await apiClient.patch<EmployeeProfile>(`/employees/${employeeId}`, updates)
    return response.data
  },

  /**
   * GET /employees/{id}/documents
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
   * POST /employees/{id}/documents
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
   * DELETE /employees/{id}/documents/{docId}
   * Removes document record from vault.
   */
  /**
   * Downloads a document through the authenticated API (the file can't be
   * linked to directly — the request must carry the session) and saves it.
   */
  async downloadEmployeeDocument(fileUrl: string, fileName: string): Promise<void> {
    const response = await apiClient.get<Blob>(fileUrl, { responseType: 'blob' })
    const url = URL.createObjectURL(response.data)
    const link = document.createElement('a')
    link.href = url
    link.download = fileName
    document.body.appendChild(link)
    link.click()
    link.remove()
    setTimeout(() => URL.revokeObjectURL(url), 1000)
  },

  async deleteEmployeeDocument(employeeId: string, docId: string): Promise<void> {
    await apiClient.delete(`/employees/${employeeId}/documents/${docId}`)
  },

  /**
   * GET /employees/{id}/assets
   * Fetches assigned hardware and software assets.
   */
  async getEmployeeAssets(employeeId: string): Promise<AssignedAssetsResponse> {
    const response = await apiClient.get<AssignedAssetsResponse>(`/employees/${employeeId}/assets`)
    return response.data
  },

  /**
   * GET /employees/{id}/lifecycle
   * Fetches active lifecycle onboarding/offboarding checklist.
   */
  async getEmployeeLifecycle(employeeId: string): Promise<LifecycleChecklist | null> {
    try {
      const response = await apiClient.get<LifecycleChecklist | null>(`/employees/${employeeId}/lifecycle`)
      return response.data
    } catch (err) {
      if (axios.isAxiosError(err) && err.response?.status === 404) return null
      throw err
    }
  },
}

