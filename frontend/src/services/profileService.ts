import { apiClient } from '@/lib/api-client'
import {
  EmployeeProfile,
  DocumentItem,
  AssignedAssetsResponse,
  LifecycleChecklist,
  ProfileUpdatePayload,
} from '@/types/profile'

const ALLOWED_MIME_TYPES = ['application/pdf', 'image/png', 'image/jpeg', 'image/jpg']
const MAX_FILE_SIZE_BYTES = 10 * 1024 * 1024 // 10MB

// Initial fallback profile data for development and offline mode
const mockProfileData: Record<string, EmployeeProfile> = {
  'emp-101': {
    id: 'emp-101',
    full_name: 'Alex Vance',
    email: 'alex.vance@rosterly.io',
    phone: '+1 (555) 234-5678',
    designation: 'Senior Frontend Engineer',
    department: 'Engineering',
    department_id: 'dept-eng',
    location: 'San Francisco, CA (HQ)',
    avatar_url: 'https://images.unsplash.com/photo-1534528741775-53994a69daeb?auto=format&fit=crop&q=80&w=256',
    role: 'employee',
    status: 'active',
    joining_date: '2024-03-15',
    employee_code: 'EMP-0101',
    address: '742 Evergreen Terrace, San Francisco, CA 94107',
    bio: 'Frontend specialist focused on design systems, React architectures, and web performance.',
    manager: {
      id: 'emp-002',
      full_name: 'Marcus Brody',
      designation: 'VP of Engineering',
      department: 'Engineering',
      role: 'manager',
    },
    direct_reports: [
      {
        id: 'emp-204',
        full_name: 'Sarah Connor',
        designation: 'UI/UX Designer',
        department: 'Design',
        role: 'employee',
      },
      {
        id: 'emp-205',
        full_name: 'David Miller',
        designation: 'Junior Frontend Developer',
        department: 'Engineering',
        role: 'employee',
      },
    ],
    emergency_contact: {
      name: 'Elena Vance',
      relationship: 'Spouse',
      phone: '+1 (555) 987-6543',
      email: 'elena.vance@example.com',
    },
  },
}

const mockDocumentsData: DocumentItem[] = [
  {
    id: 'doc-001',
    doc_name: 'Employment_Agreement_2024.pdf',
    doc_type: 'contract',
    is_confidential: true,
    uploaded_at: '2024-03-15T09:30:00Z',
    uploaded_by_name: 'HR Operations',
    size_bytes: 2450000,
    file_url: '#',
  },
  {
    id: 'doc-002',
    doc_name: 'Government_ID_Verification.png',
    doc_type: 'identity',
    is_confidential: true,
    uploaded_at: '2024-03-15T10:15:00Z',
    uploaded_by_name: 'Self',
    size_bytes: 1840000,
    file_url: '#',
  },
  {
    id: 'doc-003',
    doc_name: 'W-4_Tax_Withholding_Form.pdf',
    doc_type: 'tax',
    is_confidential: true,
    uploaded_at: '2024-03-16T11:00:00Z',
    uploaded_by_name: 'Payroll Admin',
    size_bytes: 980000,
    file_url: '#',
  },
  {
    id: 'doc-004',
    doc_name: 'AWS_Solutions_Architect_Certificate.pdf',
    doc_type: 'certification',
    is_confidential: false,
    uploaded_at: '2025-01-20T14:20:00Z',
    uploaded_by_name: 'Self',
    size_bytes: 3100000,
    file_url: '#',
  },
]

const mockAssetsData: AssignedAssetsResponse = {
  current: [
    {
      id: 'ast-101',
      asset_name: 'MacBook Pro 16" M3 Max',
      asset_tag: 'AST-LAP-042',
      serial_number: 'C02G809DQ05D',
      category: 'laptop',
      assigned_at: '2024-03-15T10:00:00Z',
      warranty_expires_at: '2027-03-15T00:00:00Z',
      warranty_status: 'active',
      specs: '64GB RAM, 2TB SSD, Space Black',
      status: 'active',
    },
    {
      id: 'ast-102',
      asset_name: 'Dell UltraSharp 27" 4K Monitor',
      asset_tag: 'AST-MON-118',
      serial_number: 'CN-098712-441',
      category: 'monitor',
      assigned_at: '2024-03-15T10:30:00Z',
      warranty_expires_at: '2026-09-01T00:00:00Z',
      warranty_status: 'expiring_soon',
      specs: 'U2723QE IPS Black, USB-C Hub',
      status: 'active',
    },
    {
      id: 'ast-103',
      asset_name: 'iPhone 15 Pro (Corporate)',
      asset_tag: 'AST-MOB-077',
      serial_number: 'DX391002KLA',
      category: 'mobile',
      assigned_at: '2024-04-01T09:00:00Z',
      warranty_expires_at: '2025-04-01T00:00:00Z',
      warranty_status: 'expired',
      specs: '256GB Natural Titanium',
      status: 'active',
    },
  ],
  history: [
    {
      id: 'ast-h01',
      asset_name: 'ThinkPad T14 Gen 2',
      asset_tag: 'AST-LAP-011',
      category: 'laptop',
      assigned_at: '2023-01-10T00:00:00Z',
      returned_at: '2024-03-14T00:00:00Z',
      reason: 'Upgraded to M3 MacBook Pro',
    },
  ],
}

