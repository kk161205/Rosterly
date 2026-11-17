import React, { useState, useEffect } from 'react'
import { Dialog, Button, TextField, Alert } from '@/ui'
import type {
  LicenseCreate,
  LicenseItem,
  LicenseUpdate,
} from '@/features/licenses/types/licenses'

interface LicenseModalProps {
  open: boolean
  onClose: () => void
  license?: LicenseItem | null
  onSave: (payload: { isEdit: boolean; id?: string; createData?: LicenseCreate; updateData?: LicenseUpdate }) => Promise<void>
  isPending?: boolean
}

export const LicenseModal: React.FC<LicenseModalProps> = ({
  open,
  onClose,
  license,
  onSave,
  isPending,
}) => {
  const isEdit = Boolean(license)

  const [name, setName] = useState('')
  const [vendor, setVendor] = useState('')
  const [totalSeats, setTotalSeats] = useState('')
  const [costPerSeat, setCostPerSeat] = useState('')
  const [renewalDate, setRenewalDate] = useState('')
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!open) return
    if (license) {
      setName(license.name)
      setVendor(license.vendor)
      setTotalSeats(String(license.total_seats))
      setCostPerSeat(license.cost_per_seat != null ? String(license.cost_per_seat) : '')
      setRenewalDate(license.renewal_date || '')
    } else {
      setName('')
      setVendor('')
      setTotalSeats('')
      setCostPerSeat('')
      setRenewalDate('')
    }
    setError(null)
  }, [license, open])

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!name.trim()) {
      setError('Licence name is required.')
      return
    }
    if (!vendor.trim()) {
      setError('Vendor name is required.')
      return
    }

    const seatsNum = parseInt(totalSeats, 10)
    if (isNaN(seatsNum) || seatsNum <= 0) {
      setError('Total entitled seats must be a positive integer.')
      return
    }

    if (isEdit && license && seatsNum < license.seats_used) {
      setError(`Cannot reduce total seats below current assigned count (${license.seats_used} seats).`)
      return
    }

    const costNum = costPerSeat.trim() ? parseFloat(costPerSeat) : null

    try {
      if (isEdit && license) {
        await onSave({
          isEdit: true,
          id: license.id,
          updateData: {
            name: name.trim(),
            vendor: vendor.trim(),
            total_seats: seatsNum,
            cost_per_seat: costNum,
            renewal_date: renewalDate || null,
          },
        })
      } else {
        await onSave({
          isEdit: false,
          createData: {
            name: name.trim(),
            vendor: vendor.trim(),
            total_seats: seatsNum,
            cost_per_seat: costNum,
            renewal_date: renewalDate || null,
          },
        })
      }
      onClose()
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed to save software licence.')
    }
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(o) => !o && onClose()}
      title={isEdit ? 'Edit Software Licence' : 'Add Software Licence'}
      description="Track total entitled capacity and renewal schedule for enterprise software."
      busy={isPending}
      footer={
        <div className="flex w-full items-center justify-end gap-2">
          <Button variant="secondary" onClick={onClose} disabled={isPending}>
            Cancel
          </Button>
          <Button variant="primary" onClick={handleSubmit} disabled={isPending}>
            {isEdit ? 'Save Changes' : 'Add Licence'}
          </Button>
        </div>
      }
    >
      <form onSubmit={handleSubmit} className="flex flex-col gap-4 pt-2">
        {error && <Alert tone="error">{error}</Alert>}

        <TextField
          label="Licence Name"
          placeholder="e.g. Figma Professional or Microsoft 365 E3"
          value={name}
          onChange={(e) => setName(e.target.value)}
          required
        />

        <TextField
          label="Vendor"
          placeholder="e.g. Figma, Inc. or Microsoft"
          value={vendor}
          onChange={(e) => setVendor(e.target.value)}
          required
        />

        <TextField
          label="Total Entitled Seats"
          type="number"
          min={1}
          placeholder="e.g. 50"
          value={totalSeats}
          onChange={(e) => setTotalSeats(e.target.value)}
          required
        />

        <TextField
          label="Cost per Seat (₹ INR) — Optional"
          type="number"
          placeholder="e.g. 1200"
          value={costPerSeat}
          onChange={(e) => setCostPerSeat(e.target.value)}
        />

        <TextField
          label="Renewal Date — Optional"
          type="date"
          value={renewalDate}
          onChange={(e) => setRenewalDate(e.target.value)}
        />
      </form>
    </Dialog>
  )
}
