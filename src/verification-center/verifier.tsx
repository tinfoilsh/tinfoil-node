'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import { AiOutlineLoading3Quarters } from 'react-icons/ai'
import { FaGithub } from 'react-icons/fa'
import { LuExternalLink, LuRefreshCcwDot } from 'react-icons/lu'
import {
  clearVerificationCache,
  loadVerifier,
  type VerificationState as RunnerState,
} from '../verification-runner'
import type { VerificationDocument } from '../verifier'
import { isRealBrowser } from '../env'
import { CollapsibleFlowDiagram, VerificationFlow } from './flow'
import { MeasurementDiff, ProcessStep } from './steps'
import VerificationStatus from './verification-status'

type VerifierProps = {
  isDarkMode?: boolean
  flowDiagramExpanded?: boolean
  onFlowDiagramToggle?: () => void
  showVerificationFlow?: boolean
  verificationDocument?: VerificationDocument
}

type VerificationStatusType = 'error' | 'pending' | 'loading' | 'success'

interface MeasurementData {
  measurement?: string
  certificate?: string
}

type VerificationState = {
  code: {
    status: VerificationStatusType
    measurements?: MeasurementData
    error?: string
  }
  runtime: {
    status: VerificationStatusType
    measurements?: MeasurementData
    error?: string
  }
  security: {
    status: VerificationStatusType
    error?: string
  }
}

type VerificationStepKey =
  | 'CODE_INTEGRITY'
  | 'REMOTE_ATTESTATION'
  | 'CODE_CONSISTENCY'

const VERIFICATION_STEPS = {
  REMOTE_ATTESTATION: {
    base: 'Enclave Attestation Verification',
    loading: 'Fetching Enclave Attestation...',
    success: 'Enclave Attestation Verified',
    key: 'REMOTE_ATTESTATION' as VerificationStepKey,
  },
  CODE_INTEGRITY: {
    base: 'Source Code Verification',
    loading: 'Fetching Source Code...',
    success: 'Source Code Verified',
    key: 'CODE_INTEGRITY' as VerificationStepKey,
  },
  CODE_CONSISTENCY: {
    base: 'Security Verification',
    loading: 'Checking Measurements...',
    success: 'Security Verified',
    key: 'CODE_CONSISTENCY' as VerificationStepKey,
  },
} as const

const getStepTitle = (
  stepKey: VerificationStepKey,
  status: VerificationStatusType,
) => {
  const step = VERIFICATION_STEPS[stepKey]

  switch (status) {
    case 'loading':
      return step.loading
    case 'success':
      return step.success
    default:
      return step.base
  }
}

function mapRunnerStateToUiState(s: RunnerState): VerificationState {
  const securityStatus =
    s.verification.status === 'success'
      ? s.verification.securityVerified
        ? 'success'
        : 'error'
      : (s.verification.status as VerificationStatusType)

  return {
    code: {
      status: s.code.status as VerificationStatusType,
      measurements: s.code.measurement
        ? { measurement: JSON.stringify(s.code.measurement) }
        : undefined,
      error: s.code.status === 'error' ? s.code.error : undefined,
    },
    runtime: {
      status: s.runtime.status as VerificationStatusType,
      measurements: s.runtime.measurement
        ? {
            measurement: JSON.stringify(s.runtime.measurement),
            certificate: s.runtime.tlsPublicKeyFingerprint,
          }
        : undefined,
      error: s.runtime.status === 'error' ? s.runtime.error : undefined,
    },
    security: {
      status: securityStatus as VerificationStatusType,
      error:
        s.verification.status === 'error'
          ? s.verification.error
          : !s.verification.securityVerified &&
              s.verification.status === 'success'
            ? 'Code and runtime measurements do not match.'
            : undefined,
    },
  }
}

