import { apiClient } from '@/lib/api-client';
import type {
  ApprovalQueueItem,
  ApprovalActionPayload,
  BulkApprovalPayload,
} from '../types/approvals';

export const approvalsService = {
  /**
   * Fetches pending approval items assigned to the current user's role.
   */
  async getApprovalQueue(): Promise<ApprovalQueueItem[]> {
    const response = await apiClient.get<ApprovalQueueItem[]>('/approvals/queue');
    return response.data;
  },

  /**
   * Approves a single workflow step.
   */
  async approveStep(stepId: string | number, comments?: string): Promise<{ success: boolean }> {
    const payload: ApprovalActionPayload = { comments };
    const response = await apiClient.post<{ success: boolean }>(
      `/approvals/${stepId}/approve`,
      payload
    );
    return response.data;
  },

  /**
   * Rejects a single workflow step.
   */
  async rejectStep(stepId: string | number, comments: string): Promise<{ success: boolean }> {
    const payload: ApprovalActionPayload = { comments };
    const response = await apiClient.post<{ success: boolean }>(
      `/approvals/${stepId}/reject`,
      payload
    );
    return response.data;
  },

  /**
   * Performs bulk approvals across selected items.
   */
  async bulkApprove(
    stepIds: Array<string | number>,
    comments?: string
  ): Promise<{ processed_count: number }> {
    const payload: BulkApprovalPayload = {
      step_ids: stepIds,
      action: 'approve',
      comments,
    };
    const response = await apiClient.post<{ processed_count: number }>(
      '/approvals/bulk',
      payload
    );
    return response.data;
  },
};
