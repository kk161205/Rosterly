import React, { useState } from 'react';
import { X, Send, AlertTriangle } from 'lucide-react';
import type { RequestType, RequestPriority, CreateRequestPayload } from '../../types/requests';

interface NewRequestModalProps {
  isOpen: boolean;
  initialType?: RequestType;
  onClose: () => void;
  onSubmit: (payload: CreateRequestPayload) => Promise<void>;
}

export const NewRequestModal: React.FC<NewRequestModalProps> = ({
  isOpen,
  initialType = 'hardware',
  onClose,
  onSubmit,
}) => {
  const [requestType, setRequestType] = useState<RequestType>(initialType);
  const [title, setTitle] = useState('');
  const [priority, setPriority] = useState<RequestPriority>('medium');
  const [justification, setJustification] = useState('');
  const [estimatedCost, setEstimatedCost] = useState<string>('');
  const [requiredByDate, setRequiredByDate] = useState<string>('');
  const [department, setDepartment] = useState('Engineering');
  const [additionalNotes, setAdditionalNotes] = useState('');

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!isOpen) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim() || !justification.trim()) {
      setError('Please provide a title and business justification.');
      return;
    }

    try {
      setLoading(true);
      setError(null);

      const payload: CreateRequestPayload = {
        title: title.trim(),
        request_type: requestType,
        priority,
        justification: justification.trim(),
        department,
        estimated_cost: estimatedCost ? parseFloat(estimatedCost) : undefined,
        required_by_date: requiredByDate || undefined,
        specifications: {
          notes: additionalNotes.trim(),
        },
      };

      await onSubmit(payload);
      onClose();
    } catch (err: any) {
      setError(err?.response?.data?.detail || err?.message || 'Failed to submit request');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-background/80 backdrop-blur-sm">
      <div className="relative w-full max-w-2xl bg-card border border-border rounded-2xl shadow-2xl overflow-hidden animate-in fade-in zoom-in-95 duration-200">
        {/* Header */}
        <div className="p-6 border-b border-border flex items-center justify-between bg-muted/20">
          <div>
            <h2 className="text-xl font-bold text-foreground">Submit New IT & Asset Request</h2>
            <p className="text-xs text-muted-foreground mt-0.5">
              Submit your request into the automated approval matrix.
            </p>
          </div>
          <button
            onClick={onClose}
            className="p-2 rounded-lg text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Form Body */}
        <form onSubmit={handleSubmit} className="p-6 space-y-4 max-h-[75vh] overflow-y-auto">
          {error && (
            <div className="p-3.5 rounded-xl bg-destructive/10 border border-destructive/20 text-destructive text-xs flex items-center gap-2">
              <AlertTriangle className="w-4 h-4 shrink-0" />
              <span>{error}</span>
            </div>
          )}

          {/* Type and Priority */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-semibold text-foreground mb-1.5">
                Request Category
              </label>
              <select
                value={requestType}
                onChange={(e) => setRequestType(e.target.value as RequestType)}
                className="w-full px-3.5 py-2.5 rounded-xl border border-input bg-background text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary capitalize"
              >
                <option value="hardware">Hardware Procurement</option>
                <option value="software">Software & Cloud License</option>
                <option value="maintenance">Asset Repair / Maintenance</option>
                <option value="transfer">Custody / Dept Transfer</option>
                <option value="other">General Service Request</option>
              </select>
            </div>

            <div>
              <label className="block text-xs font-semibold text-foreground mb-1.5">
                Urgency / Priority
              </label>
              <select
                value={priority}
                onChange={(e) => setPriority(e.target.value as RequestPriority)}
                className="w-full px-3.5 py-2.5 rounded-xl border border-input bg-background text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary capitalize"
              >
                <option value="low">Low (Standard fulfillment)</option>
                <option value="medium">Medium (Standard business workflow)</option>
                <option value="high">High (Time sensitive / blocked work)</option>
                <option value="urgent">Urgent (Mission critical / emergency)</option>
              </select>
            </div>
          </div>

          {/* Title */}
          <div>
            <label className="block text-xs font-semibold text-foreground mb-1.5">
              Request Title <span className="text-destructive">*</span>
            </label>
            <input
              type="text"
              required
              placeholder="e.g. MacBook Pro 16 M3 Max for Senior Mobile Lead"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              className="w-full px-3.5 py-2.5 rounded-xl border border-input bg-background text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary"
            />
          </div>

          {/* Department & Cost */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <div>
              <label className="block text-xs font-semibold text-foreground mb-1.5">
                Department
              </label>
              <select
                value={department}
                onChange={(e) => setDepartment(e.target.value)}
                className="w-full px-3.5 py-2.5 rounded-xl border border-input bg-background text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary"
              >
                <option value="Engineering">Engineering</option>
                <option value="Design">Design</option>
                <option value="Product">Product</option>
                <option value="Sales">Sales</option>
                <option value="Marketing">Marketing</option>
                <option value="HR & Operations">HR & Operations</option>
                <option value="Finance">Finance</option>
              </select>
            </div>

            <div>
              <label className="block text-xs font-semibold text-foreground mb-1.5">
                Estimated Cost ($ USD)
              </label>
              <input
                type="number"
                min="0"
                step="0.01"
                placeholder="e.g. 2499.00"
                value={estimatedCost}
                onChange={(e) => setEstimatedCost(e.target.value)}
                className="w-full px-3.5 py-2.5 rounded-xl border border-input bg-background text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-foreground mb-1.5">
                Required By
              </label>
              <input
                type="date"
                value={requiredByDate}
                onChange={(e) => setRequiredByDate(e.target.value)}
                className="w-full px-3.5 py-2.5 rounded-xl border border-input bg-background text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary"
              />
            </div>
          </div>

          {/* Justification */}
          <div>
            <label className="block text-xs font-semibold text-foreground mb-1.5">
              Business Justification <span className="text-destructive">*</span>
            </label>
            <textarea
              required
              rows={3}
              placeholder="Explain why this equipment/license is required, current bottlenecks, or project relevance..."
              value={justification}
              onChange={(e) => setJustification(e.target.value)}
              className="w-full px-3.5 py-2.5 rounded-xl border border-input bg-background text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary resize-none"
            />
          </div>

          {/* Technical Specs & Notes */}
          <div>
            <label className="block text-xs font-semibold text-foreground mb-1.5">
              Technical Specifications & Preferences (Optional)
            </label>
            <textarea
              rows={2}
              placeholder="e.g. 36GB RAM, 1TB SSD, Space Black, US Keyboard layout..."
              value={additionalNotes}
              onChange={(e) => setAdditionalNotes(e.target.value)}
              className="w-full px-3.5 py-2.5 rounded-xl border border-input bg-background text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary resize-none"
            />
          </div>

          {/* Actions */}
          <div className="pt-4 border-t border-border flex items-center justify-end gap-3">
            <button
              type="button"
              onClick={onClose}
              disabled={loading}
              className="px-4 py-2.5 rounded-xl border border-border text-sm font-medium text-foreground hover:bg-muted transition-colors disabled:opacity-50"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={loading}
              className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl bg-primary text-primary-foreground text-sm font-semibold hover:bg-primary/90 transition-all shadow-md active:scale-95 disabled:opacity-50"
            >
              {loading ? (
                <div className="w-4 h-4 border-2 border-primary-foreground border-t-transparent rounded-full animate-spin" />
              ) : (
                <Send className="w-4 h-4" />
              )}
              {loading ? 'Submitting...' : 'Submit Request'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