export function VerificationCenter({
  isDarkMode = true,
  flowDiagramExpanded,
  onFlowDiagramToggle,
  showVerificationFlow = true,
  verificationDocument,
}: VerifierProps) {
  if (!isRealBrowser()) {
    throw new Error(
      'VerificationCenter is browser-only (React + DOM). Use headless verification helpers in Node: loadVerifier(), Verifier, or TinfoilAI.getVerificationDocument().',
    )
  }

  const [optimisticVerifying, setOptimisticVerifying] = useState(true)
  const [isSafari, setIsSafari] = useState(false)
  const [digest, setDigest] = useState<string | null>(null)

  const [verificationState, setVerificationState] = useState<VerificationState>(
    {
      code: {
        status: 'pending' as VerificationStatusType,
        measurements: undefined,
        error: undefined,
      },
      runtime: {
        status: 'pending' as VerificationStatusType,
        measurements: undefined,
        error: undefined,
      },
      security: {
        status: 'pending' as VerificationStatusType,
        error: undefined,
      },
    },
  )

  const flowStatus = useMemo<'idle' | 'verifying' | 'success' | 'error'>(() => {
    const isAnyLoading =
      verificationState.code.status === 'loading' ||
      verificationState.runtime.status === 'loading' ||
      verificationState.security.status === 'loading'

    const isAnyError =
      verificationState.code.status === 'error' ||
      verificationState.runtime.status === 'error' ||
      verificationState.security.status === 'error'

    const isAllSuccess =
      verificationState.code.status === 'success' &&
      verificationState.runtime.status === 'success' &&
      verificationState.security.status === 'success'

    if (isAnyLoading) return 'verifying'
    if (isAllSuccess) return 'success'
    if (isAnyError) return 'error'
    return 'idle'
  }, [verificationState])

  const isCurrentlyVerifying = useMemo(
    () => optimisticVerifying || flowStatus === 'verifying',
    [optimisticVerifying, flowStatus],
  )

  const verifyAll = useCallback(async (forceRefresh = false) => {
    setOptimisticVerifying(true)

    if (forceRefresh) {
      clearVerificationCache()
    }

    const v = await loadVerifier()
    let hasReceivedUpdate = false

    try {
      await v.runVerification({
        onUpdate: (s: RunnerState) => {
          hasReceivedUpdate = true
          setDigest(s.releaseDigest || null)
          const uiState = mapRunnerStateToUiState(s)
          setVerificationState(uiState)
        },
      })

      if (!hasReceivedUpdate) {
        clearVerificationCache()
        await v.runVerification({
          onUpdate: (s: RunnerState) => {
            setDigest(s.releaseDigest || null)
            const uiState = mapRunnerStateToUiState(s)
            setVerificationState(uiState)
          },
        })
      }
    } finally {
      setOptimisticVerifying(false)
    }
  }, [])

  useEffect(() => {
    if (verificationDocument) {
      setOptimisticVerifying(false)
      setDigest(verificationDocument.releaseDigest || null)

      const uiState: VerificationState = {
        code: {
          status: 'success',
          measurements: verificationDocument.codeMeasurement
            ? {
                measurement: JSON.stringify(
                  verificationDocument.codeMeasurement,
                ),
              }
            : undefined,
          error: undefined,
        },
        runtime: {
          status: 'success',
          measurements: verificationDocument.enclaveMeasurement?.measurement
            ? {
                measurement: JSON.stringify(
                  verificationDocument.enclaveMeasurement.measurement,
                ),
                certificate:
                  verificationDocument.enclaveMeasurement
                    .tlsPublicKeyFingerprint,
              }
            : undefined,
          error: undefined,
        },
        security: {
          status: verificationDocument.match ? 'success' : 'error',
          error: verificationDocument.match
            ? undefined
            : 'Code and runtime measurements do not match.',
        },
      }
      setVerificationState(uiState)
      return
    }

    void verifyAll()
  }, [verifyAll, verificationDocument])

  useEffect(() => {
    const isSafariCheck = () => {
      const ua = navigator.userAgent.toLowerCase()
      const isSafariMobile = ua.includes('safari') && ua.includes('mobile')
      const isIOS = /iphone|ipad|ipod/.test(ua)
      return (isSafariMobile || isIOS) && !ua.includes('chrome')
    }

    setIsSafari(isSafariCheck())
  }, [])

  return (
    <div
      className={`flex h-full w-full flex-col ${isDarkMode ? 'bg-gray-900' : 'bg-white'}`}
      style={{ fontFamily: 'inherit' }}
    >
      <div className="flex-none">
        <VerificationStatus
          verificationState={verificationState}
          isDarkMode={isDarkMode}
        />
      </div>

      <div
        className={`relative w-full flex-1 overflow-y-auto ${isDarkMode ? 'bg-gray-900' : 'bg-white'}`}
        style={{
          scrollbarGutter: 'stable',
          overscrollBehavior: 'contain',
          WebkitOverflowScrolling: 'touch',
        }}
      >
        <div
          className={`px-3 py-3 sm:px-4 sm:py-4 ${isDarkMode ? 'bg-gray-900' : 'bg-white'}`}
        >
          <div className="mb-3">
            <h3
              className={`text-sm font-medium ${isDarkMode ? 'text-gray-100' : 'text-gray-900'}`}
              style={{ fontFamily: 'inherit' }}
            >
              Secure Enclave Verifier
            </h3>
          </div>

          <p
            className={`text-sm ${isDarkMode ? 'text-gray-400' : 'text-gray-600'}`}
          >
            This automated verification tool lets you independently confirm that
            the models are running in secure enclaves, ensuring your
            conversations remain completely private{' '}
            <a
              href="https://docs.tinfoil.sh/verification/attestation-architecture"
              target="_blank"
              rel="noopener noreferrer"
              className={`inline-flex items-center gap-1 hover:underline ${
                isDarkMode
                  ? 'text-accent hover:text-accent/80'
                  : 'text-emerald-600 hover:text-emerald-700'
              }`}
            >
              Attestation architecture
              <LuExternalLink className="h-3.5 w-3.5" />
            </a>
          </p>

          <div className="my-6">
            <div className="flex items-start gap-3">
              <button
                onClick={() => {
                  if (!isCurrentlyVerifying) {
                    void verifyAll(true)
                  }
                }}
                disabled={isCurrentlyVerifying}
                className={`flex items-center justify-center gap-2 whitespace-nowrap rounded-md border px-4 py-2 text-sm font-medium transition-colors ${
                  isDarkMode
                    ? 'border-border-strong bg-surface-chat text-content-primary hover:bg-surface-chat/80 disabled:cursor-not-allowed disabled:text-content-muted disabled:hover:bg-surface-chat'
                    : 'border-gray-300 bg-white text-gray-700 hover:bg-gray-50 disabled:cursor-not-allowed disabled:text-gray-400 disabled:hover:bg-white'
                }`}
                style={{ minWidth: '140px', maxWidth: '180px' }}
              >
                {isCurrentlyVerifying ? (
                  <AiOutlineLoading3Quarters className="h-4 w-4 animate-spin" />
                ) : (
                  <LuRefreshCcwDot className="h-4 w-4" />
                )}
                {isCurrentlyVerifying ? 'Verifying...' : 'Verify Again'}
              </button>

              <button
                onClick={() =>
                  window.open(
                    'https://github.com/tinfoilsh/verifier/',
                    '_blank',
                    'noopener,noreferrer',
                  )
                }
                className={`flex items-center justify-center gap-2 whitespace-nowrap rounded-md border px-4 py-2 text-sm font-medium transition-colors ${
                  isDarkMode
                    ? 'border-border-strong bg-surface-chat text-content-primary hover:bg-surface-chat/80'
                    : 'border-gray-300 bg-white text-gray-700 hover:bg-gray-50'
                }`}
                style={{ minWidth: '120px', maxWidth: '160px' }}
              >
                <FaGithub className="h-4 w-4" />
                View Code
              </button>
            </div>
          </div>
        </div>

        <div className="space-y-3 px-3 pb-6 sm:space-y-4 sm:px-4">
          {showVerificationFlow && (
            <CollapsibleFlowDiagram
              isDarkMode={isDarkMode}
              isExpanded={flowDiagramExpanded}
              onToggle={onFlowDiagramToggle}
            >
              <VerificationFlow
                isDarkMode={isDarkMode}
                verificationStatus={flowStatus}
              />
            </CollapsibleFlowDiagram>
          )}

          <ProcessStep
            title={getStepTitle(
              'REMOTE_ATTESTATION',
              verificationState.runtime.status,
            )}
            description="Verifies the secure hardware environment. The response consists of a signed measurement by a combination of NVIDIA, AMD, and Intel certifying the enclave environment and the digest of the binary (i.e., code) actively running inside it."
            status={verificationState.runtime.status}
            error={verificationState.runtime.error}
            measurements={verificationState.runtime.measurements}
            digestType="RUNTIME"
            isDarkMode={isDarkMode}
          />

          <ProcessStep
            title={getStepTitle(
              'CODE_INTEGRITY',
              verificationState.code.status,
            )}
            description="Verifies that the source code published publicly by Tinfoil on GitHub was correctly built through GitHub Actions and that the resulting binary is available on the Sigstore transparency log."
            status={verificationState.code.status}
            error={verificationState.code.error}
            measurements={verificationState.code.measurements}
            digestType="SOURCE"
            verificationDocument={verificationDocument}
            githubHash={digest || undefined}
            isDarkMode={isDarkMode}
          />

          <ProcessStep
            title={getStepTitle(
              'CODE_CONSISTENCY',
              verificationState.security.status,
            )}
            description="Verifies that the binary built from the source code matches the binary running in the secure enclave by comparing digests from the enclave and the committed digest from the transparency log."
            status={verificationState.security.status}
            error={verificationState.security.error}
            digestType="CODE_INTEGRITY"
            isDarkMode={isDarkMode}
          >
            {verificationState.code.measurements &&
              verificationState.runtime.measurements && (
                <MeasurementDiff
                  sourceMeasurements={verificationState.code.measurements}
                  runtimeMeasurements={verificationState.runtime.measurements}
                  isVerified={verificationState.security.status === 'success'}
                  isDarkMode={isDarkMode}
                />
              )}
          </ProcessStep>
        </div>
        {isSafari && <div className="h-[30px]" aria-hidden="true" />}
      </div>
    </div>
  )
}
