import {
  ChevronDownIcon,
  ExclamationTriangleIcon,
} from '@heroicons/react/24/outline'
import { AnimatePresence, motion } from 'framer-motion'
import { useEffect, useState } from 'react'
import { IoCodeSlashOutline } from 'react-icons/io5'
import { StatusIcon } from './status-icon'
import type { VerificationDocument } from '../../verifier'

type DigestType = 'SOURCE' | 'RUNTIME' | 'CODE_INTEGRITY' | 'GENERIC'

interface MeasurementData {
  measurement?: string
  certificate?: string
}

const extractMeasurement = (data: MeasurementData | string): string => {
  if (typeof data === 'string') {
    try {
      const parsed = JSON.parse(data.replace(/^\"|\"$/g, ''))
      if (parsed.registers && Array.isArray(parsed.registers) && parsed.registers.length > 0) {
        return parsed.registers[0]
      }
    } catch {}
    return data.replace(/^\"|\"$/g, '')
  }
  if (typeof data === 'object' && data?.measurement) {
    try {
      const parsed = JSON.parse(data.measurement)
      if (parsed.registers && Array.isArray(parsed.registers) && parsed.registers.length > 0) {
        return parsed.registers[0]
      }
    } catch {}
    return data.measurement
  }
  return JSON.stringify(data, null, 2)
}

function getMeasurementLabel(digestType?: DigestType): {
  title: string
  subtitle?: string
} {
  switch (digestType) {
    case 'SOURCE':
      return {
        title: 'Source Measurement',
        subtitle: 'Received from GitHub and Sigstore.',
      }
    case 'RUNTIME':
      return {
        title: 'Runtime Measurement',
        subtitle: 'Received from the enclave.',
      }
    case 'CODE_INTEGRITY':
      return {
        title: 'Security Verification',
        subtitle: 'Comparison of source and runtime measurements.',
      }
    default:
      return { title: 'Measurement' }
  }
}

const contentVariants = {
  hidden: { opacity: 0 },
  visible: { opacity: 1, transition: { delayChildren: 0.05, staggerChildren: 0.06 } },
} as const

const itemVariants = {
  hidden: { opacity: 0, y: 8 },
  visible: { opacity: 1, y: 0, transition: { duration: 0.2, ease: 'easeOut' } },
} as const

type ProcessStepProps = {
  title: string
  description: string
  status: 'pending' | 'loading' | 'success' | 'error'
  error?: string
  measurements?: MeasurementData | string
  technicalDetails?: string
  children?: React.ReactNode
  digestType?: DigestType
  githubHash?: string
  verificationDocument?: VerificationDocument
  isDarkMode?: boolean
}

export function ProcessStep({
  title,
  description,
  status,
  error,
  measurements,
  technicalDetails,
  children,
  digestType,
  githubHash,
  verificationDocument,
  isDarkMode = true,
}: ProcessStepProps) {
  const [isOpen, setIsOpen] = useState(status === 'error' || error !== undefined)

  useEffect(() => {
    if (status === 'error' || error !== undefined) {
      setIsOpen(true)
    }
  }, [status, error])

  const isRemoteAttestation = digestType === 'RUNTIME'
  const isSourceCodeVerified = digestType === 'SOURCE'

  const label = getMeasurementLabel(digestType)

  const repoForLink = verificationDocument?.configRepo
  const hashForSigstore = verificationDocument?.releaseDigest ?? githubHash

  return (
    <div
      className={`w-full rounded-lg border transition-colors @container ${
        isDarkMode ? 'border-gray-700' : 'border-gray-200 bg-white'
      }`}
    >
      <button onClick={() => setIsOpen(!isOpen)} className="w-full px-4 pb-2.5 pt-3.5 text-left">
        <div className="flex flex-row items-center gap-3 md:gap-4">
          <div className="flex items-center">
            <StatusIcon status={status} />
          </div>

          <div className="flex-1 text-center @[400px]:text-left">
            <h3 className={`text-sm font-medium ${isDarkMode ? 'text-gray-100' : 'text-gray-900'}`}>{title}</h3>
            <p className={`hidden text-sm ${isDarkMode ? 'text-gray-400' : 'text-gray-600'} @[400px]:block`}>
              {description}
            </p>
          </div>

          <motion.div
            animate={{ rotate: isOpen ? 180 : 0 }}
            transition={{ duration: 0.2, ease: 'easeOut' }}
            className={`rounded-lg p-2 ${isDarkMode ? 'hover:bg-gray-800' : 'hover:bg-gray-100'}`}
          >
            <ChevronDownIcon className={`h-5 w-5 ${isDarkMode ? 'text-gray-400' : 'text-gray-500'}`} />
          </motion.div>
        </div>
      </button>

      <AnimatePresence initial={false}>
        {isOpen ? (
          <motion.div
            key="process-step-content"
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ height: { duration: 0.3, ease: [0.25, 0.8, 0.25, 1] }, opacity: { duration: 0.2, ease: 'easeOut' } }}
            className="overflow-hidden"
          >
            <motion.div className="space-y-4 px-4 pb-4" variants={contentVariants} initial="hidden" animate="visible" exit="hidden">
              <motion.p variants={itemVariants} className={`block text-sm ${isDarkMode ? 'text-gray-400' : 'text-gray-600'} @[400px]:hidden`}>
                {description}
              </motion.p>

              {error && status === 'error' && (
                <motion.div
                  variants={itemVariants}
                  className={`flex items-start gap-2 rounded-lg transition-colors ${
                    isDarkMode ? 'bg-red-500/10' : 'bg-red-50'
                  } p-3 ${isDarkMode ? 'text-red-400' : 'text-red-600'}`}
                >
                  <ExclamationTriangleIcon className="mt-0.5 h-5 w-5 flex-shrink-0" />
                  <p className="overflow-hidden break-words text-sm">{error}</p>
                </motion.div>
              )}

              {measurements && (
                <motion.div variants={itemVariants}>
                  <div className="mb-2 flex items-start justify-between">
                    <h4 className={`text-sm font-medium ${isDarkMode ? 'text-gray-100' : 'text-gray-800'}`}>
                      {label.title}
                      {label.subtitle && (
                        <span className={`block text-xs font-normal ${isDarkMode ? 'text-gray-400' : 'text-gray-600'}`}>
                          {label.subtitle}
                        </span>
                      )}
                    </h4>
                    <div className="flex items-center gap-2">
                      {digestType === 'SOURCE' ? (
                        <IoCodeSlashOutline className={`${isDarkMode ? 'text-gray-400' : 'text-gray-600'}`} size={20} />
                      ) : digestType === 'RUNTIME' ? (
                        <span className={`${isDarkMode ? 'text-gray-400' : 'text-gray-600'} text-xs`}>CPU + GPU</span>
                      ) : null}
                    </div>
                  </div>
                  <pre
                    className={`overflow-x-auto whitespace-pre-wrap break-all rounded-lg transition-colors ${
                      isDarkMode ? 'bg-gray-700 text-gray-100' : 'bg-gray-50 text-gray-900'
                    } border p-4 text-sm ${
                      status === 'success' ? 'border-emerald-500/50' : isDarkMode ? 'border-gray-700' : 'border-gray-300'
                    }`}
                  >
                    {extractMeasurement(measurements)}
                  </pre>
                </motion.div>
              )}

              {isRemoteAttestation && (
                <motion.div variants={itemVariants} className="mt-3">
                  <h4 className={`mb-2 text-sm font-medium ${isDarkMode ? 'text-gray-100' : 'text-gray-800'}`}>Runtime attested by</h4>
                  <div className={`mt-2 flex items-center space-x-2 ${isDarkMode ? 'text-gray-400' : 'text-gray-600'}`}>
                    <a
                      href="https://docs.nvidia.com/attestation/index.html"
                      target="_blank"
                      rel="noopener noreferrer"
                      className={`inline-flex items-center gap-1 rounded-lg p-2 text-xs ${
                        isDarkMode ? 'bg-gray-700 hover:bg-gray-600' : 'bg-gray-50 hover:bg-gray-200'
                      }`}
                    >
                      NVIDIA
                    </a>
                    <a
                      href="https://www.amd.com/en/developer/sev.html"
                      target="_blank"
                      rel="noopener noreferrer"
                      className={`inline-flex items-center gap-1 rounded-lg p-2 text-xs ${
                        isDarkMode ? 'bg-gray-700 hover:bg-gray-600' : 'bg-gray-50 hover:bg-gray-200'
                      }`}
                    >
                      AMD
                    </a>
                    <a
                      href="https://www.intel.com/content/www/us/en/developer/tools/trust-domain-extensions/overview.html"
                      target="_blank"
                      rel="noopener noreferrer"
                      className={`inline-flex items-center gap-1 rounded-lg p-2 text-xs ${
                        isDarkMode ? 'bg-gray-700 hover:bg-gray-600' : 'bg-gray-50 hover:bg-gray-200'
                      }`}
                    >
                      Intel
                    </a>
                  </div>
                </motion.div>
              )}

              {isSourceCodeVerified && (
                <motion.div variants={itemVariants} className="mt-3">
                  <h4 className={`mb-2 text-sm font-medium ${isDarkMode ? 'text-gray-100' : 'text-gray-800'}`}>
                    Code integrity attested by
                  </h4>
                  <div className="mt-2 flex items-center space-x-4">
                    {repoForLink && (
                      <a
                        href={`https://github.com/${repoForLink}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className={`inline-flex items-center gap-1.5 text-sm ${
                          isDarkMode ? 'text-gray-300 hover:text-gray-100' : 'text-gray-700 hover:text-gray-900'
                        }`}
                      >
                        <span>GitHub</span>
                      </a>
                    )}
                    {hashForSigstore && (
                      <a
                        href={`https://search.sigstore.dev/?hash=${hashForSigstore}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className={`inline-flex items-center gap-1.5 text-sm ${
                          isDarkMode ? 'text-gray-300 hover:text-gray-100' : 'text-gray-700 hover:text-gray-900'
                        }`}
                      >
                        <span>Sigstore</span>
                      </a>
                    )}
                  </div>
                </motion.div>
              )}

              {children && <motion.div variants={itemVariants}>{children}</motion.div>}

              {technicalDetails && (
                <motion.div variants={itemVariants}>
                  <h4 className={`mb-2 text-sm font-medium ${isDarkMode ? 'text-gray-100' : 'text-gray-800'}`}>Technical Details</h4>
                  <p className={`text-sm ${isDarkMode ? 'text-gray-400' : 'text-gray-600'}`}>{technicalDetails}</p>
                </motion.div>
              )}
            </motion.div>
          </motion.div>
        ) : null}
      </AnimatePresence>
    </div>
  )
}

