export type ChainRequestType = 'asset_request' | 'access_request' | 'it_ticket' | 'other'

export interface ChainStepInput {
  step_order: number
  approver_role_id: string
}

export interface ChainStepResponse {
  step_order: number
  approver_role_id: string
  approver_role_name: string
}

export interface ChainTemplateResponse {
  id: string
  request_type: ChainRequestType
  name: string
  min_amount: number | null
  is_active: boolean
  steps: ChainStepResponse[]
  pending_request_count: number
  created_at: string
  updated_at: string
  warning?: string | null
}

export interface ChainTemplateListResponse {
  templates: ChainTemplateResponse[]
}

export interface ChainTemplateCreate {
  request_type: ChainRequestType
  name: string
  min_amount?: number | null
  steps: ChainStepInput[]
}

export interface ChainTemplateUpdate {
  name: string
  min_amount?: number | null
  is_active: boolean
  steps: ChainStepInput[]
}
