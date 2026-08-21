import React, { useState, useRef } from 'react'
import {
  FileText,
  UploadCloud,
  Download,
  Lock,
  Trash2,
  AlertCircle,
  FileCheck,
} from 'lucide-react'
import { DocumentItem, DocumentCategory } from '@/types/profile'
import { UserRole } from '@/types/dashboard'
import { profileService } from '@/services/profileService'

interface DocumentVaultTabProps {
  documents: DocumentItem[]
  currentUserRole: UserRole
  isSelf: boolean
  onUploadDocument: (
    file: File,
    docType: DocumentCategory,
    isConfidential: boolean,
    onProgress: (pct: number) => void
  ) => Promise<void>
  onDeleteDocument: (docId: string) => Promise<void>
  isLoading?: boolean
}

export const DocumentVaultTab: React.FC<DocumentVaultTabProps> = ({
  documents,
  currentUserRole,
  isSelf,
  onUploadDocument,
  onDeleteDocument,
}) => {
  const isHRAdmin = ['hr_admin', 'super_admin'].includes(currentUserRole)
  const canUpload = isSelf || isHRAdmin
  const canDelete = isHRAdmin

  const [dragOver, setDragOver] = useState(false)
  const [selectedCategory, setSelectedCategory] = useState<DocumentCategory>('contract')
  const [isConfidential, setIsConfidential] = useState(true)
  const [uploadProgress, setUploadProgress] = useState<number | null>(null)
  const [uploadError, setUploadError] = useState<string | null>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)

  // Filter out confidential docs if caller is not HR/Admin or Self
  const filteredDocuments = documents.filter((doc) => {
    if (doc.is_confidential) {
      return isSelf || isHRAdmin
    }
    return true
  })

  const formatFileSize = (bytes: number): string => {
    if (bytes < 1024) return `${bytes} B`
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
  }

  const handleFileDrop = async (files: FileList | null) => {
    if (!files || files.length === 0) return
    const file = files[0]
    setUploadError(null)

    const validation = profileService.validateDocumentFile(file)
    if (!validation.valid) {
      setUploadError(validation.error || 'Invalid file')
      return
    }

    try {
      setUploadProgress(0)
      await onUploadDocument(file, selectedCategory, isConfidential, (pct) => {
        setUploadProgress(pct)
      })
    } catch (err) {
      setUploadError(err instanceof Error ? err.message : 'Upload failed')
    } finally {
      setUploadProgress(null)
    }
  }

  return (
    <div className="space-y-6">
      {/* Top Header & Drag Drop Upload Zone */}
      {canUpload && (
        <div className="bg-surface-container-lowest border border-outline-variant rounded-lg p-6 shadow-sm">
          <div className="flex items-center justify-between border-b border-outline-variant pb-3 mb-4">
            <h2 className="text-sm font-headline font-semibold text-on-surface flex items-center gap-2">
              <UploadCloud className="w-4 h-4 text-accent" />
              Upload Document to Vault
            </h2>
            <span className="text-[11px] font-mono text-outline">
              Accepted: PDF, PNG, JPG (Max 10MB)
            </span>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 mb-4">
            <div>
              <label className="block text-xs font-medium text-on-surface mb-1">
                Document Category
              </label>
              <select
                value={selectedCategory}
                onChange={(e) => setSelectedCategory(e.target.value as DocumentCategory)}
                className="w-full px-3 py-2 text-xs font-body bg-surface-container-low border border-outline-variant rounded-sm text-on-surface focus:outline-none focus:border-accent"
              >
                <option value="contract">Contract & Offer Letter</option>
                <option value="identity">Identity Verification (Passport/DL)</option>
                <option value="tax">Tax & Financial Forms</option>
                <option value="certification">Professional Certification</option>
                <option value="other">General / Other</option>
              </select>
            </div>

            <div className="flex items-end">
              <label className="inline-flex items-center gap-2 text-xs font-medium text-on-surface cursor-pointer mb-2">
                <input
                  type="checkbox"
                  checked={isConfidential}
                  onChange={(e) => setIsConfidential(e.target.checked)}
                  className="rounded border-outline-variant text-accent focus:ring-accent"
                />
                <Lock className="w-3.5 h-3.5 text-amber-600" />
                Mark as Confidential (Restricted to Self & HR)
              </label>
            </div>
          </div>

          {/* Drag & Drop Box */}
          <div
            onDragOver={(e) => {
              e.preventDefault()
              setDragOver(true)
            }}
            onDragLeave={() => setDragOver(false)}
            onDrop={(e) => {
              e.preventDefault()
              setDragOver(false)
              handleFileDrop(e.dataTransfer.files)
            }}
            onClick={() => fileInputRef.current?.click()}
            className={`p-6 border-2 border-dashed rounded-lg flex flex-col items-center justify-center cursor-pointer transition-all ${
              dragOver
                ? 'border-accent bg-accent-container/20'
                : 'border-outline-variant/80 bg-surface-container-low/40 hover:bg-surface-container-low hover:border-accent/50'
            }`}
          >
            <input
              type="file"
              ref={fileInputRef}
              onChange={(e) => handleFileDrop(e.target.files)}
              accept=".pdf,.png,.jpg,.jpeg"
              className="hidden"
            />
            <UploadCloud className="w-8 h-8 text-accent mb-2" />
            <p className="text-xs font-body text-on-surface font-medium">
              Drag & drop files here, or <span className="text-accent underline">browse</span>
            </p>
            <p className="text-[11px] font-body text-outline mt-1">
              Supports confidential encryption & secure cloud vault storage
            </p>
          </div>

          {/* Upload Progress Bar */}
          {uploadProgress !== null && (
            <div className="mt-4 p-3 bg-accent-container/20 rounded border border-accent/30 space-y-1">
              <div className="flex justify-between text-xs font-mono text-on-accent-container">
                <span>Uploading document...</span>
                <span>{uploadProgress}%</span>
              </div>
              <div className="w-full h-2 bg-surface-container-high rounded-full overflow-hidden">
                <div
                  className="h-full bg-accent transition-all duration-300"
                  style={{ width: `${uploadProgress}%` }}
                />
              </div>
            </div>
          )}

          {uploadError && (
            <div className="mt-3 p-3 bg-error-container/40 border border-error/30 rounded text-xs text-on-error-container flex items-center gap-2">
              <AlertCircle className="w-4 h-4 text-error flex-shrink-0" />
              <span>{uploadError}</span>
            </div>
          )}
        </div>
      )}

      {/* Document Vault Table */}
      <div className="bg-surface-container-lowest border border-outline-variant rounded-lg overflow-hidden shadow-sm">
        <div className="px-6 py-4 border-b border-outline-variant flex items-center justify-between bg-surface-container-low">
          <h3 className="text-sm font-headline font-semibold text-on-surface flex items-center gap-2">
            <FileText className="w-4 h-4 text-tertiary" />
            Vault Documents ({filteredDocuments.length})
          </h3>
          <span className="text-[11px] font-mono text-outline">Compliance Records</span>
        </div>

        {filteredDocuments.length === 0 ? (
          /* Empty State */
          <div className="p-12 flex flex-col items-center justify-center text-center space-y-3">
            <div className="w-12 h-12 rounded-full bg-surface-container-high/60 flex items-center justify-center text-outline">
              <FileText className="w-6 h-6" />
            </div>
            <h4 className="text-sm font-headline font-semibold text-on-surface">
              No documents uploaded yet
            </h4>
            <p className="text-xs font-body text-on-surface-variant max-w-sm">
              Upload compliance documents, contracts, identity proofs, or certifications to store them securely in the employee vault.
            </p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs font-body">
              <thead className="bg-surface-container border-b border-outline-variant text-outline font-mono text-[11px] uppercase tracking-wider">
                <tr>
                  <th className="px-6 py-3">Document Name</th>
                  <th className="px-6 py-3">Category</th>
                  <th className="px-6 py-3">Confidentiality</th>
                  <th className="px-6 py-3">Uploaded</th>
                  <th className="px-6 py-3">Size</th>
                  <th className="px-6 py-3 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-outline-variant/60 text-on-surface">
                {filteredDocuments.map((doc) => (
                  <tr key={doc.id} className="hover:bg-surface-container-low/70 transition-colors">
                    <td className="px-6 py-4 font-medium flex items-center gap-2.5">
                      <FileCheck className="w-4 h-4 text-accent flex-shrink-0" />
                      <span className="truncate max-w-xs">{doc.doc_name}</span>
                    </td>
                    <td className="px-6 py-4">
                      <span className="px-2 py-0.5 rounded text-[11px] font-mono bg-surface-container text-on-surface-variant capitalize">
                        {doc.doc_type}
                      </span>
                    </td>
                    <td className="px-6 py-4">
                      {doc.is_confidential ? (
                        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-mono bg-amber-100 text-amber-900 border border-amber-300">
                          <Lock className="w-3 h-3 text-amber-700" />
                          Confidential
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-mono bg-surface-container text-outline">
                          Standard
                        </span>
                      )}
                    </td>
                    <td className="px-6 py-4 text-on-surface-variant">
                      {new Date(doc.uploaded_at).toLocaleDateString()}
                    </td>
                    <td className="px-6 py-4 font-mono text-outline">
                      {formatFileSize(doc.size_bytes || 0)}
                    </td>
                    <td className="px-6 py-4 text-right space-x-2">
                      <a
                        href={doc.file_url}
                        download
                        className="inline-flex items-center gap-1 px-2.5 py-1 rounded text-xs font-medium text-accent bg-accent-container/30 hover:bg-accent-container transition-colors"
                      >
                        <Download className="w-3.5 h-3.5" />
                        Download
                      </a>
                      {canDelete && (
                        <button
                          onClick={() => onDeleteDocument(doc.id)}
                          className="p-1 rounded text-error hover:bg-error-container/40 transition-colors"
                          title="Delete Document"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  )
}