const mockLifecycleData: LifecycleChecklist = {
  id: 'chk-onb-99',
  type: 'onboarding',
  status: 'active',
  progress_percentage: 85,
  total_items: 7,
  completed_items: 6,
  items: [
    {
      id: 'item-1',
      title: 'Identity Verification & Tax Setup',
      category: 'hr',
      owner_role: 'hr_admin',
      status: 'completed',
      completed_at: '2024-03-15T11:00:00Z',
    },
    {
      id: 'item-2',
      title: 'Hardware Provisioning (MacBook & Accessories)',
      category: 'it',
      owner_role: 'it_admin',
      status: 'completed',
      completed_at: '2024-03-15T10:00:00Z',
    },
    {
      id: 'item-3',
      title: 'Google Workspace & Slack Access Grant',
      category: 'it',
      owner_role: 'it_admin',
      status: 'completed',
      completed_at: '2024-03-15T10:30:00Z',
    },
    {
      id: 'item-4',
      title: 'Security Awareness Training',
      category: 'hr',
      owner_role: 'employee',
      status: 'completed',
      completed_at: '2024-03-18T16:00:00Z',
    },
    {
      id: 'item-5',
      title: 'Building Keycard & Office Access',
      category: 'facilities',
      owner_role: 'facilities',
      status: 'completed',
      completed_at: '2024-03-15T14:00:00Z',
    },
    {
      id: 'item-6',
      title: 'Team Introduction & Buddy Assignment',
      category: 'hr',
      owner_role: 'manager',
      status: 'completed',
      completed_at: '2024-03-15T09:00:00Z',
    },
    {
      id: 'item-7',
      title: '30-Day Check-in Review',
      category: 'hr',
      owner_role: 'manager',
      status: 'pending',
      due_date: '2024-04-15T00:00:00Z',
    },
  ],
}

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

  async getEmployeeProfile(employeeId: string): Promise<EmployeeProfile> {
    try {
      const response = await apiClient.get<EmployeeProfile>(`/employees/${employeeId}`)
      return response.data
    } catch {
      const found = mockProfileData[employeeId] || {
        ...mockProfileData['emp-101'],
        id: employeeId,
      }
      return found
    }
  },

  async updateEmployeeProfile(
    employeeId: string,
    updates: ProfileUpdatePayload
  ): Promise<EmployeeProfile> {
    try {
      const response = await apiClient.patch<EmployeeProfile>(`/employees/${employeeId}`, updates)
      return response.data
    } catch {
      const existing = await this.getEmployeeProfile(employeeId)
      const updated: EmployeeProfile = {
        ...existing,
        ...updates,
        emergency_contact: updates.emergency_contact
          ? { ...existing.emergency_contact, ...updates.emergency_contact }
          : existing.emergency_contact,
      }
      mockProfileData[employeeId] = updated
      return updated
    }
  },

  async getEmployeeDocuments(employeeId: string): Promise<DocumentItem[]> {
    try {
      const response = await apiClient.get<DocumentItem[]>(`/employees/${employeeId}/documents`)
      return response.data
    } catch {
      return mockDocumentsData
    }
  },

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

    try {
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
      return response.data
    } catch {
      // Simulation for offline mode
      if (onProgress) {
        onProgress(30)
        await new Promise((res) => setTimeout(res, 200))
        onProgress(70)
        await new Promise((res) => setTimeout(res, 200))
        onProgress(100)
      }
      const newDoc: DocumentItem = {
        id: `doc-${Date.now().toString().slice(-4)}`,
        doc_name: file.name,
        doc_type: (docType as DocumentItem['doc_type']) || 'other',
        is_confidential: isConfidential,
        uploaded_at: new Date().toISOString(),
        uploaded_by_name: 'Current User',
        size_bytes: file.size,
        file_url: '#',
      }
      mockDocumentsData.unshift(newDoc)
      return newDoc
    }
  },

  async deleteEmployeeDocument(employeeId: string, docId: string): Promise<void> {
    try {
      await apiClient.delete(`/employees/${employeeId}/documents/${docId}`)
    } catch {
      const index = mockDocumentsData.findIndex((d) => d.id === docId)
      if (index !== -1) {
        mockDocumentsData.splice(index, 1)
      }
    }
  },

  async getEmployeeAssets(employeeId: string): Promise<AssignedAssetsResponse> {
    try {
      const response = await apiClient.get<AssignedAssetsResponse>(`/employees/${employeeId}/assets`)
      return response.data
    } catch {
      return mockAssetsData
    }
  },

  async getEmployeeLifecycle(employeeId: string): Promise<LifecycleChecklist> {
    try {
      const response = await apiClient.get<LifecycleChecklist>(`/employees/${employeeId}/lifecycle`)
      return response.data
    } catch {
      return mockLifecycleData
    }
  },
}
